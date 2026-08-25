from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

from app.agent.limiter import load_config, pick_model, record_call, workhorse_exhausted
from app.db import execute, fetchone
from app.paths import GEMINI_KEY_FILE

_client = None


def _api_key() -> str | None:
    if not GEMINI_KEY_FILE.exists():
        return None
    text = GEMINI_KEY_FILE.read_text(encoding="utf-8").strip()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            return line.split("=", 1)[1].strip().strip('"')
        return line
    return None


def get_client():
    global _client
    if _client is not None:
        return _client
    key = _api_key()
    if not key:
        return None
    from google import genai

    _client = genai.Client(api_key=key)
    return _client


def prompt_hash(
    role: str,
    payload: dict[str, Any] | None = None,
    *,
    system: str = "",
    user: str = "",
    model: str = "",
    config: dict[str, Any] | None = None,
) -> str:
    blob = json.dumps(
        {
            "role": role,
            "system": system,
            "user": user,
            "model": model,
            "config": config or {},
            "payload": payload or {},
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def cache_get(h: str) -> dict[str, Any] | None:
    row = fetchone("SELECT response_json, model FROM agent_cache WHERE prompt_hash = ?", (h,))
    if not row:
        return None
    data = json.loads(row["response_json"])
    data["_cached"] = True
    data["_model"] = row["model"]
    return data


def cache_put(h: str, model: str, role: str, data: dict[str, Any]) -> None:
    execute(
        """
        INSERT INTO agent_cache(prompt_hash, model, role, response_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(prompt_hash) DO UPDATE SET
            model = excluded.model,
            response_json = excluded.response_json,
            created_at = excluded.created_at
        """,
        (h, model, role, json.dumps(data, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
    )


def select_model(role: str, prefer_quality: bool = False) -> tuple[str, dict[str, Any] | None]:
    """Return (tier_used, model_cfg)."""
    cfg = load_config()
    quality_roles = set(cfg["policy"].get("quality_roles") or [])
    want_quality = prefer_quality or role in quality_roles
    if want_quality:
        m = pick_model("quality")
        if m:
            return "quality", m
    if not workhorse_exhausted():
        m = pick_model("workhorse")
        if m:
            return "workhorse", m
    m = pick_model("legacy")
    if m:
        return "legacy", m
    return "none", None


def _loads_json(text: str) -> tuple[dict[str, Any] | None, bool]:
    """Return (data, recovered). recovered=True means we closed a truncated blob."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        return (data, False) if isinstance(data, dict) else ({"cards": data} if isinstance(data, list) else None, False)
    except json.JSONDecodeError:
        pass
    stack: list[str] = []
    in_str = False
    escape = False
    for ch in raw:
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack and stack[-1] == ch:
            stack.pop()
    closed = raw + ("" if not in_str else '"') + "".join(reversed(stack))
    try:
        data = json.loads(closed)
        if isinstance(data, dict):
            return data, True
        if isinstance(data, list):
            return {"cards": data}, True
    except json.JSONDecodeError:
        return None, False
    return None, False


def generate_json(
    role: str,
    system: str,
    user: str,
    payload: dict[str, Any],
    prefer_quality: bool = False,
    max_output_tokens: int | None = None,
    force: bool = False,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    tier, model = select_model(role, prefer_quality=prefer_quality)
    model_id = model["id"] if model else ""
    h = prompt_hash(
        role,
        payload,
        system=system,
        user=user,
        model=model_id,
        config={**(config or {}), "max_output_tokens": max_output_tokens},
    )
    if not force:
        cached = cache_get(h)
        if cached:
            return cached

    if model is None:
        return {"_fallback": "template", "_tier": tier}

    client = get_client()
    if client is None:
        return {"_fallback": "template", "_reason": "no_api_key"}

    try:
        from google.genai import types

        cfg_kwargs: dict[str, Any] = {
            "temperature": 0.95 if force else 0.7,
        }
        if max_output_tokens:
            cfg_kwargs["max_output_tokens"] = int(max_output_tokens)

        response = client.models.generate_content(
            model=model["id"],
            contents=f"{system}\n\n{user}",
            config=types.GenerateContentConfig(**cfg_kwargs),
        )
        text = (response.text or "").strip()
        usage_tokens = 0
        try:
            usage_tokens = int(getattr(response.usage_metadata, "total_token_count", 0) or 0)
        except Exception:
            usage_tokens = 0
        record_call(model["id"], usage_tokens)
        if not text:
            return {"_fallback": "template", "_reason": "empty", "_model": model["id"], "_tier": tier}

        data, recovered = _loads_json(text)
        if data is None:
            data = {"text_ru": text, "reply_ru": text}
        else:
            if not str(data.get("text_ru") or "").strip() and not data.get("cards"):
                data["text_ru"] = text
            if not str(data.get("reply_ru") or "").strip():
                data["reply_ru"] = text
        data["_text"] = text
        data["_model"] = model["id"]
        data["_tier"] = tier
        data["_cached"] = False
        if recovered:
            data["_partial"] = True
        elif not force:
            cache_put(h, model["id"], role, data)
        return data
    except Exception as exc:
        return {"_fallback": "template", "_error": str(exc), "_model": model["id"], "_tier": tier}
