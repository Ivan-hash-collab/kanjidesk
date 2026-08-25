from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.lessons import lesson_queue_count, next_lesson_bundle
from app.core.reviews import due_reviews
from app.core.stages import STAGE_ORDER, stage_for_card
from app.db import fetchall, fetchone


def dashboard() -> dict[str, Any]:
    due = due_reviews(limit=500)
    bundle = next_lesson_bundle()
    total_kanji = fetchone("SELECT COUNT(*) AS n FROM kanji")["n"]
    taught_kanji = fetchone(
        """
        SELECT COUNT(*) AS n FROM lesson_completions lc
        JOIN items i ON i.id = lc.item_id WHERE i.type = 'kanji'
        """
    )["n"]
    taught_vocab = fetchone(
        """
        SELECT COUNT(*) AS n FROM lesson_completions lc
        JOIN items i ON i.id = lc.item_id WHERE i.type = 'vocab'
        """
    )["n"]
    taught_grammar = fetchone(
        """
        SELECT COUNT(*) AS n FROM lesson_completions lc
        JOIN items i ON i.id = lc.item_id WHERE i.type = 'grammar'
        """
    )["n"]
    stages = {name: 0 for name in STAGE_ORDER}
    for row in fetchall("SELECT card_json FROM cards"):
        st = stage_for_card(json.loads(row["card_json"]))
        stages[st] = stages.get(st, 0) + 1
    next_due = fetchone(
        """
        SELECT MIN(due) AS due FROM cards c
        JOIN facts f ON f.id = c.fact_id
        JOIN lesson_completions lc ON lc.item_id = f.item_id
        """
    )
    return {
        "reviews_due": len(due),
        "lessons_available": 0 if bundle is None else len(bundle["items"]),
        "lesson_bundle": bundle,
        "kanji_taught": taught_kanji,
        "kanji_total": total_kanji,
        "vocab_taught": taught_vocab,
        "grammar_taught": taught_grammar,
        "stages": stages,
        "next_due": next_due["due"] if next_due else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "has_lesson": bundle is not None,
        "lesson_queue": lesson_queue_count(),
    }
