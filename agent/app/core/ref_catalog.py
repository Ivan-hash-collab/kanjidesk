from __future__ import annotations

import json
import sqlite3
from functools import lru_cache
from typing import Any

from app.core import ids_tree, kanjium
from app.core.kana import format_readings, kata_to_hira
from app.core.user_notes import get_user_note, save_user_note
from app.paths import KKLC_DB, SEED_DIR


def _ref() -> sqlite3.Connection | None:
    if not KKLC_DB.exists():
        return None
    conn = sqlite3.connect(str(KKLC_DB))
    conn.row_factory = sqlite3.Row
    return conn


def lookup(kanji: str) -> dict[str, Any] | None:
    conn = _ref()
    if conn is None:
        return None
    try:
        row = conn.execute("SELECT * FROM kklc_kanji WHERE kanji = ?", (kanji,)).fetchone()
        if row is None:
            return None
        return {k: row[k] for k in row.keys()}
    finally:
        conn.close()


def search(query: str, limit: int = 40) -> list[dict[str, Any]]:
    q = f"%{query.strip()}%"
    conn = _ref()
    if conn is None:
        return []
    try:
        rows = conn.execute(
            """
            SELECT * FROM kklc_kanji
            WHERE kanji LIKE ? OR meaning LIKE ? OR IFNULL(onyomi,'') LIKE ?
               OR IFNULL(kunyomi,'') LIKE ? OR CAST(id AS TEXT) = ?
            ORDER BY id
            LIMIT ?
            """,
            (q, q, q, q, query.strip(), limit),
        ).fetchall()
        items = [{k: r[k] for k in r.keys()} for r in rows]
        for it in items:
            it["onyomi_fmt"] = format_readings(it.get("onyomi") or "")
            it["kunyomi_fmt"] = format_readings(it.get("kunyomi") or "")
        return items
    finally:
        conn.close()


def save_user_fields(kanji: str, mnemonic: str | None = None, notes: str | None = None) -> dict[str, str]:
    """Persist user-authored fields in the user database, never the KKLC reference DB."""
    return save_user_note(kanji, mnemonic=mnemonic, notes=notes)


@lru_cache(maxsize=1)
def lookalikes_map() -> dict[str, list[str]]:
    path = SEED_DIR / "lookalikes.json"
    out: dict[str, list[str]] = {}
    if path.exists():
        pairs = json.loads(path.read_text(encoding="utf-8"))
        for pair in pairs:
            if len(pair) < 2:
                continue
            a, b = pair[0], pair[1]
            out.setdefault(a, [])
            out.setdefault(b, [])
            if b not in out[a]:
                out[a].append(b)
            if a not in out[b]:
                out[b].append(a)
    for k, others in kanjium.lookalike_map().items():
        bucket = out.setdefault(k, [])
        for o in others:
            if o not in bucket:
                bucket.append(o)
    return out


def _contains(inner: str, outer: str) -> bool:
    if inner == outer:
        return False
    t = ids_tree.tree_for(outer)
    if t.get("primitive"):
        return False
    return inner in (t.get("parts") or []) or inner in (t.get("leaves") or [])


def _strokes(ch: str) -> int:
    raw = kanjium.lookup(ch).get("strokes") or ""
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _is_visual_pair(a: str, b: str) -> bool:
    """Drop 'lookalikes' that are really compounds (日 vs 間) with very different complexity."""
    if _contains(a, b) or _contains(b, a):
        sa, sb = _strokes(a), _strokes(b)
        if sa and sb and abs(sa - sb) > 3:
            return False
    return True


def _like_rows(kanji: str) -> list[dict[str, str]]:
    likes = [o for o in (lookalikes_map().get(kanji) or []) if _is_visual_pair(kanji, o)]
    like_rows = []
    for other in likes[:8]:
        o = lookup(other)
        meaning = (o.get("meaning") if o else "") or ""
        kj = kanjium.lookup(other)
        if not meaning:
            meaning = kj.get("compact_meaning") or ""
        like_rows.append({"kanji": other, "meaning": meaning})
    return like_rows


def context_for(kanji: str) -> dict[str, Any]:
    cat = lookup(kanji) or {}
    tree = ids_tree.tree_for(kanji)
    kj = kanjium.lookup(kanji)
    like_rows = _like_rows(kanji)
    parts = tree["parts"] if not tree["primitive"] else []
    part_notes = [kanjium.describe_component(p) for p in (tree["leaves"] if not tree["primitive"] else [])]
    onyomi_raw = cat.get("onyomi") or ""
    kunyomi_raw = cat.get("kunyomi") or ""
    user = get_user_note(kanji)
    return {
        "kanji": kanji,
        "catalog_id": cat.get("id"),
        "in_kklc": bool(cat),
        "meaning": cat.get("meaning") or kj.get("compact_meaning") or "",
        "onyomi": format_readings(onyomi_raw),
        "kunyomi": format_readings(kunyomi_raw),
        "onyomi_raw": onyomi_raw,
        "kunyomi_raw": kunyomi_raw,
        "onyomi_hira": kata_to_hira(onyomi_raw),
        "page": cat.get("PageNo") or cat.get("page_no"),
        "my_mnemonic": user["mnemonic"] or cat.get("my_mnemonic") or "",
        "my_notes": user["notes"] or cat.get("my_notes") or "",
        "components": parts,
        "ids_formula": tree["ids"],
        "ids_parts": " ".join(parts) if parts else kanji,
        "ids_leaves": " ".join(tree["leaves"]),
        "ids_layout": tree["layout_ru"],
        "ids_facts": ids_tree.facts_ru(kanji),
        "ids_tree": ids_tree.dump_tree_ru(kanji),
        "ids_primitive": tree["primitive"],
        "part_notes": part_notes,
        "radical": kj.get("radical") or "",
        "radical_meaning": kj.get("radical_meaning") or "",
        "phonetic": kj.get("phonetic") or "",
        "etym_type": kj.get("etym_type") or "",
        "compact_meaning": kj.get("compact_meaning") or "",
        "wanikani_level": kj.get("wanikani_level") or "",
        "strokes": kj.get("strokes") or "",
        "lookalikes": like_rows,
        "lookalikes_fmt": ", ".join(f"{x['kanji']} ({x['meaning']})" if x["meaning"] else x["kanji"] for x in like_rows),
    }
