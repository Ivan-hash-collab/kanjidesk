from __future__ import annotations

from typing import Any

STAGE_ORDER = ["New", "Apprentice", "Guru", "Master", "Enlightened", "Graduated"]


def stage_for_card(card: dict[str, Any] | None) -> str:
    if not card:
        return "New"
    last = card.get("last_review")
    reps = int(card.get("reps") or 0)
    if not last and reps == 0:
        return "New"
    state = int(card.get("state") or 1)
    if state in (1, 3):  # Learning / Relearning
        return "Apprentice"
    stability = float(card.get("stability") or 0)
    if stability < 7:
        return "Apprentice"
    if stability < 21:
        return "Guru"
    if stability < 60:
        return "Master"
    if stability < 180:
        return "Enlightened"
    return "Graduated"
