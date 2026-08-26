from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.agent.limiter import load_config, rpd_used
from app.agent.prompt_store import list_prompts, seed_prompts
from app.agent.skill_loader import load_skill
from app.agent.study import (
    analyze_in_session,
    chat_about,
    chat_about_run,
    drop_run,
    plan_session_batch,
    rewrite_snippet,
    run_session_chunk,
    run_skill,
    skills_public,
)
from app.core.parse_kanji import unique_kanji
from app.core.ref_catalog import context_for, lookup, save_user_fields, search as catalog_search
from app.core.session import clear_sessions, create_session, delete_session, get_session, list_sessions
from app.core.user_notes import clear_user_notes, get_user_note
from app.db import LATEST_SCHEMA_VERSION, fetchall, init_db, set_setting, _user_version, connect
from app.paths import UI_DIST

app = FastAPI(title="KanjyMemo", version="0.3.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5280",
        "http://127.0.0.1:8765",
        "http://localhost:8765",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImportIn(BaseModel):
    text: str
    title: str | None = None


class SkillIn(BaseModel):
    extra: dict[str, Any] | None = None


class ChatIn(BaseModel):
    message: str


class BatchIn(BaseModel):
    skills: list[str] = []
    force: bool = False
    chunk_index: int = 0
    only: list[str] | None = None
    mnemonic_count: int | None = None
    mnemonic_style: str | None = None
    mnemonic_refs: str | None = None
    etymology_level: str | None = None
    batch_max_out_tokens: int | None = None
    batch_max_kanji: int | None = None
    run_id: str | None = None
    prior_text: str | None = None
    user_prompt: str | None = None
    skill_len_mode: str | None = None
    skill_len_global: int | None = None
    skill_len_mnemonic: int | None = None
    skill_len_decompose: int | None = None
    skill_len_readings: int | None = None
    skill_len_lookalikes: int | None = None
    skill_len_vocab: int | None = None
    skill_len_etymology: int | None = None


class SnippetIn(BaseModel):
    text: str
    command: str = "explain"


class RunChatIn(BaseModel):
    message: str


class RunDeleteIn(BaseModel):
    run_id: str | None = None


class NotesIn(BaseModel):
    mnemonic: str | None = None
    notes: str | None = None


class TokenizeIn(BaseModel):
    text: str


class SettingsIn(BaseModel):
    values: dict[str, Any]


class GeminiKeyIn(BaseModel):
    key: str


@app.on_event("startup")
def _startup() -> None:
    init_db()
    seed_prompts()


@app.get("/api/health")
def health() -> dict[str, Any]:
    from app.core.ja_tokenize import available as sudachi_available

    db_ok = False
    schema = 0
    try:
        conn = connect()
        schema = _user_version(conn)
        db_ok = True
    except Exception:
        db_ok = False
    ready = db_ok and schema >= LATEST_SCHEMA_VERSION
    return {
        "status": "ok" if ready else "degraded",
        "version": app.version,
        "db": db_ok,
        "schema": schema,
        "sudachi": sudachi_available(),
    }


@app.post("/api/tokenize")
def api_tokenize(body: TokenizeIn) -> dict[str, Any]:
    from app.core.ja_tokenize import tokenize_ja

    return tokenize_ja(body.text or "")


@app.post("/api/parse")
def api_parse(body: ImportIn) -> dict[str, Any]:
    chars = unique_kanji(body.text)
    return {
        "kanji": chars,
        "count": len(chars),
        "unknown": [ch for ch in chars if lookup(ch) is None],
    }


@app.post("/api/sessions")
def api_session_create(body: ImportIn) -> dict[str, Any]:
    try:
        return create_session(body.text, title=body.title)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/sessions/upload")
async def api_session_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    try:
        return create_session(text, title=file.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/sessions")
def api_sessions() -> dict[str, Any]:
    return {"sessions": list_sessions()}


@app.delete("/api/sessions")
def api_sessions_clear() -> dict[str, Any]:
    return clear_sessions()


@app.delete("/api/sessions/{session_id}")
def api_session_delete(session_id: int) -> dict[str, Any]:
    try:
        return delete_session(session_id)
    except KeyError:
        raise HTTPException(404, "session not found") from None


@app.get("/api/sessions/{session_id}")
def api_session(session_id: int) -> dict[str, Any]:
    try:
        return get_session(session_id)
    except KeyError:
        raise HTTPException(404, "session not found") from None


@app.get("/api/sessions/{session_id}/kanji/{kanji}")
def api_session_kanji(session_id: int, kanji: str) -> dict[str, Any]:
    ctx = context_for(kanji)
    try:
        from app.core.session import get_entry

        entry = get_entry(session_id, kanji)
    except KeyError:
        raise HTTPException(404, "kanji not in session") from None
    return {"entry": entry, "catalog": ctx}


@app.post("/api/sessions/{session_id}/kanji/{kanji}/analyze")
def api_analyze(session_id: int, kanji: str, force: bool = False) -> dict[str, Any]:
    try:
        return analyze_in_session(session_id, kanji, force=force)
    except KeyError:
        raise HTTPException(404, "kanji not in session") from None


@app.post("/api/sessions/{session_id}/kanji/{kanji}/skill/{skill_name}")
def api_skill(session_id: int, kanji: str, skill_name: str, body: SkillIn | None = None) -> dict[str, Any]:
    try:
        load_skill(skill_name)
    except FileNotFoundError:
        raise HTTPException(404, "unknown skill") from None
    extra = (body.extra if body else None) or {}
    if skill_name == "briefing":
        try:
            return analyze_in_session(session_id, kanji, force=True)
        except KeyError:
            raise HTTPException(404, "kanji not in session") from None
    try:
        return run_skill(skill_name, kanji, extra=extra)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/sessions/{session_id}/kanji/{kanji}/chat")
def api_chat(session_id: int, kanji: str, body: ChatIn) -> dict[str, Any]:
    try:
        return chat_about(session_id, kanji, body.message)
    except KeyError:
        raise HTTPException(404, "kanji not in session") from None


def _batch_extra(body: BatchIn) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    for key in (
        "mnemonic_count",
        "mnemonic_style",
        "mnemonic_refs",
        "etymology_level",
        "batch_max_out_tokens",
        "batch_max_kanji",
        "prior_text",
        "user_prompt",
        "skill_len_mode",
        "skill_len_global",
        "skill_len_mnemonic",
        "skill_len_decompose",
        "skill_len_readings",
        "skill_len_lookalikes",
        "skill_len_vocab",
        "skill_len_etymology",
    ):
        val = getattr(body, key)
        if val is not None:
            extra[key] = val
    return extra


@app.post("/api/sessions/{session_id}/batch/plan")
def api_batch_plan(session_id: int, body: BatchIn) -> dict[str, Any]:
    try:
        return plan_session_batch(
            session_id, body.skills, extra=_batch_extra(body), force=body.force, only=body.only
        )
    except KeyError:
        raise HTTPException(404, "session not found") from None


@app.post("/api/sessions/{session_id}/batch/run")
def api_batch_run(session_id: int, body: BatchIn) -> dict[str, Any]:
    try:
        return run_session_chunk(
            session_id,
            body.skills,
            body.chunk_index,
            extra=_batch_extra(body),
            force=body.force,
            only=body.only,
            run_id=body.run_id,
        )
    except KeyError:
        raise HTTPException(404, "session not found") from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/sessions/{session_id}/chat-run")
def api_chat_run(session_id: int, body: RunChatIn) -> dict[str, Any]:
    try:
        return chat_about_run(session_id, body.message)
    except KeyError:
        raise HTTPException(404, "session not found") from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/sessions/{session_id}/runs/delete")
def api_delete_run_post(session_id: int, body: RunDeleteIn | None = None) -> dict[str, Any]:
    try:
        get_session(session_id)
    except KeyError:
        raise HTTPException(404, "session not found") from None
    return drop_run(session_id, body.run_id if body else None)


@app.delete("/api/sessions/{session_id}/runs")
def api_delete_run(session_id: int, run_id: str | None = None) -> dict[str, Any]:
    try:
        get_session(session_id)
    except KeyError:
        raise HTTPException(404, "session not found") from None
    return drop_run(session_id, run_id)


@app.post("/api/agent/snippet")
def api_snippet(body: SnippetIn) -> dict[str, Any]:
    try:
        return rewrite_snippet(body.text, body.command)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.put("/api/kanji/{kanji}/notes")
def api_notes(kanji: str, body: NotesIn) -> dict[str, Any]:
    try:
        saved = save_user_fields(kanji, mnemonic=body.mnemonic, notes=body.notes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, **saved}


@app.get("/api/kanji/{kanji}/notes")
def api_notes_get(kanji: str) -> dict[str, Any]:
    data = get_user_note(kanji)
    return {"ok": True, "kanji": kanji, **data}


@app.delete("/api/notes")
def api_notes_clear() -> dict[str, Any]:
    n = clear_user_notes()
    return {"ok": True, "deleted": n}


@app.get("/api/dictionary")
def api_dictionary(q: str = "") -> dict[str, Any]:
    if not q.strip():
        return {"items": []}
    return {"items": catalog_search(q)}


@app.get("/api/agent/skills")
def api_skills() -> dict[str, Any]:
    return skills_public()


@app.get("/api/agent/prompts")
def api_prompts() -> dict[str, Any]:
    return {"prompts": list_prompts()}


@app.get("/api/agent/usage")
def api_usage() -> dict[str, Any]:
    cfg = load_config()
    usage = []
    for tier, spec in cfg["tiers"].items():
        for m in spec["models"]:
            usage.append(
                {
                    "tier": tier,
                    "model": m["id"],
                    "rpd_limit": m["rpd"],
                    "rpd_used": rpd_used(m["id"]),
                    "rpm_limit": m["rpm"],
                }
            )
    return {"usage": usage}


@app.get("/api/settings")
def api_settings() -> dict[str, Any]:
    rows = fetchall("SELECT key, value FROM settings")
    return {"values": {r["key"]: r["value"] for r in rows}}


@app.put("/api/settings")
def api_settings_put(body: SettingsIn) -> dict[str, Any]:
    for k, v in body.values.items():
        set_setting(str(k), str(v))
    return api_settings()


@app.get("/api/gemini-key")
def api_gemini_key() -> dict[str, Any]:
    from app.agent.router import key_status

    return key_status()


@app.put("/api/gemini-key")
def api_gemini_key_put(body: GeminiKeyIn) -> dict[str, Any]:
    from app.agent.router import save_api_key

    try:
        return save_api_key(body.key)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/api/gemini-key")
def api_gemini_key_delete() -> dict[str, Any]:
    from app.agent.router import clear_api_key

    return clear_api_key()


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(404, "not found")
    if not UI_DIST.exists():
        return {"detail": "UI not built. Run npm --prefix app/ui run build"}
    candidate = UI_DIST / full_path
    if full_path and candidate.exists() and candidate.is_file():
        return FileResponse(candidate)
    index = UI_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"detail": "index.html missing"}
