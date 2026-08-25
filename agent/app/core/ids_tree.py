from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from app.paths import SEED_DIR

IDS_PATH = SEED_DIR / "cjkvi-ids.txt"

# Ideographic Description Characters
_IDC1 = set("⿾⿿")
_IDC2 = set("⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻⿼⿽")
_IDC3 = set("⿲⿳")
_IDC = _IDC1 | _IDC2 | _IDC3

_OP_RU = {
    "⿰": "слева направо",
    "⿱": "сверху вниз",
    "⿲": "три части слева направо",
    "⿳": "три части сверху вниз",
    "⿴": "окружает со всех сторон",
    "⿵": "обрамляет сверху и с боков",
    "⿶": "обрамляет снизу и с боков",
    "⿷": "обрамляет слева",
    "⿸": "накрывает слева сверху",
    "⿹": "накрывает справа сверху",
    "⿺": "обнимает слева снизу",
    "⿻": "пересекаются",
}

_TAG_RE = re.compile(r"\[([A-Za-z]+)\]\s*$")
_PLACEHOLDER_RE = re.compile(r"[①-⑳❶-❿⑤]")


def _strip_tag(formula: str) -> tuple[str, str]:
    m = _TAG_RE.search(formula)
    if not m:
        return formula.strip(), ""
    return formula[: m.start()].strip(), m.group(1).upper()


def _pick_formula(formulas: list[str]) -> str:
    scored: list[tuple[int, str]] = []
    for raw in formulas:
        body, tags = _strip_tag(raw)
        if not body:
            continue
        score = 0
        if "J" in tags:
            score += 3
        if not tags:
            score += 2
        if "G" in tags:
            score += 1
        scored.append((score, body))
    if not scored:
        return ""
    scored.sort(key=lambda x: -x[0])
    return scored[0][1]


def _parse_node(s: str, i: int) -> tuple[dict[str, Any], int]:
    if i >= len(s):
        return {"char": "?"}, i
    c = s[i]
    if c in _IDC3:
        a, i = _parse_node(s, i + 1)
        b, i = _parse_node(s, i)
        d, i = _parse_node(s, i)
        return {"op": c, "args": [a, b, d]}, i
    if c in _IDC2:
        a, i = _parse_node(s, i + 1)
        b, i = _parse_node(s, i)
        return {"op": c, "args": [a, b]}, i
    if c in _IDC1:
        a, i = _parse_node(s, i + 1)
        return {"op": c, "args": [a]}, i
    return {"char": c}, i + 1


def parse_ids(formula: str) -> dict[str, Any] | None:
    body, _ = _strip_tag(formula)
    body = body.replace("〾", "").strip()
    if not body:
        return None
    try:
        node, end = _parse_node(body, 0)
    except Exception:
        return None
    if end < len(body):
        # leftover junk; still use what we got
        pass
    return node


def _chars(node: dict[str, Any]) -> list[str]:
    if "char" in node:
        return [node["char"]]
    out: list[str] = []
    for arg in node.get("args") or []:
        out.extend(_chars(arg))
    return out


def _layout_ru(node: dict[str, Any]) -> str:
    if "char" in node:
        return str(node["char"])
    op = node.get("op", "")
    name = _OP_RU.get(op, op)
    bits = [_layout_ru(a) for a in node.get("args") or []]
    return f"{name} ({' + '.join(bits)})"


