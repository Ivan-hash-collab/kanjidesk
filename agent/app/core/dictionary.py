from __future__ import annotations

from typing import Any

from app.core.catalog import load_item
from app.core.unlock import taught_ids
from app.db import fetchall


def highlight_known(surface: str, taught: set[int], kanji_map: dict[str, int]) -> list[dict[str, Any]]:
    out = []
    for ch in surface:
        kid = kanji_map.get(ch)
        out.append(
            {
                "ch": ch,
                "item_id": kid,
                "known": bool(kid and kid in taught),
                "is_kanji": kid is not None,
            }
        )
    return out


def kanji_surface_map() -> dict[str, int]:
    rows = fetchall("SELECT id, surface FROM items WHERE type = 'kanji'")
    return {r["surface"]: r["id"] for r in rows}


def search(query: str, limit: int = 40) -> list[dict[str, Any]]:
    q = f"%{query.strip()}%"
    rows = fetchall(
        """
        SELECT i.id FROM items i
        LEFT JOIN kanji k ON k.item_id = i.id
        WHERE i.surface LIKE ? OR i.primary_meaning LIKE ? OR i.meaning_ru LIKE ?
           OR IFNULL(k.onyomi, '') LIKE ? OR IFNULL(k.kunyomi, '') LIKE ?
           OR IFNULL(i.extra_json, '') LIKE ?
        ORDER BY CASE i.type WHEN 'kanji' THEN 0 WHEN 'vocab' THEN 1 WHEN 'grammar' THEN 2 ELSE 3 END, i.id
        LIMIT ?
        """,
        (q, q, q, q, q, q, limit),
    )
    taught = taught_ids()
    kmap = kanji_surface_map()
    results = []
    for r in rows:
        item = load_item(r["id"])
        if not item:
            continue
        item["highlight"] = highlight_known(item["surface"], taught, kmap)
        item["known"] = item["id"] in taught
        results.append(item)
    return results
