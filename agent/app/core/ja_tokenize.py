"""Optional Sudachi tokenizer. JS deinflector still works if this is missing."""

from __future__ import annotations

from functools import lru_cache
from threading import Lock
from typing import Any

_VERBISH = {"動詞", "形容詞", "助動詞"}
_AUX_LEMMAS = {"いる", "ある", "おる", "れる", "られる", "せる", "させる"}
_TE = {"て", "で", "たり", "ながら", "つつ"}
_lock = Lock()


@lru_cache(maxsize=1)
def _tokenizer():
    try:
        from sudachipy import Dictionary
    except ImportError:
        return None
    try:
        return Dictionary(dict="core").create()
    except Exception:
        try:
            return Dictionary().create()
        except Exception:
            return None


def available() -> bool:
    return _tokenizer() is not None


def _pos0(tok) -> str:
    try:
        return tok.part_of_speech()[0]
    except Exception:
        return ""


def _lemma(tok) -> str:
    try:
        return tok.dictionary_form() or tok.surface() or ""
    except Exception:
        return tok.surface() if hasattr(tok, "surface") else ""


def _reading(tok) -> str:
    try:
        return tok.reading_form() or ""
    except Exception:
        return ""


def _norm(tok) -> str:
    try:
        return tok.normalized_form() or ""
    except Exception:
        return ""


def _begin(tok) -> int:
    try:
        return int(tok.begin())
    except Exception:
        return -1


def _end(tok) -> int:
    try:
        return int(tok.end())
    except Exception:
        return -1


def _attach(prev, cur) -> bool:
    p0, c0 = _pos0(prev), _pos0(cur)
    cs = cur.surface()
    lemma = _lemma(cur)
    if p0 in _VERBISH and c0 == "助動詞":
        return True
    if p0 in _VERBISH and c0 == "動詞":
        if lemma in _AUX_LEMMAS or cs in _PROG:
            return True
        return False
    if p0 in _VERBISH and c0 == "助詞" and cs in _TE:
        return True
    if prev.surface().endswith(("て", "で")) and c0 in _VERBISH and lemma in _AUX_LEMMAS:
        return True
    return False


def tokenize_ja(text: str) -> dict[str, Any]:
    tok = _tokenizer()
    if tok is None:
        return {"engine": "none", "tokens": []}
    with _lock:
        morphs = list(tok.tokenize(text or ""))
    chunks: list[list[Any]] = []
    buf: list[Any] = []
    for m in morphs:
        if buf and _attach(buf[-1], m):
            buf.append(m)
            continue
        if buf:
            chunks.append(buf)
        buf = [m]
    if buf:
        chunks.append(buf)

    tokens: list[dict[str, Any]] = []
    fallback_at = 0
    for group in chunks:
        surface = "".join(x.surface() for x in group)
        head = group[0]
        lemma = _lemma(head) or surface
        reading = "".join(_reading(x) for x in group)
        begin = _begin(head)
        end = _end(group[-1])
        if begin < 0:
            begin = fallback_at
        if end < 0:
            end = begin + len(surface)
        alts = []
        for form in (_norm(head), _lemma(head)):
            if form and form not in alts and form != surface:
                alts.append(form)
        tokens.append(
            {
                "surface": surface,
                "lemma": lemma,
                "reading": reading,
                "pos": _pos0(head),
                "begin": begin,
                "end": end,
                "lemmas": alts or [lemma],
            }
        )
        fallback_at = end
    return {"engine": "sudachi", "tokens": tokens}