@lru_cache(maxsize=1)
def _ids_map() -> dict[str, str]:
    path = IDS_PATH
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line or line.startswith("#") or not line.startswith("U+"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            ch = parts[1]
            formula = _pick_formula(parts[2:])
            if ch and formula:
                out[ch] = formula
    return out


def ids_formula(kanji: str) -> str:
    return _ids_map().get(kanji, "")


def tree_for(kanji: str, depth: int = 3) -> dict[str, Any]:
    formula = ids_formula(kanji)
    primitive = (not formula) or formula == kanji or (len(formula) == 1)
    node = parse_ids(formula) if formula and not primitive else {"char": kanji}
    parts = _chars(node) if node and "op" in node else []
    leaves = _expand_leaves(parts, depth=depth) if parts else [kanji]
    placeholders = [p for p in leaves if _PLACEHOLDER_RE.search(p)]
    return {
        "kanji": kanji,
        "ids": formula or kanji,
        "primitive": primitive or not parts,
        "parts": parts or [kanji],
        "leaves": leaves,
        "layout_ru": _layout_ru(node) if node else kanji,
        "placeholders": placeholders,
        "tree": node,
    }


def _expand_leaves(chars: list[str], depth: int) -> list[str]:
    if depth <= 0:
        return chars
    out: list[str] = []
    seen: set[str] = set()
    for ch in chars:
        sub = ids_formula(ch)
        if not sub or sub == ch or len(sub) == 1:
            if ch not in seen:
                out.append(ch)
                seen.add(ch)
            continue
        node = parse_ids(sub)
        kids = _chars(node) if node and "op" in node else [ch]
        if kids == [ch]:
            if ch not in seen:
                out.append(ch)
                seen.add(ch)
            continue
        for leaf in _expand_leaves(kids, depth - 1):
            if leaf not in seen:
                out.append(leaf)
                seen.add(leaf)
    return out or chars


def facts_ru(kanji: str) -> str:
    t = tree_for(kanji)
    if t["primitive"]:
        return f"{kanji}: примитив / цельный знак (IDS: {t['ids']}). Не выдумывай вложенные радикалы."
    bits = [
        f"IDS: {t['ids']}",
        f"сборка: {t['layout_ru']}",
        f"непосредственные части: {' '.join(t['parts'])}",
        f"листья: {' '.join(t['leaves'])}",
    ]
    if t["placeholders"]:
        bits.append("есть нестандартные IDS-заглушки — не подменяй их выдуманными радикалами")
    return "; ".join(bits)


def _char_label(ch: str) -> str:
    from app.core.kanjium import describe_component, lookup

    if ch in _IDC or _PLACEHOLDER_RE.search(ch):
        return ch
    desc = describe_component(ch)
    if desc != ch:
        return desc
    meaning = lookup(ch).get("compact_meaning") or ""
    return f"{ch} ({meaning})" if meaning else ch


def _dump_node(node: dict[str, Any], depth: int, seen: set[str], lines: list[str], indent: str) -> None:
    if "char" in node:
        ch = str(node["char"])
        label = _char_label(ch)
        formula = ids_formula(ch)
        primitive = (not formula) or formula == ch or len(formula) == 1
        if primitive or depth <= 0 or ch in seen or ch in _IDC or _PLACEHOLDER_RE.search(ch):
            lines.append(f"{indent}{label}")
            return
        lines.append(f"{indent}{label}")
        inner = parse_ids(formula)
        if inner and "op" in inner:
            nxt = set(seen)
            nxt.add(ch)
            _dump_node(inner, depth - 1, nxt, lines, indent + "  ")
        return
    op = str(node.get("op") or "")
    name = _OP_RU.get(op, op)
    lines.append(f"{indent}{op} {name}".rstrip())
    for arg in node.get("args") or []:
        if isinstance(arg, dict):
            _dump_node(arg, depth, seen, lines, indent + "  ")


@lru_cache(maxsize=4096)
def dump_tree_ru(kanji: str, max_depth: int = 5) -> str:
    """Full nested IDS / radical tree for Gemini (not a one-line radical)."""
    from app.core.kanjium import lookup

    lines: list[str] = []
    kj = lookup(kanji)
    rad = kj.get("radical") or ""
    rmean = kj.get("radical_meaning") or ""
    if rad:
        extra = f" ({rmean})" if rmean else ""
        lines.append(f"Канси-радикал: {_char_label(rad)}{extra}" if rad != kanji else f"Канси-радикал: {rad}{extra}")
    formula = ids_formula(kanji)
    if not formula or formula == kanji or len(formula) == 1:
        meaning = kj.get("compact_meaning") or ""
        label = _char_label(kanji)
        if meaning and meaning not in label:
            lines.append(f"{label} — примитив / цельный знак ({meaning})")
        else:
            lines.append(f"{label} — примитив / цельный знак")
        return "\n".join(lines)
    lines.append(f"{kanji} IDS {formula}")
    node = parse_ids(formula)
    if node:
        _dump_node(node, max_depth, {kanji}, lines, "")
    text = "\n".join(lines)
    if len(text) > 2800:
        return text[:2788] + "\n…"
    return text
