/** Rule-based deinflection like Yomitan: suffix BFS until a dictionary form. */

export type MorphHit = {
  surface: string
  lemma: string
  kind: 'word' | 'kanji'
  score: number
}

type Rule = { from: string; to: string }

const GODAN: { dict: string; i: string; a: string; e: string; o: string; te: string; ta: string }[] = [
  { dict: 'う', i: 'い', a: 'わ', e: 'え', o: 'お', te: 'って', ta: 'った' },
  { dict: 'く', i: 'き', a: 'か', e: 'け', o: 'こ', te: 'いて', ta: 'いた' },
  { dict: 'ぐ', i: 'ぎ', a: 'が', e: 'げ', o: 'ご', te: 'いで', ta: 'いだ' },
  { dict: 'す', i: 'し', a: 'さ', e: 'せ', o: 'そ', te: 'して', ta: 'した' },
  { dict: 'つ', i: 'ち', a: 'た', e: 'て', o: 'と', te: 'って', ta: 'った' },
  { dict: 'ぬ', i: 'に', a: 'な', e: 'ね', o: 'の', te: 'んで', ta: 'んだ' },
  { dict: 'ぶ', i: 'び', a: 'ば', e: 'べ', o: 'ぼ', te: 'んで', ta: 'んだ' },
  { dict: 'む', i: 'み', a: 'ま', e: 'め', o: 'も', te: 'んで', ta: 'んだ' },
  { dict: 'る', i: 'り', a: 'ら', e: 'れ', o: 'ろ', te: 'って', ta: 'った' },
]

const I_TAILS = ['', 'ます', 'ました', 'ません', 'ませんでした', 'たい', 'たかった', 'たくて', 'ながら', 'そう', '方']
const A_TAILS = ['ない', 'なかった', 'なくて', 'ず', 'せる', 'れる', 'れる', 'せない', 'れない']

