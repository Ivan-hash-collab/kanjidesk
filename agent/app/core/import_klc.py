from __future__ import annotations

import json
from pathlib import Path

from app.db import connect, fetchone
from app.paths import KLC_SEED, KLC_TSV


def _klc_path() -> Path:
    if KLC_SEED.exists():
        return KLC_SEED
    return KLC_TSV


def import_klc() -> int:
    """Load 2300 KLC rows. Idempotent: skips if kanji already present."""
    conn = connect()
    existing = conn.execute("SELECT COUNT(*) AS n FROM kanji").fetchone()["n"]
    if existing >= 2300:
        return existing

    path = _klc_path()
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    imported = 0
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        klc_id = int(parts[0].strip())
        surface = parts[1].strip()
        meaning = parts[2].strip()
        onyomi = parts[3].strip()
        kunyomi = parts[4].strip()
        page_no = int(parts[5].strip() or 0)
        if fetchone("SELECT item_id FROM kanji WHERE klc_id = ?", (klc_id,)):
            continue
        extra = json.dumps({"onyomi": onyomi, "kunyomi": kunyomi, "page_no": page_no}, ensure_ascii=False)
        cur = conn.execute(
            "INSERT INTO items(type, surface, primary_meaning, meaning_ru, extra_json) VALUES (?, ?, ?, ?, ?)",
            ("kanji", surface, meaning, None, extra),
        )
        item_id = cur.lastrowid
        conn.execute(
            "INSERT INTO kanji(item_id, klc_id, page_no, onyomi, kunyomi) VALUES (?, ?, ?, ?, ?)",
            (item_id, klc_id, page_no, onyomi, kunyomi),
        )
        imported += 1
    conn.commit()
    return existing + imported
