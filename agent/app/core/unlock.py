from __future__ import annotations

from datetime import datetime, timezone

from app.db import fetchall, fetchone, get_setting


def today_prefix() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def taught_ids() -> set[int]:
    return {r["item_id"] for r in fetchall("SELECT item_id FROM lesson_completions")}


def taught_today(item_type: str) -> int:
    day = today_prefix()
    row = fetchone(
        """
        SELECT COUNT(*) AS n FROM lesson_completions lc
        JOIN items i ON i.id = lc.item_id
        WHERE i.type = ? AND lc.taught_at LIKE ?
        """,
        (item_type, f"{day}%"),
    )
    return int(row["n"] if row else 0)


def under_cap(item_type: str) -> bool:
    key = {
        "kanji": "new_kanji_per_day",
        "vocab": "new_vocab_per_day",
        "grammar": "new_grammar_per_day",
        "component": "new_kanji_per_day",
    }[item_type]
    cap = int(get_setting(key, "10"))
    return taught_today("kanji" if item_type == "component" else item_type) < cap


def vocab_unlocked(vocab_id: int, taught: set[int], extra_taught: set[int] | None = None) -> bool:
    known = taught | (extra_taught or set())
    rows = fetchall(
        "SELECT to_id FROM edges WHERE from_id = ? AND kind = 'uses_kanji'",
        (vocab_id,),
    )
    if not rows:
        return True
    return all(r["to_id"] in known for r in rows)


def grammar_unlocked(grammar_id: int, taught: set[int], extra_taught: set[int] | None = None) -> bool:
    """Unlock if all deps are already taught, or exactly one new dep is in this lesson bundle."""
    extra = extra_taught or set()
    deps = fetchall(
        """
        SELECT to_id FROM edges
        WHERE from_id = ? AND kind IN ('uses_kanji', 'uses_grammar')
        """,
        (grammar_id,),
    )
    unknown = [r["to_id"] for r in deps if r["to_id"] not in taught]
    if len(unknown) == 0:
        return True
    if len(unknown) == 1 and unknown[0] in extra:
        return True
    return False
