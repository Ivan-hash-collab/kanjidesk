from __future__ import annotations

import json
import uuid
from typing import Any

from app.agent.budget import COMBINABLE, aspect_budget, plan_chunks, skill_settings
from app.agent.prompt_store import get_prompt
from app.agent.render import render_card, render_chunk
from app.agent.router import generate_json
from app.agent.skill_catalog import groups_public
from app.agent.skill_loader import list_skills, load_skill
from app.core.ref_catalog import context_for
from app.core.session import (
    add_message,
    clear_session_analysis,
    complete_generation_run,
    ensure_generation_run,
    find_run_chunk,
    get_entry,
    get_session,
    last_run_text,
    save_briefing,
)

READING_RULES = """
Правила записи японского (обязательны):
- Объяснения — по-русски.
- Сами кандзи пиши кандзи.
- Чтения только хирагана и ромадзи Хэпбёрна (nichi, kyō/kyou, ji, chu, tsu, fu, sha).
- ЗАПРЕЩЕНА система Поливанова и любая кириллическая транскрипция японского
  (нити, хи, кё, дзи, дзю, дзё, тё, тя, ся, сю, сё, ти, цу как «цу» латиницей ок, но не «цу» вместо tsu в кириллице-чтении).
- Не пиши нити, дзи, кё, тё, ся вместо nichi/ji/kyo/cho/sha.
""".strip()

_STYLE = {
    "visual-story": "Живая картинка из формы знака: части IDS — актёры сцены.",
    "wanikani-radicals": (
        "Метод в духе WaniKani: каждая часть из древа ids_tree — персонаж или реквизит. "
        "Разворачивай вложенные узлы, не одну строку радикала Канси. "
        "Имена только из ids_tree/kanjium, не копируй канон и стори WK."
    ),
    "koohii-story": (
        "Метод в духе Kanji Koohii: одна связная история вокруг keyword. Не копируй сюжеты с сайта."
    ),
    "heisig-keyword": "Метод Heisig/RTK: английский keyword — закон, история ему служит.",
    "phonetic": "Крючок на чтение (хирагана + romaji) плюс форма.",
    "short": "Одна-две фразы, без воды.",
}

_REF = {
    "wanikani": "WaniKani — радикалы как персонажи (метод, не текст)",
    "koohii": "Kanji Koohii — народная история на keyword (метод, не чужой текст)",
    "heisig": "Heisig RTK — keyword как якорь",
    "kklc": "KKLC — английский keyword курса как якорь, не текст книги",
    "phonetic_series": "фонетический ряд kanjium (фонетик → чтение)",
}


class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _render(template: str, ctx: dict[str, Any]) -> str:
    flat = {k: _stringify(v) for k, v in ctx.items()}
    return template.format_map(_Safe(flat))


def _settings_ctx(settings: dict[str, Any]) -> dict[str, str]:
    refs = [x.strip() for x in str(settings.get("mnemonic_refs") or "").split(",") if x.strip()]
    blurbs = [_REF.get(r, r) for r in refs] or list(_REF.values())
    style = str(settings.get("mnemonic_style") or "visual-story")
    n = max(1, int(settings.get("_chunk_n") or settings.get("batch_max_kanji") or 10))
    skills = settings.get("_chunk_skills") or []
    budget = aspect_budget(list(skills) if skills else ["mnemonic"], settings, n)
    return {
        "mnemonic_count": str(settings.get("mnemonic_count") or 2),
        "mnemonic_style": style,
        "mnemonic_style_blurb": _STYLE.get(style, _STYLE["visual-story"]),
        "mnemonic_refs": ",".join(refs),
        "mnemonic_refs_blurb": "; ".join(blurbs),
        "etymology_level": str(settings.get("etymology_level") or "short"),
        "aspect_budget": budget["text"],
        "user_prompt": str(settings.get("user_prompt") or ""),
        "prior_text": str(settings.get("prior_text") or ""),
    }


