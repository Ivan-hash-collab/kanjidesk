from __future__ import annotations

import json
from typing import Any

from app.core.fsrs_engine import new_card, persist_card
from app.db import connect, execute, fetchone

def ensure_facts_and_cards(item_id: int, item_type: str, extra: dict[str, Any] | None = None) -> list[int]:
    extra = extra or {}
    kinds: list[str] = []
    if item_type == "kanji":
        kinds.append("meaning")
        if (extra.get("onyomi") or "").strip():
            kinds.append("onyomi")
        if (extra.get("kunyomi") or "").strip():
            kinds.append("kunyomi")
    elif item_type == "vocab":
        kinds.extend(["meaning", "reading"])
    elif item_type == "grammar":
        kinds.extend(["recognize", "produce"])
    else:
        kinds.append("meaning")

    fact_ids: list[int] = []
    conn = connect()
    for kind in kinds:
        conn.execute(
            "INSERT OR IGNORE INTO facts(item_id, kind) VALUES (?, ?)",
            (item_id, kind),
        )
        row = conn.execute(
            "SELECT id FROM facts WHERE item_id = ? AND kind = ?",
            (item_id, kind),
        ).fetchone()
        fact_id = row["id"]
        fact_ids.append(fact_id)
        existing = conn.execute("SELECT fact_id FROM cards WHERE fact_id = ?", (fact_id,)).fetchone()
        if existing is None:
            persist_card(fact_id, new_card())
    conn.commit()
    return fact_ids


def accepted_for_fact(fact_row, item_row, synonyms: list[str]) -> set[str]:
    from app.core.matching import meaning_variants, reading_variants

    kind = fact_row["kind"]
    extra = json.loads(item_row["extra_json"] or "{}")
    if kind in ("meaning", "recognize", "produce"):
        return meaning_variants(item_row["primary_meaning"], item_row["meaning_ru"], synonyms)
    if kind == "onyomi":
        raw = extra.get("onyomi") or ""
        if item_row["type"] == "kanji":
            k = fetchone("SELECT onyomi FROM kanji WHERE item_id = ?", (item_row["id"],))
            raw = (k["onyomi"] if k else raw) or raw
        return reading_variants(raw)
    if kind == "kunyomi":
        raw = extra.get("kunyomi") or ""
        if item_row["type"] == "kanji":
            k = fetchone("SELECT kunyomi FROM kanji WHERE item_id = ?", (item_row["id"],))
            raw = (k["kunyomi"] if k else raw) or raw
        return reading_variants(raw)
    if kind == "reading":
        return reading_variants(extra.get("reading") or extra.get("kana") or "")
    return meaning_variants(item_row["primary_meaning"], item_row["meaning_ru"], synonyms)


def load_item(item_id: int) -> dict[str, Any] | None:
    row = fetchone("SELECT * FROM items WHERE id = ?", (item_id,))
    if row is None:
        return None
    item = {k: row[k] for k in row.keys()}
    extra = json.loads(item.get("extra_json") or "{}")
    item["extra"] = extra
    if item["type"] == "kanji":
        k = fetchone("SELECT * FROM kanji WHERE item_id = ?", (item_id,))
        if k:
            item["klc_id"] = k["klc_id"]
            item["page_no"] = k["page_no"]
            item["onyomi"] = k["onyomi"]
            item["kunyomi"] = k["kunyomi"]
    item["synonyms"] = [
        r["text"] for r in connect().execute("SELECT text FROM synonyms WHERE item_id = ?", (item_id,)).fetchall()
    ]
    mnem = fetchone(
        """
        SELECT text, source, locale FROM mnemonics
        WHERE item_id = ? ORDER BY CASE source WHEN 'user' THEN 0 WHEN 'ai' THEN 1 ELSE 2 END, id DESC
        LIMIT 1
        """,
        (item_id,),
    )
    item["mnemonic"] = {k: mnem[k] for k in mnem.keys()} if mnem else None
    item["taught"] = fetchone("SELECT taught_at FROM lesson_completions WHERE item_id = ?", (item_id,)) is not None
    item["components"] = related(item_id, "component_of")
    item["lookalikes"] = related(item_id, "lookalike")
    item["vocab"] = related(item_id, "uses_kanji", invert=True)
    item["illustrates"] = related(item_id, "illustrates")
    item["grammar"] = related(item_id, "uses_grammar", invert=True)
    return item


def related(item_id: int, kind: str, invert: bool = False) -> list[dict[str, Any]]:
    if invert:
        rows = connect().execute(
            """
            SELECT i.* FROM edges e
            JOIN items i ON i.id = e.from_id
            WHERE e.to_id = ? AND e.kind = ?
            """,
            (item_id, kind),
        ).fetchall()
    else:
        rows = connect().execute(
            """
            SELECT i.* FROM edges e
            JOIN items i ON i.id = e.to_id
            WHERE e.from_id = ? AND e.kind = ?
            """,
            (item_id, kind),
        ).fetchall()
    out = []
    for r in rows:
        d = {k: r[k] for k in r.keys()}
        extra = json.loads(d.get("extra_json") or "{}")
        d["extra"] = extra
        if d["type"] == "kanji":
            k = fetchone("SELECT klc_id, onyomi, kunyomi FROM kanji WHERE item_id = ?", (d["id"],))
            if k:
                d["klc_id"] = k["klc_id"]
                d["onyomi"] = k["onyomi"]
                d["kunyomi"] = k["kunyomi"]
        out.append(d)
    return out


def add_edge(from_id: int, to_id: int, kind: str) -> None:
    if from_id == to_id:
        return
    execute(
        "INSERT OR IGNORE INTO edges(from_id, to_id, kind) VALUES (?, ?, ?)",
        (from_id, to_id, kind),
    )


def find_kanji_item(surface: str) -> int | None:
    row = fetchone(
        "SELECT id FROM items WHERE type = 'kanji' AND surface = ?",
        (surface,),
    )
    return row["id"] if row else None


def find_item(item_type: str, surface: str) -> int | None:
    row = fetchone(
        "SELECT id FROM items WHERE type = ? AND surface = ?",
        (item_type, surface),
    )
    return row["id"] if row else None
