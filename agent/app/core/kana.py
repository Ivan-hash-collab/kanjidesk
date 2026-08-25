from __future__ import annotations

import re

_KATA_HIRA = str.maketrans(
    {o: o - 0x60 for o in range(0x30A1, 0x30F7)} | {0x30F4: 0x3094}  # ヴ → ゔ
)

# Longest-first Hepburn (modified, no おう→ō collapsing).
_MORA = [
    ("きゃ", "kya"), ("きゅ", "kyu"), ("きょ", "kyo"),
    ("ぎゃ", "gya"), ("ぎゅ", "gyu"), ("ぎょ", "gyo"),
    ("しゃ", "sha"), ("しゅ", "shu"), ("しょ", "sho"),
    ("じゃ", "ja"), ("じゅ", "ju"), ("じょ", "jo"),
    ("ちゃ", "cha"), ("ちゅ", "chu"), ("ちょ", "cho"),
    ("にゃ", "nya"), ("にゅ", "nyu"), ("にょ", "nyo"),
    ("ひゃ", "hya"), ("ひゅ", "hyu"), ("ひょ", "hyo"),
    ("びゃ", "bya"), ("びゅ", "byu"), ("びょ", "byo"),
    ("ぴゃ", "pya"), ("ぴゅ", "pyu"), ("ぴょ", "pyo"),
    ("みゃ", "mya"), ("みゅ", "myu"), ("みょ", "myo"),
    ("りゃ", "rya"), ("りゅ", "ryu"), ("りょ", "ryo"),
    ("ヴァ", "va"), ("ヴィ", "vi"), ("ヴェ", "ve"), ("ヴォ", "vo"),
    ("うぃ", "wi"), ("うぇ", "we"), ("うぉ", "wo"),
    ("あ", "a"), ("い", "i"), ("う", "u"), ("え", "e"), ("お", "o"),
    ("か", "ka"), ("き", "ki"), ("く", "ku"), ("け", "ke"), ("こ", "ko"),
    ("が", "ga"), ("ぎ", "gi"), ("ぐ", "gu"), ("げ", "ge"), ("ご", "go"),
    ("さ", "sa"), ("し", "shi"), ("す", "su"), ("せ", "se"), ("そ", "so"),
    ("ざ", "za"), ("じ", "ji"), ("ず", "zu"), ("ぜ", "ze"), ("ぞ", "zo"),
    ("た", "ta"), ("ち", "chi"), ("つ", "tsu"), ("て", "te"), ("と", "to"),
    ("だ", "da"), ("ぢ", "ji"), ("づ", "zu"), ("で", "de"), ("ど", "do"),
    ("な", "na"), ("に", "ni"), ("ぬ", "nu"), ("ね", "ne"), ("の", "no"),
    ("は", "ha"), ("ひ", "hi"), ("ふ", "fu"), ("へ", "he"), ("ほ", "ho"),
    ("ば", "ba"), ("び", "bi"), ("ぶ", "bu"), ("べ", "be"), ("ぼ", "bo"),
    ("ぱ", "pa"), ("ぴ", "pi"), ("ぷ", "pu"), ("ぺ", "pe"), ("ぽ", "po"),
    ("ま", "ma"), ("み", "mi"), ("む", "mu"), ("め", "me"), ("も", "mo"),
    ("や", "ya"), ("ゆ", "yu"), ("よ", "yo"),
    ("ら", "ra"), ("り", "ri"), ("る", "ru"), ("れ", "re"), ("ろ", "ro"),
    ("わ", "wa"), ("ゐ", "wi"), ("ゑ", "we"), ("を", "wo"), ("ん", "n"),
    ("ぁ", "a"), ("ぃ", "i"), ("ぅ", "u"), ("ぇ", "e"), ("ぉ", "o"),
    ("ゃ", "ya"), ("ゅ", "yu"), ("ょ", "yo"), ("ゎ", "wa"),
    ("ゔ", "vu"),
]

_MORA.sort(key=lambda x: len(x[0]), reverse=True)
_DIGRAPH_START = {m[0][0] for m in _MORA if len(m[0]) > 1}

_CYR_READING = re.compile(
    r"(?i)\b(нити|ничи|хи|хиру|кё|кйо|джицу|джи|дзи|дзю|дзё|тё|тя|сю|ся|сё|цу|ти(?!п)|фу|ва|нихон|кё:)\b"
)
_CYR = re.compile(r"[А-Яа-яЁё]")


def has_cyrillic(text: str) -> bool:
    return bool(_CYR.search(text or ""))


def looks_like_polivanov(text: str) -> bool:
    t = text or ""
    if _CYR_READING.search(t):
        return True
    return bool(_CYR.search(t) and len(t) <= 80)


def kata_to_hira(text: str) -> str:
    return (text or "").translate(_KATA_HIRA)


def _is_kana(ch: str) -> bool:
    o = ord(ch)
    return 0x3040 <= o <= 0x30FF or o == 0x30FC


def to_romaji(text: str) -> str:
    s = kata_to_hira(text or "")
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch in "っッ":
            nxt = s[i + 1] if i + 1 < n else ""
            rest = to_romaji(s[i + 1 :]) if nxt else ""
            if rest:
                doubled = rest[0]
                if rest.startswith("ch"):
                    doubled = "t"
                elif rest.startswith("shi"):
                    doubled = "s"
                elif rest.startswith("tsu"):
                    doubled = "t"
                out.append(doubled + rest)
                return "".join(out)
            out.append("t")
            i += 1
            continue
        if ch in "ーｰ":
            if out:
                prev = out[-1]
                vowel = next((v for v in "aeiou" if v in prev[::-1]), "")
                if vowel:
                    macron = {"a": "ā", "e": "ē", "i": "ī", "o": "ō", "u": "ū"}[vowel]
                    out[-1] = prev[: -1] + macron if prev.endswith(vowel) else prev + macron
            i += 1
            continue
        matched = False
        if ch in _DIGRAPH_START:
            for mora, roma in _MORA:
                if len(mora) > 1 and s.startswith(mora, i):
                    if out and out[-1].endswith("n") and roma[:1] in "aiueoy":
                        out[-1] += "'"
                    out.append(roma)
                    i += len(mora)
                    matched = True
                    break
        if matched:
            continue
        for mora, roma in _MORA:
            if len(mora) == 1 and ch == mora:
                if out and out[-1].endswith("n") and roma[:1] in "aiueoy":
                    out[-1] += "'"
                out.append(roma)
                i += 1
                matched = True
                break
        if not matched:
            out.append(ch)
            i += 1
    return "".join(out)


def format_one_reading(piece: str) -> str:
    raw = (piece or "").strip()
    if not raw:
        return ""
    hira = kata_to_hira(raw)
    if not any(_is_kana(c) for c in hira):
        return raw
    roma = to_romaji(hira)
    roma = re.sub(r"\s+", "", roma)
    if not roma or roma == hira:
        return hira
    return f"{hira} ({roma})"


def format_readings(text: str) -> str:
    if not (text or "").strip():
        return ""
    parts = re.split(r"\s*[・、,/]\s*", text.strip())
    formatted = [format_one_reading(p) for p in parts if p.strip()]
    return " ・ ".join(formatted)


def looks_like_polivanov(text: str) -> bool:
    return bool(_CYR_READING.search(text or ""))
