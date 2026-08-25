from __future__ import annotations

from typing import Any

from app.core.kana import has_cyrillic


SECTION_ORDER = (
    "mnemonic",
    "decompose",
    "readings",
    "lookalikes",
    "etymology",
    "vocab",
)

# Never emit these — empty skill = omit the section, do not apologize.
STUB_TEXTS = frozenset(
    {
        "Истории нет — нажмите «Новые истории».",
        "Части знака не разобраны.",
        "Чтений в справочнике нет, либо разбор не заполнил этот блок.",
        "В справочнике нет знаков, похожих по написанию.",
        "Нет данных справочника.",
        "Слов нет.",
    }
)


def _plain(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _real(value: Any) -> str:
    s = _plain(value)
    return "" if s in STUB_TEXTS else s


def _words(items: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(items, list):
        return lines
    for w in items:
        if not isinstance(w, dict):
            continue
        jp = _plain(w.get("jp") or w.get("word"))
        kana = _plain(w.get("kana") or w.get("reading"))
        roma = _plain(w.get("romaji"))
        ru = _plain(w.get("ru") or w.get("why_ru"))
        why = _plain(w.get("why_ru")) if w.get("ru") else ""
        if has_cyrillic(kana):
            kana = ""
        if has_cyrillic(roma):
            roma = ""
        reading = " ".join(x for x in (kana, f"({roma})" if roma else "") if x)
        bit = " · ".join(x for x in (jp, reading, ru) if x)
        if why and why != ru:
            bit += f" — {why}"
        if bit:
            lines.append("• " + bit)
    return lines


def _pairs(items: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(items, list):
        return lines
    for p in items:
        if isinstance(p, dict):
            other = _plain(p.get("other") or p.get("kanji"))
            how = _plain(p.get("similar_how_ru") or p.get("why_similar_ru") or "")
            diff = _plain(p.get("difference_ru") or p.get("meaning") or "")
            if not other:
                continue
            extra = []
            if how:
                extra.append(f"похоже тем, что {how}")
            if diff:
                extra.append(f"отличие: {diff}")
            lines.append(f"• {other}" + (f" — {'; '.join(extra)}" if extra else ""))
        elif isinstance(p, str):
            lines.append("• " + p)
    return lines


def _parts(items: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(items, list):
        return lines
    for p in items:
        if isinstance(p, dict):
            surf = _plain(p.get("surface") or p.get("char"))
            role = _plain(p.get("role_ru") or p.get("role"))
            lines.append(f"• {surf} — {role}" if role else f"• {surf}")
        elif isinstance(p, str):
            lines.append("• " + p)
    return lines


def _readings(items: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(items, list):
        return lines
    for r in items:
        if not isinstance(r, dict):
            continue
        kana = _plain(r.get("kana") or r.get("reading"))
        roma = _plain(r.get("romaji"))
        note = _plain(r.get("note_ru"))
        head = kana
        if roma:
            head = f"{kana} ({roma})" if kana else roma
        lines.append(f"• {head}" + (f" — {note}" if note else ""))
    return lines


def _meaning_stories(data: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    bag = data.get("mnemonics")
    if isinstance(bag, list):
        n = 0
        for m in bag:
            if isinstance(m, dict):
                kind = _plain(m.get("kind") or "meaning").lower()
                if kind == "reading":
                    continue
                text = _real(m.get("text_ru") or m.get("mnemonic_ru"))
                if text:
                    n += 1
                    lines.append(f"{n}. {text}")
            elif isinstance(m, str) and m.strip() and m.strip() not in STUB_TEXTS:
                n += 1
                lines.append(f"{n}. {m.strip()}")
    if not lines:
        one = _real(data.get("mnemonic_ru"))
        if one:
            lines.append(one)
    return lines


def _reading_hooks(data: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    bag = data.get("mnemonics")
    if isinstance(bag, list):
        for m in bag:
            if not isinstance(m, dict):
                continue
            kind = _plain(m.get("kind") or "meaning").lower()
            hook = _real(m.get("hook_ru") or m.get("reading_hook"))
            if kind == "reading" and not hook:
                hook = _real(m.get("text_ru"))
            if hook and kind == "reading":
                lines.append("• " + hook)
    mem_extra = _real(data.get("reading_hook"))
    if mem_extra:
        lines.append("• " + mem_extra)
    return lines


def _wanted(data: dict[str, Any]) -> set[str] | None:
    raw = data.get("_skills")
    if isinstance(raw, list) and raw:
        return {str(x) for x in raw}
    if isinstance(raw, str) and raw.strip():
        return {s.strip() for s in raw.split(",") if s.strip()}
    return None


def _show(wanted: set[str] | None, skill: str, has_body: bool) -> bool:
    if not has_body:
        return False
    if wanted is None:
        return True
    return skill in wanted


def render_card(data: dict[str, Any] | None) -> str:
    if not data:
        return ""
    d = {k: v for k, v in data.items() if not str(k).startswith("_")}
    wanted = _wanted(data)
    blocks: list[str] = []
    kanji = _plain(d.get("kanji"))
    kw = _plain(d.get("keyword_ru"))
    if kanji or kw:
        blocks.append(f"{kanji} — {kw}".strip(" —"))

    stories = _meaning_stories(d)
    if _show(wanted, "mnemonic", bool(stories)):
        blocks.append("Как запомнить значение\n" + "\n".join(stories))

    deco = d.get("decompose") if isinstance(d.get("decompose"), dict) else d
    parts = _parts(deco.get("parts") if isinstance(deco, dict) else None)
    story = _real(deco.get("story_ru") if isinstance(deco, dict) else d.get("story_ru") or d.get("components_story"))
    if _show(wanted, "decompose", bool(parts or story)):
        blocks.append("Как выглядит\n" + "\n".join(parts + ([story] if story else [])))

    rd = d.get("readings") if isinstance(d.get("readings"), dict) else d
    on_l = _readings(rd.get("onyomi") if isinstance(rd, dict) else d.get("onyomi"))
    kun_l = _readings(rd.get("kunyomi") if isinstance(rd, dict) else d.get("kunyomi"))
    mem = _real(rd.get("memory_ru") if isinstance(rd, dict) else d.get("memory_ru"))
    on_hint = _real(d.get("onyomi_hint"))
    kun_hint = _real(d.get("kunyomi_hint"))
    hooks = _reading_hooks(d)
    has_rd = bool(on_l or kun_l or mem or on_hint or kun_hint or hooks)
    if _show(wanted, "readings", has_rd):
        chunk = []
        if on_l:
            chunk.append("он:\n" + "\n".join(on_l))
        elif on_hint:
            chunk.append("он: " + on_hint)
        if kun_l:
            chunk.append("кун:\n" + "\n".join(kun_l))
        elif kun_hint:
            chunk.append("кун: " + kun_hint)
        if mem:
            chunk.append("крючок на чтение:\n" + mem)
        elif hooks:
            chunk.append("крючок на чтение:\n" + "\n".join(hooks))
        if chunk:
            blocks.append("Чтения\n" + "\n".join(chunk))

    lk = d.get("lookalikes") if isinstance(d.get("lookalikes"), dict) else d
    rule = _real(lk.get("rule_ru") if isinstance(lk, dict) else d.get("rule_ru") or d.get("lookalike_note"))
    pairs = _pairs(lk.get("pairs") if isinstance(lk, dict) else d.get("pairs"))
    if _show(wanted, "lookalikes", bool(rule or pairs)):
        head = "Не перепутать (похожи по написанию, не по смыслу)"
        blocks.append(head + "\n" + "\n".join(([rule] if rule else []) + pairs))

    et = d.get("etymology") if isinstance(d.get("etymology"), dict) else None
    typ = _real((et or {}).get("type_ru") or (et or {}).get("etym_type") or d.get("type_ru"))
    expl = _real((et or {}).get("explain_ru") or d.get("explain_ru"))
    if _show(wanted, "etymology", bool(typ or expl)):
        blocks.append("Откуда знак\n" + "\n".join(x for x in (typ, expl) if x))

    vocab_src = d.get("vocab")
    words = None
    if isinstance(vocab_src, dict):
        words = vocab_src.get("words")
    elif isinstance(vocab_src, list):
        words = vocab_src
    elif isinstance(d.get("words"), list):
        words = d.get("words")
    wlines = _words(words)
    if _show(wanted, "vocab", bool(wlines)):
        blocks.append("Слова\n" + "\n".join(wlines))

    reply = _plain(d.get("reply_ru"))
    if reply:
        blocks.append(reply)

    if not blocks:
        for k, v in d.items():
            if k in {"kanji", "keyword_ru"} or not v or isinstance(v, (dict, list)):
                continue
            blocks.append(f"{k}: {v}")
    return "\n\n".join(blocks).strip()


def render_chunk(cards: list[dict[str, Any]]) -> str:
    texts = [render_card(c) for c in cards]
    return "\n\n————\n\n".join(t for t in texts if t)


_STUB_HEADS = frozenset(
    {
        "Как запомнить значение",
        "Как выглядит",
        "Чтения",
        "Не перепутать (похожи по написанию, не по смыслу)",
        "Откуда знак",
        "Слова",
    }
)


def strip_stub_text(text: str) -> str:
    """Drop empty-section filler from already stored messages."""
    if not text:
        return ""
    cards = []
    for card in text.split("\n\n————\n\n"):
        kept: list[str] = []
        for sec in card.split("\n\n"):
            lines = [ln for ln in sec.split("\n") if ln.strip() not in STUB_TEXTS]
            if not lines:
                continue
            if len(lines) == 1 and lines[0].strip() in _STUB_HEADS:
                continue
            kept.append("\n".join(lines))
        body = "\n\n".join(kept).strip()
        if body:
            cards.append(body)
    return "\n\n————\n\n".join(cards)
