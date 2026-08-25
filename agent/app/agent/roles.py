from __future__ import annotations

from typing import Any

from app.agent.router import generate_json
from app.core.catalog import load_item
from app.db import execute
from datetime import datetime, timezone


MNEMONIC_SYSTEM = """Ты MnemonicSmith для приложения запоминания кандзи.
Пиши оригинальные мнемоники на русском. Не копируй тексты Kodansha, WaniKani, Heisig.
Свяжи графические компоненты с английским keyword и русским образом.
Верни JSON: {"mnemonic_ru": str, "reading_hint": str, "lookalike_note": str}
Коротко: 2–5 предложений."""

TUTOR_SYSTEM = """Ты Tutor в приложении кандзи. Разбери ошибку ученика.
Сравни ответ с правильным, укажи похожие знаки если уместно.
Верни JSON: {"explanation_ru": str, "tip_ru": str}"""

SENTENCE_SYSTEM = """Ты SentenceSmith. Составь одно предложение i+1: вся лексика известна, кроме целевого слова/знака.
Верни JSON: {"jp": str, "reading": str, "ru": str}"""

GRAMMAR_SYSTEM = """Ты GrammarGuide. Объясни грамматическую конструкцию по-русски на известных словах.
Верни JSON: {"explanation_ru": str, "example_jp": str, "example_ru": str}"""

CHAT_SYSTEM = """Ты агент KanjyMemo. Отвечай по-русски по текущему предмету (кандзи/слово/грамматика).
Верни JSON: {"reply_ru": str}"""


def template_mnemonic(item: dict[str, Any]) -> dict[str, Any]:
    parts = [c.get("surface") for c in item.get("components") or [] if c.get("surface")]
    meaning = item.get("primary_meaning") or ""
    meaning_ru = item.get("meaning_ru") or ""
    joined = " + ".join(parts) if parts else item.get("surface", "")
    text = f"{joined} → {meaning}."
    if meaning_ru:
        text += f" По-русски: {meaning_ru}."
    if parts:
        text += f" Представь «{meaning}» через части: {', '.join(parts)}."
    look = item.get("lookalikes") or []
    note = ""
    if look:
        other = look[0]
        note = f"Не путай с {other.get('surface')} ({other.get('primary_meaning')})."
        text += " " + note
    return {
        "mnemonic_ru": text,
        "reading_hint": item.get("onyomi") or item.get("extra", {}).get("reading") or "",
        "lookalike_note": note,
        "_fallback": "template",
        "_model": None,
    }


def mnemonic_for(item_id: int, first: bool = False) -> dict[str, Any]:
    item = load_item(item_id)
    if item is None:
        raise KeyError(item_id)
    payload = {
        "surface": item["surface"],
        "meaning": item["primary_meaning"],
        "meaning_ru": item.get("meaning_ru"),
        "onyomi": item.get("onyomi"),
        "kunyomi": item.get("kunyomi"),
        "components": [c.get("surface") for c in item.get("components") or []],
        "lookalikes": [
            {"surface": x.get("surface"), "meaning": x.get("primary_meaning")}
            for x in item.get("lookalikes") or []
        ],
    }
    user = f"Предмет: {json_payload(payload)}"
    data = generate_json(
        "mnemonic_first" if first else "mnemonic",
        MNEMONIC_SYSTEM,
        user,
        payload,
        prefer_quality=first and item["type"] == "kanji",
    )
    if data.get("_fallback") == "template" or not data.get("mnemonic_ru"):
        data = {**template_mnemonic(item), **{k: data.get(k) for k in ("_error", "_tier", "_model") if data.get(k)}}
    text = data.get("mnemonic_ru") or template_mnemonic(item)["mnemonic_ru"]
    source = "template" if data.get("_fallback") == "template" else "ai"
    execute(
        "INSERT INTO mnemonics(item_id, locale, source, text, created_at) VALUES (?, 'ru', ?, ?, ?)",
        (item_id, source, text, datetime.now(timezone.utc).isoformat()),
    )
    data["mnemonic_ru"] = text
    data["source"] = source
    return data