function buildRules(): Rule[] {
  const rules: Rule[] = [
    { from: 'ていませんでした', to: 'る' },
    { from: 'でいませんでした', to: 'ぐ' },
    { from: 'ていません', to: 'る' },
    { from: 'でいません', to: 'ぐ' },
    { from: 'ていました', to: 'る' },
    { from: 'でいました', to: 'ぐ' },
    { from: 'ていましたら', to: 'る' },
    { from: 'ている', to: 'る' },
    { from: 'でいる', to: 'ぐ' },
    { from: 'ていた', to: 'る' },
    { from: 'でいた', to: 'ぐ' },
    { from: 'てる', to: 'る' },
    { from: 'でる', to: 'ぐ' },
    { from: 'てます', to: 'る' },
    { from: 'でます', to: 'ぐ' },
    { from: 'ませんでした', to: 'る' },
    { from: 'ました', to: 'る' },
    { from: 'ません', to: 'る' },
    { from: 'ます', to: 'る' },
    { from: 'なかった', to: 'る' },
    { from: 'なくて', to: 'る' },
    { from: 'なさい', to: 'る' },
    { from: 'られました', to: 'る' },
    { from: 'られます', to: 'る' },
    { from: 'られる', to: 'る' },
    { from: 'させました', to: 'る' },
    { from: 'させます', to: 'る' },
    { from: 'させる', to: 'る' },
    { from: 'させた', to: 'る' },
    { from: 'られた', to: 'る' },
    { from: 'れば', to: 'る' },
    { from: 'よう', to: 'る' },
    { from: 'ながら', to: 'る' },
    { from: 'たかった', to: 'る' },
    { from: 'たくて', to: 'る' },
    { from: 'たい', to: 'る' },
    { from: 'ない', to: 'る' },
    { from: 'れる', to: 'る' },
    { from: 'せる', to: 'る' },
    { from: 'て', to: 'る' },
    { from: 'た', to: 'る' },
    { from: 'ろ', to: 'る' },
    { from: 'ず', to: 'る' },
    { from: 'かった', to: 'い' },
    { from: 'くない', to: 'い' },
    { from: 'くて', to: 'い' },
    { from: 'ければ', to: 'い' },
    { from: 'く', to: 'い' },
    { from: 'しませんでした', to: 'する' },
    { from: 'しました', to: 'する' },
    { from: 'しません', to: 'する' },
    { from: 'します', to: 'する' },
    { from: 'しない', to: 'する' },
    { from: 'して', to: 'する' },
    { from: 'した', to: 'する' },
    { from: 'できる', to: 'する' },
    { from: '来ませんでした', to: '来る' },
    { from: '来ました', to: '来る' },
    { from: '来ます', to: '来る' },
    { from: '来ない', to: '来る' },
    { from: '来て', to: '来る' },
    { from: '来た', to: '来る' },
    { from: 'きませんでした', to: 'くる' },
    { from: 'きました', to: 'くる' },
    { from: 'きます', to: 'くる' },
    { from: 'こない', to: 'くる' },
    { from: 'きて', to: 'くる' },
    { from: 'きた', to: 'くる' },
    { from: '行っていました', to: '行く' },
    { from: '行っている', to: '行く' },
    { from: '行っていた', to: '行く' },
    { from: '行って', to: '行く' },
    { from: '行った', to: '行く' },
    { from: 'いきます', to: 'いく' },
    { from: 'いきました', to: 'いく' },
    { from: 'いって', to: 'いく' },
    { from: 'いった', to: 'いく' },
  ]

  for (const to of ['う', 'つ', 'る', 'く']) {
    rules.push({ from: 'っていませんでした', to })
    rules.push({ from: 'っていました', to })
    rules.push({ from: 'っている', to })
    rules.push({ from: 'っていた', to })
    rules.push({ from: 'って', to })
    rules.push({ from: 'った', to })
  }

  for (const g of GODAN) {
    rules.push({ from: g.te + 'いませんでした', to: g.dict })
    rules.push({ from: g.te + 'いました', to: g.dict })
    rules.push({ from: g.te + 'いる', to: g.dict })
    rules.push({ from: g.te + 'いた', to: g.dict })
    rules.push({ from: g.te + 'ます', to: g.dict })
    rules.push({ from: g.te, to: g.dict })
    rules.push({ from: g.ta, to: g.dict })
    for (const t of I_TAILS) {
      if (!t && g.i.length === 1) continue
      rules.push({ from: g.i + t, to: g.dict })
    }
    for (const t of A_TAILS) rules.push({ from: g.a + t, to: g.dict })
    rules.push({ from: g.e + 'ば', to: g.dict })
    rules.push({ from: g.e + 'る', to: g.dict })
    rules.push({ from: g.o + 'う', to: g.dict })
    rules.push({ from: g.e, to: g.dict })
  }

  rules.sort((a, b) => b.from.length - a.from.length)
  return rules
}

const RULES = buildRules()

const CJK = /[\u3400-\u9FFF々]/
const KANA = /[\u3040-\u30FFー]/

export const PARTICLES = new Set([
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'も',
  'の',
  'か',
  'ね',
  'よ',
  'な',
  'へ',
  'や',
  'より',
  'から',
  'まで',
  'ので',
  'のに',
  'けど',
  'でも',
  'そして',
  'また',
  'では',
  'には',
  'とは',
  'って',
  'だ',
  'です',
  'でした',
  'である',
  'ます',
  'した',
])

/** OpenSubtitles/MeCab crumbs that must never count as dictionary words. */
export function looksLikeStem(s: string): boolean {
  if (!s || s.length < 2) return false
  if (PARTICLES.has(s)) return false
  if (/っ$/.test(s)) return true
  if (/っ[るうくぐすつぬぶむい]$/.test(s)) return true
  return false
}

export function plausibleLemma(s: string): boolean {
  if (!s) return false
  if (looksLikeStem(s)) return false
  if (!CJK.test(s) && !KANA.test(s)) return false
  return true
}

