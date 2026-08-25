from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.paths import SEED_DIR

KANJIDICT = SEED_DIR / "kanjidict.txt"
RADICALS = SEED_DIR / "kanjium-radicals.txt"
LOOKALIKES = SEED_DIR / "kanjium-lookalikes.txt"

_COLS = [
    "kanji",
    "radical",
    "radvar",
    "phonetic",
    "idc",
    "type",
    "reg_on",
    "reg_kun",
    "onyomi",
    "kunyomi",
    "nanori",
    "strokes",
    "grade",
    "jlpt",
    "kanken",
    "frequency",
    "meaning",
    "compact_meaning",
    "rtk1_3_old",
    "rtk1_3_new",
    "ko2001",
    "ko2301",
    "wrp_jkf",
    "wanikani",
]


@lru_cache(maxsize=1)
def _dict_map() -> dict[str, dict[str, str]]:
    if not KANJIDICT.exists():
        return {}
    out: dict[str, dict[str, str]] = {}
    with KANJIDICT.open(encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if not parts or not parts[0]:
                continue
            row = { _COLS[i]: (parts[i] if i < len(parts) else "") for i in range(len(_COLS)) }
            out[row["kanji"]] = row
    return out


@lru_cache(maxsize=1)
def _radical_index() -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    """Return (by_radical, variant_to_parent)."""
    by: dict[str, dict[str, str]] = {}
    variant: dict[str, str] = {}
    if not RADICALS.exists():
        return by, variant
    with RADICALS.open(encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 6:
                continue
            rad, radvar, number, strokes, names, meaning = parts[:6]
            rec = {
                "radical": rad,
                "radvar": radvar,
                "number": number,
                "strokes": strokes,
                "names": names,
                "meaning": meaning,
            }
            by[rad] = rec
            if radvar:
                for v in radvar.replace("・", " ").replace("/", " ").split():
                    v = v.strip()
                    if v:
                        variant[v] = rad
                        by.setdefault(v, rec)
    return by, variant


@lru_cache(maxsize=1)
def _lookalike_map() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if not LOOKALIKES.exists():
        return out
    with LOOKALIKES.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or "\t" not in line:
                continue
            key, rest = line.split("\t", 1)
            others = [x.strip() for x in rest.split(",") if x.strip() and x.strip() != key]
            if not others:
                continue
            bucket = out.setdefault(key, [])
            for o in others:
                if o not in bucket:
                    bucket.append(o)
    return out


def lookup(kanji: str) -> dict[str, Any]:
    row = _dict_map().get(kanji) or {}
    by_rad, variants = _radical_index()
    radical = row.get("radical") or ""
    rad_info = by_rad.get(radical) or {}
    phonetic = row.get("phonetic") or ""
    if phonetic == kanji:
        phonetic = ""
    return {
        "kanji": kanji,
        "radical": radical,
        "radical_meaning": rad_info.get("meaning") or "",
        "radical_names": rad_info.get("names") or "",
        "phonetic": phonetic,
        "etym_type": row.get("type") or "",
        "idc": row.get("idc") or "",
        "compact_meaning": row.get("compact_meaning") or "",
        "wanikani_level": row.get("wanikani") or "",
        "strokes": row.get("strokes") or "",
        "jlpt": row.get("jlpt") or "",
    }


def describe_component(ch: str) -> str:
    by_rad, variants = _radical_index()
    parent = variants.get(ch)
    info = by_rad.get(ch) or (by_rad.get(parent) if parent else None)
    if not info:
        return ch
    meaning = info.get("meaning") or ""
    names = info.get("names") or ""
    if parent and parent != ch:
        return f"{ch} (вариант {parent}; {meaning}; {names})"
    return f"{ch} ({meaning}; {names})" if meaning else ch


def lookalike_map() -> dict[str, list[str]]:
    return _lookalike_map()


def lookalikes(kanji: str) -> list[str]:
    return list(_lookalike_map().get(kanji) or [])
