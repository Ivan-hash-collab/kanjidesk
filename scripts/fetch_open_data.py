"""Download open Japanese data into public/data. CC BY-SA / Arphic / Tatoeba."""
from __future__ import annotations

import gzip
import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data"
UA = {"User-Agent": "KanjiDesk/1.0 (open-data fetch; educational)"}

CJK = re.compile(r"[\u3400-\u9FFF々〆ヶ]")
IDC2 = set("⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻⿼⿽⿾⿿")
IDC3 = set("⿲⿳")


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
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


def unique_kanji(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for ch in CJK.findall(text):
        if ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out


def parse_acjk(src: str) -> dict | None:
    """Best-effort AnimCJK decomposition -> nested tree."""
    s = src.strip()
    i = 0
    n = len(s)

    def skip_digits(j: int) -> int:
        while j < n and s[j].isdigit():
            j += 1
        return j

    def parse_one(j: int) -> tuple[dict | None, int]:
        j = skip_digits(j)
        if j >= n:
            return None, j
        ch = s[j]
        j += 1
        if ch in IDC3 or ch in IDC2:
            arity = 3 if ch in IDC3 else 2
            kids = []
            for _ in range(arity):
                kid, j = parse_one(j)
                if kid:
                    kids.append(kid)
            return {"ch": ch, "idc": True, "kids": kids}, j
        if ch == "?":
            j = skip_digits(j)
            return {"ch": "?", "idc": False, "kids": []}, j
        node: dict = {"ch": ch, "idc": False, "kids": []}
        j = skip_digits(j)
        if j < n and s[j] == ":":
            j += 1
            part, j = parse_one(j)
            if part:
                node["kids"] = [part]
            return node, j
        if j < n and (s[j] in IDC2 or s[j] in IDC3):
            kid, j = parse_one(j)
            if kid:
                node["kids"] = [kid] if kid.get("idc") else [kid]
                if kid.get("idc"):
                    node["kids"] = kid.get("kids") or []
                    node["mark"] = kid["ch"]
        return node, j

    try:
        tree, _ = parse_one(0)
        return tree
    except Exception:
        return None


def strokes() -> None:
    print("strokes: graphicsJa.txt")
    raw = get("https://raw.githubusercontent.com/parsimonhi/animCJK/master/graphicsJa.txt")
    pack: dict[str, dict] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(b"#"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        ch = row.get("character")
        if not ch:
            continue
        pack[ch] = {"strokes": row.get("strokes") or [], "medians": row.get("medians") or []}
    print(f"  chars: {len(pack)}")
    dump_gz("strokes-ja.json.gz", pack)
    # tiny probe so we can assert 顔 without decompressing the whole pack in JS tests
    face = pack.get("顔")
    dump_json("strokes-probe.json", {"顔": bool(face), "n": len(pack)})


def trees_and_rads() -> None:
    print("trees: dictionaryJa.txt")
    raw = get("https://raw.githubusercontent.com/parsimonhi/animCJK/master/dictionaryJa.txt").decode("utf-8", "replace")
    trees: dict[str, dict] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        ch = row.get("character")
        if not ch:
            continue
        src = (row.get("decomposition") or row.get("acjk") or "").strip()
        tree = parse_acjk(src) if src else None
        parts = unique_kanji(src)
        trees[ch] = {"raw": src[:240], "parts": parts[:16], "tree": tree}
    dump_json("trees.json", trees)

    print("radicals: kradfile-u")
    krad = get("https://raw.githubusercontent.com/jmettraux/kensaku/master/data/kradfile-u").decode("utf-8", "replace")
    rads: dict[str, list[str]] = {}
    for line in krad.splitlines():
        if not line or line.startswith("#") or " : " not in line:
            continue
        left, right = line.split(" : ", 1)
        ch = left.strip()
        if len(ch) != 1:
            continue
        rads[ch] = [p for p in right.split() if p]
    dump_json("radicals.json", rads)


def sentences() -> None:
    print("sentences: Tanaka examples.utf.gz")
    by_kanji: dict[str, list[dict]] = defaultdict(list)
    by_word: dict[str, list[dict]] = defaultdict(list)
    raw = gzip.decompress(get("http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz"))
    ja = en = ""
    count_a = 0
    for line in raw.decode("utf-8", "replace").splitlines():
        if line.startswith("A:"):
            body = line[2:].strip()
            # ID often at end:  #ID=...
            body = re.sub(r"\t#ID=.*$", "", body)
            if "\t" in body:
                ja, en = body.split("\t", 1)
            else:
                ja, en = body, ""
            ja, en = ja.strip(), en.strip()
            if not ja or not en:
                continue
            row = {"ja": ja, "en": en}
            count_a += 1
            for ch in unique_kanji(ja):
                if len(by_kanji[ch]) < 8:
                    by_kanji[ch].append(row)
        elif line.startswith("B:") and ja and en:
            body = line[2:].strip()
            row = {"ja": ja, "en": en}
            for token in body.split():
                word = re.split(r"[(\[]", token, 1)[0]
                if not word or len(word) < 2:
                    continue
                if not CJK.search(word):
                    continue
                if len(by_word[word]) < 5:
                    by_word[word].append(row)

    print(f"  Tanaka A-lines used, kanji keys={len(by_kanji)} word keys={len(by_word)}")

    print("sentences: tatoeba jpn-eng.zip")
    zdata = get("https://www.manythings.org/anki/jpn-eng.zip")
    with zipfile.ZipFile(io.BytesIO(zdata)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".txt"))
        text = zf.read(name).decode("utf-8", "replace")
    extra = 0
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        en, ja = parts[0].strip(), parts[1].strip()
        if not ja or not en:
            continue
        row = {"ja": ja, "en": en}
        for ch in unique_kanji(ja):
            if len(by_kanji[ch]) < 8:
                by_kanji[ch].append(row)
                extra += 1
    print(f"  tatoeba fills={extra}")
    dump_gz("sents-kanji.json.gz", dict(by_kanji))
    # cap word index to keep the file usable
    popular = sorted(by_word.items(), key=lambda kv: -len(kv[1]))[:18000]
    dump_gz("sents-word.json.gz", {k: v for k, v in popular})


def frequency() -> None:
    print("frequency: OpenSubtitles 2016 ja_50k + KANJIDIC")
    text = get("https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/ja/ja_50k.txt").decode("utf-8", "replace")
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

    kanji_path = OUT / "kanji.json"
    kfreq = []
    if kanji_path.exists():
        data = json.loads(kanji_path.read_text(encoding="utf-8"))
        for ch, info in data.items():
            f = info.get("freq")
            if isinstance(f, int) and f > 0:
                kfreq.append({"ch": ch, "r": f, "jlpt": info.get("jlpt"), "strokes": info.get("strokes")})
        kfreq.sort(key=lambda x: x["r"])
    dump_json("freq-kanji.json", kfreq)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    strokes()
    trees_and_rads()
    sentences()
    frequency()
    print("done")


if __name__ == "__main__":
    main()
