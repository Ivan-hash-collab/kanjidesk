from __future__ import annotations

# CJK Unified + Ext A + compatibility ideographs (not kana, not punctuation).
_RANGES = (
    (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
    (0x20000, 0x2A6DF),
)


def is_kanji(ch: str) -> bool:
    if not ch:
        return False
    o = ord(ch)
    return any(a <= o <= b for a, b in _RANGES)


def unique_kanji(text: str) -> list[str]:
    """First-seen unique kanji, order preserved."""
    seen: set[str] = set()
    out: list[str] = []
    for ch in text or "":
        if is_kanji(ch) and ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out
