from __future__ import annotations

from typing import Any

from app.db import get_setting

COMBINABLE = ("mnemonic", "decompose", "readings", "lookalikes", "vocab", "etymology")

# Hard cap: Gemini output is ~8k; stay under 6.5k so the letter fits.
OUT_HARD_MAX = 6500
OUT_TARGET = 5500
KANJI_PER_CALL = 10

_LEN_W = {1: 1.0, 2: 1.7, 3: 2.6, 4: 3.6}
_LEN_RU = {1: "кратко", 2: "обычно", 3: "подробно", 4: "максимум, но в бюджете пачки"}

SKILL_LEN_KEYS = {
    "mnemonic": "skill_len_mnemonic",
    "decompose": "skill_len_decompose",
    "readings": "skill_len_readings",
    "lookalikes": "skill_len_lookalikes",
    "vocab": "skill_len_vocab",
    "etymology": "skill_len_etymology",
}


def _i(overrides: dict[str, Any], key: str, default: int) -> int:
    if key in overrides and overrides[key] not in (None, ""):
        try:
            return int(overrides[key])
        except (TypeError, ValueError):
            pass
    try:
        return int(get_setting(key, str(default)))
    except (TypeError, ValueError):
        return default


def _s(overrides: dict[str, Any], key: str, default: str) -> str:
    if key in overrides and overrides[key] not in (None, ""):
        return str(overrides[key])
    return get_setting(key, default)


