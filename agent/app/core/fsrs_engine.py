from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fsrs import Card, Rating, Scheduler

from app.db import fetchone, get_setting, execute


def _scheduler() -> Scheduler:
    retention = float(get_setting("desired_retention", "0.9"))
    return Scheduler(desired_retention=retention, enable_fuzzing=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def card_from_row(row) -> Card:
    data = json.loads(row["card_json"])
    return Card.from_dict(data)


def card_to_json(card: Card) -> str:
    return json.dumps(card.to_dict())


def persist_card(fact_id: int, card: Card) -> None:
    execute(
        """
        INSERT INTO cards(fact_id, card_json, due, stability, difficulty, reps, lapses, state, last_review)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fact_id) DO UPDATE SET
            card_json = excluded.card_json,
            due = excluded.due,
            stability = excluded.stability,
            difficulty = excluded.difficulty,
            reps = excluded.reps,
            lapses = excluded.lapses,
            state = excluded.state,
            last_review = excluded.last_review
        """,
        (
            fact_id,
            card_to_json(card),
            card.due.isoformat(),
            card.stability,
            card.difficulty,
            getattr(card, "reps", 0) or 0,
            _lapses(card),
            int(card.state),
            card.last_review.isoformat() if card.last_review else None,
        ),
    )


def _lapses(card: Card) -> int:
    # py-fsrs Card has no reps/lapses fields in v6; keep 0 in columns derived from log if missing
    return int(getattr(card, "lapses", 0) or 0)


def new_card(due_in_minutes: int | None = None) -> Card:
    card = Card()
    delay = due_in_minutes
    if delay is None:
        delay = int(get_setting("lesson_to_review_delay_minutes", "0"))
    if delay > 0:
        card.due = utcnow() + timedelta(minutes=delay)
    return card


def review_card(fact_id: int, rating: int) -> dict[str, Any]:
    row = fetchone("SELECT * FROM cards WHERE fact_id = ?", (fact_id,))
    if row is None:
        raise KeyError(f"no card for fact {fact_id}")
    scheduler = _scheduler()
    card = card_from_row(row)
    updated, log = scheduler.review_card(card, Rating(rating))
    persist_card(fact_id, updated)
    retr = scheduler.get_card_retrievability(updated)
    return {
        "card": updated.to_dict(),
        "rating": int(rating),
        "retrievability": retr,
        "review_log": {
            "card_id": log.card_id,
            "rating": int(log.rating),
            "review_datetime": log.review_datetime.isoformat(),
        },
    }


def retrievability(card_dict: dict[str, Any]) -> float:
    try:
        card = Card.from_dict(card_dict)
        return float(_scheduler().get_card_retrievability(card) or 0)
    except Exception:
        return 0.0
