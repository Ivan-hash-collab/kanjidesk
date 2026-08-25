from __future__ import annotations

import re
import unicodedata


def kata_to_hira(text: str) -> str:
    out = []
    for ch in text:
        o = ord(ch)
        if 0x30A1 <= o <= 0x30F6:
            out.append(chr(o - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def hira_to_kata(text: str) -> str:
    out = []
    for ch in text:
        o = ord(ch)
        if 0x3041 <= o <= 0x3096:
            out.append(chr(o + 0x60))
        else:
            out.append(ch)
    return "".join(out)


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.strip().lower()
    text = text.replace("ё", "е")
    text = re.sub(r"[\s・·•.,;:!?/\\()'\"「」『』\-_*]+", "", text)
    return text


def split_glosses(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[・·•/,;]| and ", raw)
    return [p.strip() for p in parts if p.strip()]


def reading_variants(raw: str | None) -> set[str]:
    """Expand KLC-style readings: ひと- / ひと.つ / -び / な.い*."""
    variants: set[str] = set()
    if not raw:
        return variants
    for part in re.split(r"[・·•/,;]", raw):
        part = part.strip()
        if not part:
            continue
        cleaned = part.replace("*", "").replace("-", "").replace(".", "")
        if cleaned:
            variants.add(fold(cleaned))
            variants.add(fold(kata_to_hira(cleaned)))
            variants.add(fold(hira_to_kata(cleaned)))
        if "." in part:
            stem = part.split(".", 1)[0].replace("-", "").replace("*", "")
            if stem:
                variants.add(fold(stem))
                variants.add(fold(kata_to_hira(stem)))
        if "-" in part:
            stem = part.replace("-", "").replace("*", "").replace(".", "")
            if stem:
                variants.add(fold(stem))
    return {v for v in variants if v}


def meaning_variants(
    primary: str | None,
    meaning_ru: str | None,
    synonyms: list[str] | None = None,
) -> set[str]:
    out: set[str] = set()
    for gloss in split_glosses(primary) + split_glosses(meaning_ru):
        folded = fold(gloss)
        if folded:
            out.add(folded)
        for word in gloss.split():
            w = fold(word)
            if w and len(w) >= 2:
                out.add(w)
    for syn in synonyms or []:
        f = fold(syn)
        if f:
            out.add(f)
    return out


def answers_match(user: str, accepted: set[str]) -> bool:
    u = fold(user)
    if not u:
        return False
    if u in accepted:
        return True
    for a in accepted:
        if len(a) >= 3 and u == a:
            return True
        if len(u) >= 3 and len(a) >= 3 and (u in a or a in u):
            shorter, longer = (u, a) if len(u) <= len(a) else (a, u)
            if len(shorter) / len(longer) >= 0.75:
                return True
    return False