def _with_settings(ctx: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = skill_settings(extra)
    out = dict(ctx)
    out.update(_settings_ctx(settings))
    if extra:
        for k, v in extra.items():
            if k not in ("mnemonic_count", "mnemonic_style", "mnemonic_refs") or v not in (None, ""):
                out[k] = v
    out["_settings"] = settings
    return out


def _attach_text(data: dict[str, Any]) -> dict[str, Any]:
    data["text_ru"] = render_card(data)
    return data


def template_briefing(ctx: dict[str, Any], ignore_saved_mnemonic: bool = False) -> dict[str, Any]:
    parts = ctx.get("components") or []
    joined = " + ".join(parts) if parts else ctx["kanji"]
    likes = ctx.get("lookalikes") or []
    note = ""
    if likes:
        first = likes[0]
        note = f"Не путай с {first.get('kanji')} ({first.get('meaning')})."
    mnemonic = "" if ignore_saved_mnemonic else ctx.get("my_mnemonic") or f"{joined} → {ctx.get('meaning') or 'значение'}."
    if not mnemonic:
        mnemonic = f"{joined} → {ctx.get('meaning') or 'значение'}."
    return {
        "kanji": ctx["kanji"],
        "keyword_ru": ctx.get("meaning") or "",
        "mnemonics": [{"kind": "meaning", "text_ru": mnemonic}],
        "mnemonic_ru": mnemonic,
        "onyomi_hint": ctx.get("onyomi") or "",
        "kunyomi_hint": ctx.get("kunyomi") or "",
        "decompose": {
            "parts": [{"surface": p, "role_ru": ""} for p in parts],
            "story_ru": f"Части по IDS: {ctx.get('ids_facts') or joined}.",
        },
        "components_story": ctx.get("ids_facts") or f"Части: {joined}.",
        "lookalikes": {
            "rule_ru": (
                f"По написанию рядом с {first.get('kanji')} ({first.get('meaning')})."
                if likes
                else ""
            ),
            "pairs": [
                {
                    "other": x.get("kanji"),
                    "similar_how_ru": "похожи по форме",
                    "difference_ru": x.get("meaning") or "смотри на лишние или недостающие черты",
                }
                for x in likes
            ],
        },
        "lookalike_note": note,
        "vocab": {"words": []},
        "tip_ru": "Проговорите keyword вслух, глядя на форму. Чтения: хирагана и romaji.",
        "_fallback": "template",
    }


def _system_for(skill_name: str, prompt: dict[str, Any]) -> str:
    skill = load_skill(skill_name)
    return READING_RULES + "\n\n" + prompt["system_prompt"] + "\n\n# Skill\n" + skill.body


def run_skill(skill_name: str, kanji: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    skill = load_skill(skill_name)
    if not skill.prompt_id:
        if skill_name == "catalog-lookup":
            return context_for(kanji)
        raise ValueError(f"skill {skill_name} is a tool, not an LLM call")

    ctx = _with_settings(context_for(kanji), extra)
    prompt = get_prompt(skill.prompt_id)
    system = _system_for(skill_name, prompt)
    user = _render(prompt["user_template"], ctx)
    prefer = skill.tier == "quality" or prompt["tier"] == "quality"
    settings = ctx["_settings"]
    payload = {
        "kanji": kanji,
        "skill": skill_name,
        "meaning": ctx.get("meaning"),
        "ids": ctx.get("ids_formula"),
        "tree": ctx.get("ids_tree"),
        "mc": settings["mnemonic_count"],
        "ms": settings["mnemonic_style"],
        "mr": settings["mnemonic_refs"],
        "message": ctx.get("message") or (extra or {}).get("message"),
    }
    data = generate_json(skill.prompt_id, system, user, payload, prefer_quality=prefer, force=bool((extra or {}).get("force")))

    raw = str(data.get("_text") or data.get("text_ru") or data.get("reply_ru") or "").strip()
    if data.get("_fallback") == "template" and not raw:
        tb = template_briefing(ctx)
        if skill_name == "briefing":
            data = {**tb, **{k: data.get(k) for k in ("_error", "_model", "_tier") if data.get(k)}}
        elif skill_name == "mnemonic":
            data = {"mnemonics": tb["mnemonics"], "_fallback": "template"}
        elif skill_name == "chat":
            data = {"reply_ru": f"{kanji} — {ctx.get('meaning') or 'нет в каталоге'}.", "_fallback": "template"}
        elif skill_name == "decompose":
            data = {**tb["decompose"], "_fallback": "template"}
        elif skill_name == "readings":
            data = {
                "onyomi": [{"kana": ctx.get("onyomi_hira") or "", "romaji": "", "note_ru": ""}],
                "kunyomi": [{"kana": ctx.get("kunyomi") or "", "romaji": "", "note_ru": ""}],
                "memory_ru": "",
                "_fallback": "template",
            }
        elif skill_name == "lookalikes":
            data = {**tb["lookalikes"], "_fallback": "template"}
        elif skill_name == "vocab":
            data = {"words": [], "_fallback": "template"}
        elif skill_name == "etymology":
            data = {
                "type_ru": ctx.get("etym_type") or "",
                "explain_ru": ctx.get("ids_facts") or "",
                "_fallback": "template",
            }
        data["_kanji"] = kanji
    data["_skill"] = skill_name
    data["_prompt_id"] = skill.prompt_id
    if "kanji" not in data:
        data["kanji"] = kanji
    if raw and not data.get("cards"):
        data["text_ru"] = raw
        return data
    return _attach_text(data)


def analyze_in_session(session_id: int, kanji: str, force: bool = False) -> dict[str, Any]:
    entry = get_entry(session_id, kanji)
    if entry.get("briefing") and not force:
        data = dict(entry["briefing"])
        data["_cached"] = True
        if not data.get("text_ru"):
            data["text_ru"] = render_card(data)
        return data
    settings = skill_settings()
    skills = [s.strip() for s in str(settings["active_skills"]).split(",") if s.strip() in COMBINABLE]
    if not skills:
        skills = ["mnemonic", "decompose", "readings"]
    result = run_combo([kanji], skills, settings)
    cards = result.get("cards") or []
    data = cards[0] if cards else run_skill("briefing", kanji)
    for k in ("_model", "_tier", "_cached", "_fallback", "_error"):
        if result.get(k) and not data.get(k):
            data[k] = result[k]
    save_briefing(session_id, kanji, data)
    return data


def drop_run(session_id: int, run_id: str | None = None) -> dict[str, Any]:
    return clear_session_analysis(session_id)


def chat_about_run(session_id: int, message: str) -> dict[str, Any]:
    history = last_run_text(session_id)
    if not history.strip():
        raise ValueError("нет последнего разбора — сначала сгенерируйте истории")
    system = (
        READING_RULES
        + "\nТы отвечаешь на один точечный вопрос по уже готовым историям. "
        "Не переписывай весь разбор. Ответь обычным текстом."
    )
    user = f"Последний разбор:\n{history[-14000:]}\n\nВопрос:\n{message}"
    data = generate_json(
        "runchat.v1",
        system,
        user,
        {"sid": session_id, "m": message[:400], "n": len(history)},
        prefer_quality=False,
        max_output_tokens=1200,
    )
    reply = str(data.get("reply_ru") or data.get("_text") or data.get("text_ru") or "")
    add_message(
        session_id,
        0,
        ["chat"],
        [],
        f"Вопрос: {message}\n\nОтвет: {reply}",
        {"oneshot": True, "model": data.get("_model")},
    )
    return {"reply_ru": reply, "text_ru": reply, "_model": data.get("_model"), "_error": data.get("_error")}


def rewrite_snippet(text: str, command: str) -> dict[str, Any]:
    excerpt = (text or "").strip()
    if not excerpt:
        raise ValueError("нет выделенного текста")
    cmd = (command or "объясни").strip()
    system = (
        READING_RULES
        + "\nВыполни команду над фрагментом. Ответь обычным текстом. "
        "Не выходи далеко за тему фрагмента."
    )
    user = f"Команда: {cmd}\n\nФрагмент:\n{excerpt[:8000]}"
    data = generate_json(
        "snippet.v1",
        system,
        user,
        {"c": cmd[:200], "t": excerpt[:400]},
        prefer_quality=False,
        max_output_tokens=1500,
    )
    reply = str(data.get("reply_ru") or data.get("_text") or data.get("text_ru") or "")
    return {"reply_ru": reply, "text_ru": reply, "_model": data.get("_model"), "_error": data.get("_error")}


def chat_about(session_id: int, kanji: str, message: str) -> dict[str, Any]:
    entry = get_entry(session_id, kanji)
    hist: list[str] = []
    try:
        sess = get_session(session_id)
    except KeyError:
        sess = {}
    for m in sess.get("messages") or []:
        if "chat" not in (m.get("skills") or []):
            continue
        if kanji not in (m.get("kanji") or []):
            continue
        hist.append(str(m.get("text_ru") or ""))
    history = "\n\n".join(hist[-6:]) or "(в этой сессии ещё не было вопросов по этому знаку)"
    data = run_skill(
        "chat",
        kanji,
        extra={"message": message, "briefing": entry.get("briefing") or {}, "history": history},
    )
    add_message(
        session_id,
        0,
        ["chat"],
        [kanji],
        f"Вопрос: {message}\n\nОтвет: {data.get('reply_ru') or ''}",
        {"model": data.get("_model")},
    )
    return data


def _facts_json(kanji_list: list[str]) -> str:
    rows = []
    for ch in kanji_list:
        ctx = context_for(ch)
        rows.append(
            {
                "kanji": ch,
                "keyword": ctx.get("meaning"),
                "onyomi": ctx.get("onyomi"),
                "kunyomi": ctx.get("kunyomi"),
                "ids": ctx.get("ids_facts"),
                "parts": ctx.get("part_notes"),
                "radical": ctx.get("radical"),
                "radical_meaning": ctx.get("radical_meaning"),
                "phonetic": ctx.get("phonetic"),
                "etym_type": ctx.get("etym_type"),
                "lookalikes": ctx.get("lookalikes_fmt"),
                "in_kklc": ctx.get("in_kklc"),
                "ids_tree": ctx.get("ids_tree"),
                "ids_formula": ctx.get("ids_formula") or ctx.get("ids_facts"),
            }
        )
    return json.dumps(rows, ensure_ascii=False, indent=2)


def _invoke_batch(
    kanji_list: list[str],
    skills: list[str],
    settings: dict[str, Any],
    system: str,
    prompt: dict[str, Any],
) -> dict[str, Any]:
    packed = dict(settings)
    packed["_chunk_n"] = len(kanji_list)
    packed["_chunk_skills"] = skills
    ctx = {
        "skills_joined": ", ".join(skills),
        "batch_facts": _facts_json(kanji_list),
        **_settings_ctx(packed),
    }
    user = _render(prompt["user_template"], ctx)
    style = str(settings.get("mnemonic_style") or "")
    refs = [x.strip() for x in str(settings.get("mnemonic_refs") or "").split(",") if x.strip()]
    user += (
        "\n\nУ каждого знака поле ids_tree — полное древо частей до листьев "
        "(имена и значения радикалов уже даны). Не выдумывай радикалы вне этого древа. "
        "В «Части знака» разверни структуру: как узлы вложены, что означает каждый лист."
    )
    extra_note = str(settings.get("user_prompt") or "").strip()
    if extra_note:
        user += "\n\nДоп. указание пользователя (учитывай во всей пачке):\n" + extra_note
    prior = str(settings.get("prior_text") or "").strip()
    if prior:
        user += (
            "\n\nПредыдущие пачки этой же генерации (стиль и имена частей держи согласованными; "
            "не повторяй уже разобранные знаки):\n"
            + prior[-8000:]
        )
    if style == "wanikani-radicals" or "wanikani" in refs:
        user += (
            " Стиль радикалов-персонажей: вложенные узлы ids_tree — актёры сцены, "
            "а не одна строка радикала Канси."
        )
    user += "\n\nБюджет длины:\n" + str(ctx.get("aspect_budget") or "")
    run_id = str(settings.get("_run_id") or "")
    if run_id:
        user += (
            "\n\nЭто отдельная генерация "
            f"{run_id}. Не копируй сюжеты прошлых разборов этой сессии, напиши заново."
        )
    max_out = int(settings.get("batch_max_out_tokens") or 5500)
    cap = max(800, min(6500, max_out))
    payload = {
        "skill": "batch",
        "kanji": "".join(kanji_list),
        "skills": ",".join(skills),
        "mc": settings.get("mnemonic_count"),
        "ms": settings.get("mnemonic_style"),
        "mr": settings.get("mnemonic_refs"),
        "ids": "|".join(str(context_for(ch).get("ids_tree") or "")[:80] for ch in kanji_list),
        "n": len(kanji_list),
        "up": extra_note[:120],
        "pr": str(len(prior)),
        "rid": run_id,
    }
    return generate_json(
        "batch.v1",
        system,
        user,
        payload,
        prefer_quality=False,
        max_output_tokens=cap,
        force=bool(settings.get("_force")),
        config={
            "run_id": run_id,
            "skill_len_global": settings.get("skill_len_global"),
            "skill_len_mode": settings.get("skill_len_mode"),
            "skill_lens": settings.get("skill_lens"),
            "user_prompt": extra_note[:200],
        },
    )


def _cards_by_kanji(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = data.get("cards")
    if not isinstance(raw, list):
        return {}
    return {str(c.get("kanji")): c for c in raw if isinstance(c, dict) and c.get("kanji")}


def run_combo(kanji_list: list[str], skills: list[str], settings: dict[str, Any]) -> dict[str, Any]:
    skills = [s for s in skills if s in COMBINABLE]
    if not skills:
        raise ValueError("выберите хотя бы один скилл")
    prompt = get_prompt("batch.v1")
    skill = load_skill("batch")
    system = READING_RULES + "\n\n" + prompt["system_prompt"] + "\n\n# Skill\n" + skill.body
    for name in skills:
        try:
            system += "\n\n## " + name + "\n" + load_skill(name).body
        except FileNotFoundError:
            pass
    data = _invoke_batch(kanji_list, skills, settings, system, prompt)
    raw = str(data.get("_text") or data.get("text_ru") or data.get("reply_ru") or "").strip()
    by_k = _cards_by_kanji(data) if data.get("_fallback") != "template" else {}
    errors: list[str] = []
    if data.get("_error") and not raw:
        errors.append(str(data["_error"]))

    if raw and not by_k:
        cards = [{"kanji": ch, "text_ru": raw, "_skills": skills, "_raw": True} for ch in kanji_list]
        return {
            "cards": cards,
            "text_ru": raw,
            "skills": skills,
            "_raw": True,
            "_model": data.get("_model"),
            "_tier": data.get("_tier"),
            "_cached": data.get("_cached"),
            "_fallback": data.get("_fallback"),
            "_error": None,
            "_partial": data.get("_partial"),
        }

    if by_k:
        missing = [ch for ch in kanji_list if ch not in by_k]
        if missing and not raw:
            retry = _invoke_batch(missing, skills, settings, system, prompt)
            retry_raw = str(retry.get("_text") or retry.get("text_ru") or "").strip()
            if retry.get("_error") and not retry_raw:
                errors.append(str(retry["_error"]))
            if retry.get("_fallback") != "template":
                by_k.update(_cards_by_kanji(retry))
            elif retry_raw:
                raw = retry_raw

    cards: list[dict[str, Any]] = []
    for ch in kanji_list:
        card = by_k.get(ch) or template_briefing(
            context_for(ch),
            ignore_saved_mnemonic=bool(settings.get("_force")),
        )
        card["kanji"] = ch
        card["_skills"] = skills
        if ch not in by_k:
            card["_gap"] = True
        cards.append(_filter_card(card, skills))
    err = " · ".join(errors) if errors else None
    gappy = any(c.get("_gap") for c in cards)
    for card in cards:
        for k in ("_model", "_tier", "_cached", "_fallback"):
            if data.get(k):
                card[k] = data[k]
        if err:
            card["_error"] = err
        _attach_text(card)
    letter = render_chunk(cards)
    if raw and (not letter.strip() or gappy):
        letter = raw
        err = None
    return {
        "cards": cards,
        "text_ru": letter,
        "skills": skills,
        "_raw": bool(raw and (not by_k or gappy)),
        "_model": data.get("_model"),
        "_tier": data.get("_tier"),
        "_cached": data.get("_cached"),
        "_fallback": data.get("_fallback"),
        "_error": err,
        "_partial": data.get("_partial"),
    }


def _filter_card(card: dict[str, Any], skills: list[str]) -> dict[str, Any]:
    keep = {"kanji", "keyword_ru", "tip_ru", "text_ru"}
    mapping = {
        "mnemonic": ("mnemonics", "mnemonic_ru", "reading_hook"),
        "decompose": ("decompose", "parts", "story_ru", "components_story"),
        "readings": ("readings", "onyomi", "kunyomi", "memory_ru", "onyomi_hint", "kunyomi_hint"),
        "lookalikes": ("lookalikes", "pairs", "rule_ru", "lookalike_note"),
        "vocab": ("vocab", "words"),
        "etymology": ("etymology", "type_ru", "explain_ru"),
    }
    allowed = set(keep)
    for s in skills:
        allowed.update(mapping.get(s, ()))
    out = {k: v for k, v in card.items() if k in allowed or str(k).startswith("_")}
    out["_skills"] = skills
    return out


def plan_session_batch(
    session_id: int,
    skills: list[str],
    extra: dict[str, Any] | None = None,
    force: bool = False,
    only: list[str] | None = None,
) -> dict[str, Any]:
    sess = get_session(session_id)
    settings = skill_settings(extra)
    wanted = [s for s in skills if s in COMBINABLE] or [
        s.strip() for s in str(settings["active_skills"]).split(",") if s.strip() in COMBINABLE
    ]
    allow = set(only) if only else None
    chars: list[str] = []
    skipped: list[str] = []
    for row in sess["kanji"]:
        ch = row["kanji"]
        if allow is not None and ch not in allow:
            continue
        if row.get("analyzed") and row.get("briefing") and not force:
            skipped.append(ch)
        else:
            chars.append(ch)
    plan = plan_chunks(chars, wanted, settings)
    rewrite = plan_chunks([row["kanji"] for row in sess["kanji"] if allow is None or row["kanji"] in allow], wanted, settings)
    plan["skipped"] = skipped
    plan["session_id"] = session_id
    plan["rewrite_n"] = rewrite["n_kanji"]
    plan["rewrite_calls"] = rewrite["calls"]
    plan["rewrite_est_out"] = rewrite["est_out_total"]
    return plan


def run_session_chunk(
    session_id: int,
    skills: list[str],
    chunk_index: int,
    extra: dict[str, Any] | None = None,
    force: bool = False,
    only: list[str] | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    plan = plan_session_batch(session_id, skills, extra=extra, force=force, only=only)
    chunks = plan["chunks"]
    if not chunks:
        return {"done": True, "chunk_index": 0, "total_chunks": 0, "cards": [], "text_ru": "Нечего разбирать.", "plan": plan}
    if chunk_index < 0 or chunk_index >= len(chunks):
        return {
            "done": True,
            "chunk_index": chunk_index,
            "total_chunks": len(chunks),
            "next_chunk": None,
            "cards": [],
            "text_ru": "",
            "plan": plan,
        }
    group = chunks[chunk_index]["kanji"]
    settings = plan["settings"]
    full = skill_settings(extra)
    full.update(settings)
    rid = str(run_id or uuid.uuid4())
    ensure_generation_run(session_id, rid, full)
    existing = find_run_chunk(session_id, rid, group)
    if existing:
        next_i = chunk_index + 1
        done = next_i >= len(chunks)
        if done:
            complete_generation_run(rid)
        return {
            "done": done,
            "chunk_index": chunk_index,
            "total_chunks": len(chunks),
            "next_chunk": None if done else next_i,
            "kanji": group,
            "cards": [],
            "text_ru": existing.get("text_ru") or "",
            "message": existing,
            "plan": plan,
            "_cached": True,
        }
    if extra:
        if extra.get("prior_text"):
            full["prior_text"] = extra["prior_text"]
        if extra.get("user_prompt") not in (None,):
            full["user_prompt"] = extra.get("user_prompt") or full.get("user_prompt") or ""
    full["_run_id"] = rid
    full["_force"] = bool(force)
    result = run_combo(group, plan["skills"], full)
    letter = result.get("text_ru") or ""
    raw_letter = bool(result.get("_raw"))
    for card in result["cards"]:
        ch = card["kanji"]
        try:
            old = get_entry(session_id, ch).get("briefing") or {}
        except KeyError:
            old = {}
        merged = {} if force or not isinstance(old, dict) else dict(old)
        merged.update(card)
        merged["text_ru"] = letter if raw_letter else render_card(merged)
        save_briefing(session_id, ch, merged, run_id=rid)
    msg = add_message(
        session_id,
        chunk_index,
        plan["skills"],
        group,
        result["text_ru"],
        {
            "model": result.get("_model"),
            "tier": result.get("_tier"),
            "cached": result.get("_cached"),
            "est_out": chunks[chunk_index].get("est_out"),
            "run_id": rid,
            "settings": {
                "skill_len_global": full.get("skill_len_global"),
                "mnemonic_style": full.get("mnemonic_style"),
            },
        },
    )
    next_i = chunk_index + 1
    done = next_i >= len(chunks)
    if done:
        complete_generation_run(rid)
    return {
        "done": done,
        "chunk_index": chunk_index,
        "total_chunks": len(chunks),
        "next_chunk": None if done else next_i,
        "kanji": group,
        "cards": result["cards"],
        "text_ru": result["text_ru"],
        "message": msg,
        "plan": plan,
        "run_id": rid,
        "_model": result.get("_model"),
        "_cached": result.get("_cached"),
        "_fallback": result.get("_fallback"),
        "_error": result.get("_error"),
    }


def skills_public() -> dict[str, Any]:
    out = []
    for s in list_skills():
        out.append(
            {
                "name": s.name,
                "description": s.description,
                "prompt_id": s.prompt_id,
                "tier": s.tier,
                "llm": bool(s.prompt_id),
                "combinable": bool(s.combinable),
            }
        )
    return {"skills": out, "groups": groups_public()}
