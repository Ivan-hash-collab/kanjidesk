"""Fetch larger open lexicons into public/data."""
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


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=240) as r:
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


def jmdict_common() -> None:
    urls = [
        "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260525143653/jmdict-eng-common-3.6.2%2B20260525143653.json.zip",
        "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260817122448/jmdict-eng-common-3.6.2%2B20260817122448.json.zip",
    ]
    zdata = None
    for url in urls:
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
        for s in senses[:4]:
            for g in (s.get("gloss") or [])[:2]:
                t = g.get("text") if isinstance(g, dict) else str(g)
                if t:
                    glosses.append(t)
        if not glosses:
            continue
        written = ""
        common = False
        for k in kanji:
            t = k.get("text") or ""
            if t and CJK.search(t):
                written = t
                common = bool(k.get("common"))
                break
        if not written:
            continue
        pron = ""
        for k in kana:
            t = k.get("text") or ""
            if t:
                pron = t
                common = common or bool(k.get("common"))
                break
        item = {
            "written": written,
            "kana": pron,
            "meanings": glosses[:6],
            "common": common,
        }
        seen: set[str] = set()
        for k in kanji:
            t = k.get("text") or ""
            for ch in CJK.findall(t):
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
            w = it["written"]
            if w in have:
                continue
            have.add(w)
            uniq.append(it)
        uniq.sort(
            key=lambda it: (
                0 if nkanji(it["written"]) == 1 else 1,
                0 if it.get("common") else 1,
                nkanji(it["written"]),
                len(it["written"]),
            )
        )
        by[ch] = uniq[:96]
    print(f"  entries used={n} kanji keys={len(by)}")
    dump_gz("words-by-kanji.json.gz", dict(by))



def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if "--jmdict-only" in sys.argv:
        jmdict_common()
    else:
        freq_words()
        jmdict_common()
    print("done")


if __name__ == "__main__":
    main()
