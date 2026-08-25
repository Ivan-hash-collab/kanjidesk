from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.catalog import accepted_for_fact, load_item
from app.core.fsrs_engine import review_card
from app.core.matching import answers_match
from app.core.stages import stage_for_card
from app.db import connect, execute, fetchall, fetchone


def due_reviews(limit: int = 80) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    rows = fetchall(
        """
        SELECT c.*, f.kind AS fact_kind, f.item_id, i.type AS item_type, i.surface, i.primary_meaning
        FROM cards c
        JOIN facts f ON f.id = c.fact_id
        JOIN items i ON i.id = f.item_id
        JOIN lesson_completions lc ON lc.item_id = i.id
        WHERE c.due <= ?
        ORDER BY c.due
        LIMIT ?
        """,
        (now, limit),
    )
    out = []
    for r in rows:
        card = json.loads(r["card_json"])
        out.append(
            {
                "fact_id": r["fact_id"],
                "item_id": r["item_id"],
                "item_type": r["item_type"],
                "surface": r["surface"],
                "primary_meaning": r["primary_meaning"],
                "fact_kind": r["fact_kind"],
                "due": r["due"],
                "stage": stage_for_card(card),
            }
        )
    return out


def review_prompt(fact_id: int) -> dict[str, Any]:
    row = fetchone(
        """
        SELECT f.*, i.type AS item_type, i.surface, i.primary_meaning, i.meaning_ru
        FROM facts f JOIN items i ON i.id = f.item_id
        WHERE f.id = ?
        """,
        (fact_id,),
    )
    if row is None:
        raise KeyError(fact_id)
    item = load_item(row["item_id"])
    prompt = {
        "fact_id": fact_id,
        "item_id": row["item_id"],
        "item_type": row["item_type"],
        "surface": row["surface"],
        "fact_kind": row["kind"],
        "question": _question_for(row["kind"], row["item_type"], row["surface"]),
        "item": item,
    }
    return prompt


def _question_for(kind: str, item_type: str, surface: str) -> str:
    if kind == "meaning":
        return f"Значение {surface}"
    if kind == "onyomi":
        return f"Онъёми {surface}"
    if kind == "kunyomi":
        return f"Кунъёми {surface}"
    if kind == "reading":
        return f"Чтение {surface}"
    if kind == "recognize":
        return f"Что означает конструкция {surface}?"
    if kind == "produce":
        return f"Когда использовать {surface}?"
    return surface


def suggested_rating(correct: bool, duration_ms: int | None, used_hint: bool) -> int:
    if not correct:
        return 1  # Again
    if used_hint:
        return 2  # Hard
    ms = duration_ms or 8000
    if ms < 4000:
        return 4  # Easy
    if ms > 15000:
        return 2
    return 3  # Good


def submit_review(
    fact_id: int,
    answer: str,
    duration_ms: int | None = None,
    used_hint: bool = False,
    rating: int | None = None,
    affect_srs: bool = True,
) -> dict[str, Any]:
    fact = fetchone("SELECT * FROM facts WHERE id = ?", (fact_id,))
    if fact is None:
        raise KeyError(fact_id)
    item_row = fetchone("SELECT * FROM items WHERE id = ?", (fact["item_id"],))
    syn = [r["text"] for r in connect().execute("SELECT text FROM synonyms WHERE item_id = ?", (fact["item_id"],)).fetchall()]
    accepted = accepted_for_fact(fact, item_row, syn)
    correct = answers_match(answer, accepted)
    suggested = suggested_rating(correct, duration_ms, used_hint)
    final_rating = int(rating or suggested)
    if not correct:
        final_rating = 1
    item = load_item(fact["item_id"])
    result: dict[str, Any] = {
        "correct": correct,
        "accepted": sorted(list(accepted))[:12],
        "suggested_rating": suggested,
        "rating": final_rating,
        "item": item,
        "fact_kind": fact["kind"],
        "srs": None,
    }
    if affect_srs:
        srs = review_card(fact_id, final_rating)
        result["srs"] = srs
        execute(
            """
            INSERT INTO review_log(fact_id, rating, duration_ms, answer, correct, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                fact_id,
                final_rating,
                duration_ms,
                answer,
                1 if correct else 0,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    return result


def practice_queue(limit: int = 40, item_type: str | None = None) -> list[dict[str, Any]]:
    sql = """
        SELECT f.id AS fact_id, f.kind AS fact_kind, f.item_id, i.type AS item_type, i.surface, i.primary_meaning
        FROM facts f
        JOIN items i ON i.id = f.item_id
        JOIN lesson_completions lc ON lc.item_id = i.id
        JOIN cards c ON c.fact_id = f.id
    """
    params: tuple[Any, ...] = ()
    if item_type:
        sql += " WHERE i.type = ?"
        params = (item_type,)
    sql += " ORDER BY RANDOM() LIMIT ?"
    params = params + (limit,)
    rows = fetchall(sql, params)
    return [
        {
            "fact_id": r["fact_id"],
            "item_id": r["item_id"],
            "item_type": r["item_type"],
            "surface": r["surface"],
            "primary_meaning": r["primary_meaning"],
            "fact_kind": r["fact_kind"],
        }
        for r in rows
    ]
