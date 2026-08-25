from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any

import yaml

from app.core.catalog import add_edge, find_item, find_kanji_item
from app.db import connect, fetchone
from app.paths import SEED_DIR


def _read_json(name: str) -> Any:
    path = SEED_DIR / name
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _read_yaml(name: str) -> Any:
    path = SEED_DIR / name
    if not path.exists():
        return []
    return yaml.safe_load(path.read_text(encoding="utf-8")) or []


def _upsert_item(item_type: str, surface: str, meaning: str, meaning_ru: str | None, extra: dict) -> int:
    conn = connect()
    row = conn.execute(
        "SELECT id FROM items WHERE type = ? AND surface = ?",
        (item_type, surface),
    ).fetchone()
    payload = json.dumps(extra, ensure_ascii=False)
    if row:
        conn.execute(
            "UPDATE items SET primary_meaning = ?, meaning_ru = ?, extra_json = ? WHERE id = ?",
            (meaning, meaning_ru, payload, row["id"]),
        )
        conn.commit()
        return row["id"]
    cur = conn.execute(
        "INSERT INTO items(type, surface, primary_meaning, meaning_ru, extra_json) VALUES (?, ?, ?, ?, ?)",
        (item_type, surface, meaning, meaning_ru, payload),
    )
    conn.commit()
    return int(cur.lastrowid)


def import_components() -> int:
    data = _read_json("components.json")
    count = 0
    for surface, parts in data.items():
        kanji_id = find_kanji_item(surface)
        if kanji_id is None:
            continue
        krow = fetchone("SELECT klc_id FROM kanji WHERE item_id = ?", (kanji_id,))
        src_klc = krow["klc_id"] if krow else 10**9
        for part in parts:
            if not part or part == surface:
                continue
            part_kanji = find_kanji_item(part)
            if part_kanji is not None:
                prow = fetchone("SELECT klc_id FROM kanji WHERE item_id = ?", (part_kanji,))
                if prow and prow["klc_id"] < src_klc:
                    add_edge(kanji_id, part_kanji, "component_of")
                    count += 1
                    continue
            comp_id = find_item("component", part)
            if comp_id is None:
                comp_id = _upsert_item("component", part, part, None, {"primitive": True})
            add_edge(kanji_id, comp_id, "component_of")
            count += 1
    return count


def import_lookalikes() -> int:
    pairs = _read_json("lookalikes.json")
    count = 0
    for pair in pairs:
        if len(pair) < 2:
            continue
        a, b = pair[0], pair[1]
        id_a, id_b = find_kanji_item(a), find_kanji_item(b)
        if not id_a or not id_b:
            continue
        add_edge(id_a, id_b, "lookalike")
        add_edge(id_b, id_a, "lookalike")
        count += 1
    return count


def _kanji_in_surface(surface: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for ch in surface:
        kid = find_kanji_item(ch)
        if kid and kid not in seen:
            seen.add(kid)
            ids.append(kid)
    return ids


def import_vocab() -> int:
    entries = _read_json("vocab.json")
    count = 0
    for entry in entries:
        surface = entry["surface"]
        reading = entry.get("reading") or ""
        meaning = entry.get("meaning") or ""
        meaning_ru = entry.get("meaning_ru")
        extra = {
            "reading": reading,
            "pos": entry.get("pos") or "noun",
            "jlpt": entry.get("jlpt"),
            "frequency": entry.get("frequency"),
        }
        if find_item("vocab", surface):
            vid = find_item("vocab", surface)
        else:
            vid = _upsert_item("vocab", surface, meaning, meaning_ru, extra)
            count += 1
        if vid is None:
            continue
        for kid in _kanji_in_surface(surface):
            add_edge(vid, kid, "uses_kanji")
            add_edge(vid, kid, "illustrates")
    return count


def import_grammar() -> int:
    entries = _read_yaml("grammar.yaml")
    count = 0
    for entry in entries:
        surface = entry["surface"]
        meaning = entry.get("meaning") or ""
        meaning_ru = entry.get("meaning_ru")
        extra = {
            "jlpt": entry.get("jlpt"),
            "examples": entry.get("examples") or [],
            "pattern": entry.get("pattern") or surface,
        }
        gid = _upsert_item("grammar", surface, meaning, meaning_ru, extra)
        for jp in extra["examples"]:
            sentence = jp.get("jp") if isinstance(jp, dict) else str(jp)
            for kid in _kanji_in_surface(sentence or ""):
                add_edge(gid, kid, "uses_kanji")
        for word in entry.get("uses_vocab") or []:
            vid = find_item("vocab", word)
            if vid:
                add_edge(gid, vid, "uses_grammar")
        count += 1
    return count


_import_lock = threading.Lock()
_import_done: dict[str, Any] | None = None


def import_all_seed() -> dict[str, int]:
    global _import_done
    from app.core.import_klc import import_klc

    with _import_lock:
        if _import_done is not None:
            return _import_done
        result = {
            "kanji": import_klc(),
            "components": import_components(),
            "lookalikes": import_lookalikes(),
            "vocab": import_vocab(),
            "grammar": import_grammar(),
            "imported_at": datetime.now(timezone.utc).isoformat(),
        }
        _import_done = result
        return result