def json_payload(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)


def tutor(item_id: int, fact_kind: str, answer: str, correct: bool) -> dict[str, Any]:
    item = load_item(item_id)
    if item is None:
        raise KeyError(item_id)
    payload = {
        "surface": item["surface"],
        "meaning": item["primary_meaning"],
        "fact_kind": fact_kind,
        "answer": answer,
        "correct": correct,
        "lookalikes": [x.get("surface") for x in item.get("lookalikes") or []],
    }
    data = generate_json("tutor", TUTOR_SYSTEM, json_payload(payload), payload)
    if data.get("_fallback") == "template" or not data.get("explanation_ru"):
        if correct:
            expl = f"Верно: {item['surface']} — {item['primary_meaning']}."
        else:
            expl = f"{item['surface']} значит «{item['primary_meaning']}». Ваш ответ «{answer}» не совпал."
            looks = item.get("lookalikes") or []
            if looks:
                expl += f" Часто путают с {looks[0]['surface']} ({looks[0]['primary_meaning']})."
        data = {
            "explanation_ru": expl,
            "tip_ru": "Проговорите мнемонику вслух и закройте карточку.",
            "_fallback": "template",
        }
    return data


def sentence_for(item_id: int) -> dict[str, Any]:
    item = load_item(item_id)
    if item is None:
        raise KeyError(item_id)
    payload = {"surface": item["surface"], "meaning": item["primary_meaning"], "type": item["type"]}
    data = generate_json("sentence", SENTENCE_SYSTEM, json_payload(payload), payload)
    if data.get("_fallback") == "template" or not data.get("jp"):
        data = {
            "jp": f"{item['surface']}",
            "reading": item.get("extra", {}).get("reading") or "",
            "ru": item.get("meaning_ru") or item["primary_meaning"],
            "_fallback": "template",
        }
    return data


def grammar_guide(item_id: int) -> dict[str, Any]:
    item = load_item(item_id)
    if item is None:
        raise KeyError(item_id)
    payload = {
        "surface": item["surface"],
        "meaning": item["primary_meaning"],
        "examples": item.get("extra", {}).get("examples") or [],
    }
    data = generate_json("grammar_hard", GRAMMAR_SYSTEM, json_payload(payload), payload, prefer_quality=True)
    if data.get("_fallback") == "template" or not data.get("explanation_ru"):
        data = {
            "explanation_ru": f"{item['surface']}: {item.get('meaning_ru') or item['primary_meaning']}.",
            "example_jp": "",
            "example_ru": "",
            "_fallback": "template",
        }
        examples = item.get("extra", {}).get("examples") or []
        if examples:
            ex = examples[0]
            if isinstance(ex, dict):
                data["example_jp"] = ex.get("jp") or ""
                data["example_ru"] = ex.get("ru") or ""
    return data


def chat(item_id: int | None, message: str) -> dict[str, Any]:
    item = load_item(item_id) if item_id else None
    payload = {"message": message, "item": None if not item else {"surface": item["surface"], "meaning": item["primary_meaning"], "type": item["type"]}}
    data = generate_json("chat", CHAT_SYSTEM, json_payload(payload), payload)
    if data.get("_fallback") == "template" or not data.get("reply_ru"):
        if item:
            data = {"reply_ru": f"{item['surface']} — {item['primary_meaning']}. {item.get('mnemonic') or {}}", "_fallback": "template"}
            mnem = item.get("mnemonic") or {}
            data["reply_ru"] = f"{item['surface']} — {item['primary_meaning']}. {mnem.get('text') or 'Мнемоника ещё не создана.'}"
        else:
            data = {"reply_ru": "Откройте карточку предмета, чтобы я опирался на каталог.", "_fallback": "template"}
    return data