def skill_settings(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    o = overrides or {}
    count = max(1, min(4, _i(o, "mnemonic_count", 2)))
    max_out = max(800, min(OUT_HARD_MAX, _i(o, "batch_max_out_tokens", OUT_TARGET)))
    max_kanji = max(1, min(KANJI_PER_CALL, _i(o, "batch_max_kanji", KANJI_PER_CALL)))
    mode = _s(o, "skill_len_mode", "global")
    if mode not in ("global", "per"):
        mode = "global"
    glob = max(1, min(4, _i(o, "skill_len_global", 2)))
    lens: dict[str, int] = {}
    for skill, key in SKILL_LEN_KEYS.items():
        lens[skill] = max(1, min(4, _i(o, key, glob)))
    return {
        "mnemonic_count": count,
        "mnemonic_style": _s(o, "mnemonic_style", "visual-story"),
        "mnemonic_refs": _s(o, "mnemonic_refs", "wanikani,koohii,heisig"),
        "batch_max_out_tokens": max_out,
        "batch_max_kanji": max_kanji,
        "etymology_level": _s(o, "etymology_level", "short"),
        "active_skills": _s(o, "active_skills", "mnemonic,decompose,readings,lookalikes"),
        "skill_len_mode": mode,
        "skill_len_global": glob,
        "skill_lens": lens,
        "user_prompt": str(o.get("user_prompt") if o.get("user_prompt") not in (None,) else _s(o, "user_prompt", "")),
        "prior_text": str(o.get("prior_text") or ""),
    }


def est_tokens(text: str) -> int:
    cjk = 0
    other = 0
    for ch in text or "":
        o = ord(ch)
        if 0x2E80 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF:
            cjk += 1
        else:
            other += 1
    return max(1, int(cjk * 1.6 + other / 3.2))


def aspect_weights(skills: list[str], settings: dict[str, Any]) -> dict[str, float]:
    mode = settings.get("skill_len_mode") or "global"
    glob = max(1, min(4, int(settings.get("skill_len_global") or 2)))
    lens = settings.get("skill_lens") or {}
    out: dict[str, float] = {}
    for s in skills:
        lv = glob if mode != "per" else int(lens.get(s) or glob)
        lv = max(1, min(4, lv))
        out[s] = _LEN_W[lv]
    return out


def aspect_budget(skills: list[str], settings: dict[str, Any], n_kanji: int) -> dict[str, Any]:
    max_out = int(settings.get("batch_max_out_tokens") or OUT_TARGET)
    pool = max(400, int(max_out * 0.9))
    weights = aspect_weights(skills, settings)
    total_w = sum(weights.values()) or 1.0
    n = max(1, n_kanji)
    mode = settings.get("skill_len_mode") or "global"
    glob = max(1, min(4, int(settings.get("skill_len_global") or 2)))
    lens = settings.get("skill_lens") or {}
    rows: list[dict[str, Any]] = []
    lines: list[str] = []
    for s in skills:
        share = max(40, int(pool * weights[s] / total_w))
        per = max(16, share // n)
        lv = glob if mode != "per" else int(lens.get(s) or glob)
        lv = max(1, min(4, lv))
        rows.append({"skill": s, "level": lv, "tokens_pack": share, "tokens_each": per})
        lines.append(f"- {s}: {_LEN_RU[lv]}, ~{per} ток. на знак, ~{share} на пачку из {n}")
    return {
        "max_out": max_out,
        "n_kanji": n,
        "rows": rows,
        "text": (
            f"Лимит ответа пачки: {max_out} токенов (не 8k). "
            f"{n} знаков. Не превышай. Лучше короче, чем обрыв на полуслове.\n" + "\n".join(lines)
        ),
    }


def tokens_per_kanji(skills: list[str], settings: dict[str, Any]) -> int:
    n = max(1, int(settings.get("batch_max_kanji") or KANJI_PER_CALL))
    budget = aspect_budget(skills, settings, n)
    return max(40, budget["max_out"] // n)


def kanji_per_chunk(settings: dict[str, Any]) -> int:
    max_n = max(1, min(KANJI_PER_CALL, int(settings.get("batch_max_kanji") or KANJI_PER_CALL)))
    glob = max(1, min(4, int(settings.get("skill_len_global") or 2)))
    by_len = {1: 10, 2: 8, 3: 5, 4: 3}
    return max(1, min(max_n, by_len.get(glob, 8)))


def plan_chunks(
    kanji_list: list[str],
    skills: list[str],
    settings: dict[str, Any],
) -> dict[str, Any]:
    skills = [s for s in skills if s in COMBINABLE]
    if not skills:
        skills = ["mnemonic", "decompose"]
    max_out = int(settings["batch_max_out_tokens"])
    n_per = kanji_per_chunk(settings)
    n_per = max(1, min(n_per, len(kanji_list) or 1))
    per_out = max(40, max_out // n_per)
    chunks = []
    for i in range(0, len(kanji_list), n_per):
        group = kanji_list[i : i + n_per]
        chunks.append(
            {
                "index": len(chunks),
                "kanji": group,
                "est_out": per_out * len(group),
                "est_in": 420 * len(group) + 400,
            }
        )
    warning = ""
    if not kanji_list:
        warning = "Нечего разбирать."
    elif len(chunks) > 1:
        warning = (
            f"Список разобьётся на {len(chunks)} запросов по {n_per} знаков "
            f"(лимит ответа ~{max_out} токенов на пачку)."
        )
    return {
        "skills": skills,
        "n_kanji": len(kanji_list),
        "per_kanji_out": per_out,
        "kanji_per_chunk": n_per,
        "calls": len(chunks),
        "est_out_total": sum(c["est_out"] for c in chunks),
        "est_in_total": sum(c["est_in"] for c in chunks),
        "chunks": chunks,
        "warning": warning,
        "aspect_budget": aspect_budget(skills, settings, n_per)["text"],
        "settings": {
            "mnemonic_count": settings["mnemonic_count"],
            "mnemonic_style": settings["mnemonic_style"],
            "mnemonic_refs": settings["mnemonic_refs"],
            "batch_max_out_tokens": settings["batch_max_out_tokens"],
            "batch_max_kanji": settings["batch_max_kanji"],
            "skill_len_mode": settings.get("skill_len_mode"),
            "skill_len_global": settings.get("skill_len_global"),
            "skill_lens": settings.get("skill_lens"),
            "user_prompt": settings.get("user_prompt") or "",
        },
    }
