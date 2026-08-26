"""Fetch full JMdict (English) and Kanjium pitch into public/data."""
from __future__ import annotations

import gzip
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data"
UA = {"User-Agent": "KanjiDesk/1.0 (open-data fetch; educational)"}
CJK = re.compile(r"[\u3400-\u9FFF々〆ヶ]")
PER_KANJI = 400

JMDICT_URLS = [
    "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260824122934/jmdict-eng-3.6.2%2B20260824122934.json.zip",
    "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260817122448/jmdict-eng-3.6.2%2B20260817122448.json.zip",
]
ACCENT_URLS = [
    "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt",
    "https://cdn.jsdelivr.net/gh/mifunetoshiro/kanjium@master/data/source_files/raw/accents.txt",
]


def get(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def dump_json(name: str, obj: object) -> None:
    path = OUT / name
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.write_bytes(raw)
    print(f"  {name}: {len(raw) / 1e6:.2f} MB")


def dump_gz(name: str, obj: object) -> None:
    path = OUT / name
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.write_bytes(gzip.compress(raw, compresslevel=7))
    print(f"  {name}: {path.stat().st_size / 1e6:.2f} MB gz ({len(raw) / 1e6:.2f} raw)")


def kata_to_hira(text: str) -> str:
    out = []
    for ch in text:
        o = ord(ch)
        if o == 0x30F4:
            out.append("ゔ")
        elif 0x30A1 <= o <= 0x30F6:
            out.append(chr(o - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def parse_pitch(raw: str) -> list[int]:
    out: list[int] = []
    for part in re.split(r"[,;/]", raw or ""):
        m = re.search(r"\d+", part)
        if m:
            n = int(m.group())
            if n not in out:
                out.append(n)
    return out


def load_accents() -> dict[str, list[int]]:
    text = ""
    for url in ACCENT_URLS:
        print(f"kanjium: {url}")
        try:
            text = get(url, timeout=120).decode("utf-8", "replace")
            print(f"  downloaded {len(text) / 1e6:.2f} MB text")
            break
        except Exception as e:
            print(f"  fail: {e}")
    if not text:
        return {}
    table: dict[str, list[int]] = {}
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        written, kana, acc = parts[0].strip(), kata_to_hira(parts[1].strip()), parts[2].strip()
        nums = parse_pitch(acc)
        if not nums:
            continue
        if written and kana:
            table[f"{written}|{kana}"] = nums
        if kana:
            table.setdefault(kana, nums)
        if written and not CJK.search(written):
            table.setdefault(written, nums)
    print(f"  pitch keys={len(table)}")
    return table


def pitch_of(table: dict[str, list[int]], written: str, kana: str) -> list[int]:
    hira = kata_to_hira(kana).replace(".", "").replace("-", "").replace(" ", "")
    return table.get(f"{written}|{hira}") or table.get(hira) or table.get(written) or []


def freq_words() -> None:
    print("frequency: OpenSubtitles 2016 ja_50k (full)")
    text = get(
        "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/ja/ja_50k.txt"
    ).decode("utf-8", "replace")
    words = []
    for i, line in enumerate(text.splitlines(), start=1):
        parts = line.split()
        if len(parts) < 2:
            continue
        w, n = parts[0], parts[1]
        try:
            c = int(n)
        except ValueError:
            continue
        words.append({"w": w, "n": c, "r": i})
    dump_json("freq-words.json", words)


def jmdict_full(accents: dict[str, list[int]]) -> None:
    zdata = None
    for url in JMDICT_URLS:
        print(f"jmdict: {url}")
        try:
            zdata = get(url)
            print(f"  downloaded {len(zdata) / 1e6:.2f} MB")
            break
        except Exception as e:
            print(f"  fail: {e}")
    if not zdata:
        print("jmdict: skip (download failed)")
        return
    with zipfile.ZipFile(io.BytesIO(zdata)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".json"))
        data = json.loads(zf.read(name).decode("utf-8"))
    rows = data.get("words") or data
    raw: dict[str, list[dict]] = defaultdict(list)
    n = 0
    for w in rows:
        kanji = w.get("kanji") or []
        kana = w.get("kana") or []
        senses = w.get("sense") or []
        glosses: list[str] = []
        for s in senses[:6]:
            for g in (s.get("gloss") or [])[:3]:
                t = g.get("text") if isinstance(g, dict) else str(g)
                if t:
                    glosses.append(t)
        if not glosses:
            continue
        writings: list[tuple[str, bool]] = []
        for k in kanji:
            t = k.get("text") or ""
            if t and CJK.search(t):
                writings.append((t, bool(k.get("common"))))
        if not writings:
            continue
        kana_rows = []
        for k in kana:
            t = k.get("text") or ""
            if t:
                kana_rows.append((t, k.get("appliesToKanji") or ["*"], bool(k.get("common"))))
        for written, kcommon in writings:
            pron = ""
            pcommon = False
            for text, applies, kc in kana_rows:
                if applies == ["*"] or written in applies:
                    pron = text
                    pcommon = kc
                    break
            if not pron and kana_rows:
                pron = kana_rows[0][0]
                pcommon = kana_rows[0][2]
            pitch = pitch_of(accents, written, pron)
            item = {
                "written": written,
                "kana": pron,
                "meanings": glosses[:8],
                "common": kcommon or pcommon,
            }
            if pitch:
                item["pitch"] = pitch
            seen: set[str] = set()
            for ch in CJK.findall(written):
                if ch in seen:
                    continue
                seen.add(ch)
                raw[ch].append(item)
        n += 1

    def nkanji(s: str) -> int:
        return len(CJK.findall(s))

    by: dict[str, list[dict]] = {}
    for ch, items in raw.items():
        uniq: list[dict] = []
        have: set[str] = set()
        for it in items:
            ident = f"{it['written']}|{it.get('kana') or ''}"
            if ident in have:
                continue
            have.add(ident)
            uniq.append(it)
        uniq.sort(
            key=lambda it: (
                0 if it.get("common") else 1,
                0 if it.get("pitch") else 1,
                0 if nkanji(it["written"]) == 1 else 1,
                nkanji(it["written"]),
                len(it["written"]),
            )
        )
        by[ch] = uniq[:PER_KANJI]
    print(f"  entries used={n} kanji keys={len(by)} cap={PER_KANJI}")
    dump_gz("words-by-kanji.json.gz", dict(by))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    accents = load_accents()
    if accents:
        dump_gz("pitch.json.gz", accents)
    if "--jmdict-only" in sys.argv:
        jmdict_full(accents)
    elif "--pitch-only" in sys.argv:
        print("pitch only")
    else:
        if "--skip-freq" not in sys.argv:
            freq_words()
        jmdict_full(accents)
    print("done")


if __name__ == "__main__":
    main()
