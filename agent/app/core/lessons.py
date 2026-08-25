from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.catalog import ensure_facts_and_cards, load_item, related
from app.core.unlock import grammar_unlocked, taught_ids, taught_today, under_cap, vocab_unlocked
from app.db import execute, fetchall, get_setting


def _next_kanji(taught: set[int]) -> dict[str, Any] | None:
    rows = fetchall(
        """
        SELECT i.id, k.klc_id FROM items i
        JOIN kanji k ON k.item_id = i.id
        WHERE i.type = 'kanji'
        ORDER BY k.klc_id
        """
    )
    for r in rows:
        if r["id"] not in taught:
            return load_item(r["id"])
    return None


def _bundle_components(kanji_id: int, taught: set[int]) -> list[dict[str, Any]]:
    out = []
    for comp in related(kanji_id, "component_of"):
        if comp["id"] in taught:
            continue
        if comp["type"] == "kanji":
            continue
        out.append(comp)
    return out


def _bundle_vocab(kanji_id: int, taught: set[int], extra: set[int]) -> list[dict[str, Any]]:
    known = taught | extra
    cap = int(get_setting("new_vocab_per_day", "15"))
    remaining = max(0, cap - taught_today("vocab"))
    out: list[dict[str, Any]] = []
    rows = fetchall(
        """
        SELECT i.id FROM edges e
        JOIN items i ON i.id = e.from_id
        WHERE e.to_id = ? AND e.kind IN ('uses_kanji', 'illustrates') AND i.type = 'vocab'
        """,
        (kanji_id,),
    )
    seen: set[int] = set()
    for r in rows:
        if r["id"] in seen or r["id"] in taught:
            continue
        seen.add(r["id"])
        if not vocab_unlocked(r["id"], known, extra):
            continue
        item = load_item(r["id"])
        if item:
            out.append(item)
        if len(out) >= min(3, remaining if remaining else 3):
            break
    return out


def _bundle_grammar(taught: set[int], extra: set[int]) -> list[dict[str, Any]]:
    if not under_cap("grammar") and taught_today("grammar") >= int(get_setting("new_grammar_per_day", "3")):
        return []
    remaining = max(0, int(get_setting("new_grammar_per_day", "3")) - taught_today("grammar"))
    if remaining <= 0:
        return []
    rows = fetchall("SELECT id FROM items WHERE type = 'grammar' ORDER BY id")
    known = taught | extra
    for r in rows:
        if r["id"] in taught:
            continue
        if grammar_unlocked(r["id"], known, extra):
            item = load_item(r["id"])
            return [item] if item else []
    return []


def next_lesson_bundle() -> dict[str, Any] | None:
    taught = taught_ids()
    bundle_items: list[dict[str, Any]] = []
    kanji = None
    if under_cap("kanji"):
        kanji = _next_kanji(taught)
    extra: set[int] = set()
    if kanji:
        extra.add(kanji["id"])
        comps = _bundle_components(kanji["id"], taught)
        for c in comps:
            extra.add(c["id"])
        vocabs = _bundle_vocab(kanji["id"], taught, extra)
        for v in vocabs:
            extra.add(v["id"])
        grams = _bundle_grammar(taught, extra)
        bundle_items = comps + [kanji] + vocabs + grams
    else:
        # vocab/grammar only days once kanji cap is hit
        vocabs: list[dict[str, Any]] = []
        if under_cap("vocab"):
            rows = fetchall("SELECT id FROM items WHERE type = 'vocab' ORDER BY id")
            for r in rows:
                if r["id"] in taught:
                    continue
                if vocab_unlocked(r["id"], taught):
                    item = load_item(r["id"])
                    if item:
                        vocabs.append(item)
                if len(vocabs) >= 3:
                    break
        grams = _bundle_grammar(taught, extra)
        bundle_items = vocabs + grams
        if not bundle_items:
            return None

    return {
        "items": bundle_items,
        "focus_id": (kanji or bundle_items[0])["id"],
        "remaining_kanji_today": max(
            0, int(get_setting("new_kanji_per_day", "10")) - taught_today("kanji")
        ),
    }


def lesson_queue_count() -> int:
    b = next_lesson_bundle()
    return 0 if b is None else 1


def complete_lesson(item_ids: list[int]) -> dict[str, Any]:
    taught = taught_ids()
    now = datetime.now(timezone.utc).isoformat()
    completed = []
    for item_id in item_ids:
        item = load_item(item_id)
        if item is None:
            continue
        extra = {
            "onyomi": item.get("onyomi") or item.get("extra", {}).get("onyomi"),
            "kunyomi": item.get("kunyomi") or item.get("extra", {}).get("kunyomi"),
            "reading": item.get("extra", {}).get("reading"),
        }
        if item_id not in taught:
            execute(
                "INSERT OR IGNORE INTO lesson_completions(item_id, taught_at) VALUES (?, ?)",
                (item_id, now),
            )
        ensure_facts_and_cards(item_id, item["type"], extra)
        completed.append(item_id)
    return {"completed": completed, "taught_at": now}
