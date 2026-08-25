from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.db import execute, fetchall, fetchone, tx


def get_user_note(kanji: str) -> dict[str, str]:
    row = fetchone("SELECT mnemonic, notes FROM kanji_notes WHERE kanji = ?", (kanji,))
    if row is None:
        return {"mnemonic": "", "notes": ""}
    return {"mnemonic": row["mnemonic"] or "", "notes": row["notes"] or ""}


def save_user_note(
    kanji: str,
    mnemonic: str | None = None,
    notes: str | None = None,
) -> dict[str, str]:
    if not kanji:
        raise ValueError("нет знака")
    current = get_user_note(kanji)
    next_mnemonic = current["mnemonic"] if mnemonic is None else mnemonic
    next_notes = current["notes"] if notes is None else notes
    now = datetime.now(timezone.utc).isoformat()
    execute(
        """
        INSERT INTO kanji_notes(kanji, mnemonic, notes, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kanji) DO UPDATE SET
            mnemonic = excluded.mnemonic,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        """,
        (kanji, next_mnemonic, next_notes, now),
    )
    return {"kanji": kanji, "mnemonic": next_mnemonic or "", "notes": next_notes or ""}


def list_user_notes() -> list[dict[str, Any]]:
    rows = fetchall("SELECT kanji, mnemonic, notes, updated_at FROM kanji_notes ORDER BY kanji")
    return [dict(r) for r in rows]


def clear_user_notes() -> int:
    with tx() as conn:
        cur = conn.execute("DELETE FROM kanji_notes")
        return int(cur.rowcount or 0)
