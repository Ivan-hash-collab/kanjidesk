from __future__ import annotations

from app.core.matching import answers_match, meaning_variants, reading_variants

# re-export matching from package root of core
__all__ = ["answers_match", "meaning_variants", "reading_variants"]