export function deinflect(text: string): string[] {
  const src = text.trim()
  if (!src) return []
  const out = new Set<string>([src])
  const queue = [src]
  const seen = new Set<string>([src])
  let steps = 0
  while (queue.length && steps < 120) {
    steps += 1
    const cur = queue.shift() ?? ''
    for (const rule of RULES) {
      if (cur.length <= rule.from.length) continue
      if (!cur.endsWith(rule.from)) continue
      const next = cur.slice(0, cur.length - rule.from.length) + rule.to
      if (!next || seen.has(next)) continue
      if (next.length > cur.length + 2) continue
      if (!plausibleLemma(next) && next !== src) continue
      seen.add(next)
      out.add(next)
      queue.push(next)
    }
  }
  return [...out].filter((x) => x === src || plausibleLemma(x))
}

function inBag(s: string, bag: Set<string>, extra: Set<string>): boolean {
  return bag.has(s) || extra.has(s)
}

export function lookupAt(text: string, i: number, bag: Set<string>, extra: Iterable<string> = []): MorphHit[] {
  const extraSet = extra instanceof Set ? extra : new Set(extra)
  const max = Math.min(22, text.length - i)
  if (max <= 0) return []
  const raw: MorphHit[] = []
  for (let n = max; n >= 1; n--) {
    const surface = text.slice(i, i + n)
    if (!surface) continue
    if (/^[。、！？!?,.\s」』）)】]+$/.test(surface)) continue

    if (n === 1 && CJK.test(surface)) {
      raw.push({ surface, lemma: surface, kind: 'kanji', score: 8 })
    }

    const exact = inBag(surface, bag, extraSet) && !looksLikeStem(surface)
    if (exact) {
      raw.push({ surface, lemma: surface, kind: 'word', score: 90 + n * 3 })
    }

    if (n >= 2) {
      for (const lemma of deinflect(surface)) {
        if (lemma === surface) continue
        if (!inBag(lemma, bag, extraSet)) continue
        raw.push({
          surface,
          lemma,
          kind: 'word',
          score: 100 + n * 4 + (lemma.length >= 2 ? 6 : 0),
        })
      }
    }

    if (n === 1 && PARTICLES.has(surface) && inBag(surface, bag, extraSet)) {
      raw.push({ surface, lemma: surface, kind: 'word', score: 30 })
    }
  }

  const best = new Map<string, MorphHit>()
  for (const h of raw) {
    const key = `${h.kind}:${h.surface}:${h.lemma}`
    const prev = best.get(key)
    if (!prev || h.score > prev.score) best.set(key, h)
  }

  let hits = [...best.values()].sort((a, b) => b.score - a.score || b.surface.length - a.surface.length)
  const longestWord = hits.find((h) => h.kind === 'word')
  hits = hits.filter((h) => {
    if (h.kind === 'kanji') return true
    if (!longestWord || h.surface === longestWord.surface) return true
    if (longestWord.surface.startsWith(h.surface) && h.surface.length < longestWord.surface.length) {
      return PARTICLES.has(h.surface)
    }
    return true
  })

  const seenSurf = new Set<string>()
  const out: MorphHit[] = []
  for (const h of hits) {
    const k = h.kind === 'kanji' ? `k:${h.surface}` : `w:${h.surface}`
    if (seenSurf.has(k)) continue
    seenSurf.add(k)
    out.push(h)
  }
  return out.slice(0, 8)
}

export function segmentText(
  text: string,
  bag: Set<string>,
  extra: Iterable<string> = [],
): { start: number; s: string; lemma: string }[] {
  const out: { start: number; s: string; lemma: string }[] = []
  let i = 0
  while (i < text.length) {
    const hits = lookupAt(text, i, bag, extra)
    const word = hits.find((h) => h.kind === 'word' && h.surface.length >= 1)
    if (word && (word.surface.length >= 2 || CJK.test(word.surface) || PARTICLES.has(word.surface))) {
      out.push({ start: i, s: word.surface, lemma: word.lemma })
      i += word.surface.length
      continue
    }
    const ch = text[i] ?? ''
    out.push({ start: i, s: ch, lemma: ch })
    i += 1
  }
  return out
}
