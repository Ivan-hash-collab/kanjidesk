import type { KanjiDict, KanjiInfo } from '../types'
import { uniqueKanji } from './kanji'
import { kataToHira, queryKana, queryRoma, toRomaji } from './kana'
import type { LexWord } from './lexicon'
import { capSameGloss, glossHits, isFullLexicon, kanjiLen, mergeWordVariants } from './lexicon'

export type JlptFilter = 'all' | 'none' | 5 | 4 | 3 | 2 | 1
export type DictKind = 'kanji' | 'words'
export type DictSort = 'freq' | 'jlpt' | 'strokes' | 'len'

export type DictQuery = {
  text: string
  noRomaji: boolean
  meaningOnly: boolean
  readingOnly: boolean
  commonOnly: boolean
  jlpt?: JlptFilter
}

export type ScoreOpts = {
  noRomaji?: boolean
  meaningOnly?: boolean
  readingOnly?: boolean
}

const FLAG_ROMA = /^(?:-roma(?:ji)?|-ромадзи|-ромаджи|!roma(?:ji)?)$/i
const FLAG_READING = /^(?:-kana|-yomi|-reading|-чтение)$/i
const FLAG_COMMON = /^(?:#common|#freq|#частотн(?:ые|ое)?)$/i
const FLAG_JLPT = /^#(?:jlpt-?)?n([1-5])$/i
const PREF_EN = /^(?:en|eng|gloss|m|значение):(.*)$/i
const PREF_READ = /^(?:roma|romaji|kana|yomi|r|reading|чтение):(.*)$/i

export function parseDictQuery(raw: string): DictQuery {
  const out: DictQuery = {
    text: '',
    noRomaji: false,
    meaningOnly: false,
    readingOnly: false,
    commonOnly: false,
  }
  const rest: string[] = []
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    if (FLAG_ROMA.test(token)) {
      out.noRomaji = true
      continue
    }
    if (FLAG_READING.test(token)) {
      out.meaningOnly = true
      continue
    }
    if (FLAG_COMMON.test(token)) {
      out.commonOnly = true
      continue
    }
    const jlpt = token.match(FLAG_JLPT)
    if (jlpt) {
      out.jlpt = Number(jlpt[1]) as 1 | 2 | 3 | 4 | 5
      continue
    }
    const en = token.match(PREF_EN)
    if (en) {
      out.meaningOnly = true
      out.noRomaji = true
      if (en[1]) rest.push(en[1])
      continue
    }
    const rd = token.match(PREF_READ)
    if (rd) {
      out.readingOnly = true
      if (rd[1]) rest.push(rd[1])
      continue
    }
    rest.push(token)
  }
  out.text = rest.join(' ')
  return out
}

function queryReadings(raw: string, opts: ScoreOpts): { qHira: string; qRoma: string } {
  const hasJa = /[\u3400-\u9fffぁ-んァ-ン]/.test(raw)
  if (opts.meaningOnly && !hasJa) return { qHira: '', qRoma: '' }
  if (opts.noRomaji) {
    if (!hasJa) return { qHira: '', qRoma: '' }
    return { qHira: queryKana(raw), qRoma: '' }
  }
  return { qHira: queryKana(raw), qRoma: queryRoma(raw) }
}

export const JLPT_FILTERS: { id: JlptFilter; label: string }[] = [
  { id: 'all', label: 'все' },
  { id: 5, label: 'N5' },
  { id: 4, label: 'N4' },
  { id: 3, label: 'N3' },
  { id: 2, label: 'N2' },
  { id: 1, label: 'N1' },
  { id: 'none', label: 'без JLPT' },
]

export function matchJlpt(level: number | null | undefined, filter: JlptFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'none') return !level
  return level === filter
}

/**
 * Single, consistent JLPT for a whole word so the same word doesn't pop up as
 * N1 in one list and N5 in another. Take the hardest (lowest) kanji level:
 * 関係 → 関(N2) + 係(N2) → N2. Words with no kanji level are left untagged.
 */
export function wordJlpt(written: string, dict: KanjiDict): number | null {
  const chars = uniqueKanji(written)
  if (!chars.length) return null
  const levels = chars
    .map((ch) => dict[ch]?.jlpt)
    .filter((n): n is number => n != null && n >= 1 && n <= 5)
  if (!levels.length) return null
  return Math.min(...levels)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function glossScore(meanings: string[], q: string, wordRe: RegExp | null): number {
  if (q.length < 2) return 0
  const ql = q.toLowerCase()
  let best = 0
  for (const m of meanings) {
    const t = m.toLowerCase()
    if (t === ql) best = Math.max(best, 520)
    else if (t.startsWith(`${ql} `) || t.startsWith(`${ql},`) || t.startsWith(`${ql};`)) best = Math.max(best, 420)
    else if (wordRe?.test(t)) best = Math.max(best, 380)
  }
  return best
}

function makeGlossRe(q: string): RegExp | null {
  if (q.length < 2) return null
  return new RegExp(`(?:^|[^a-z])${escapeRe(q)}(?:$|[^a-z])`, 'i')
}

export function kanjiScore(ch: string, info: KanjiInfo, query: string, opts: ScoreOpts = {}): number {
  const raw = query.trim()
  const q = raw.toLowerCase()
  if (!q) return 1
  if (ch === raw) return 1000
  const hasJa = /[\u3400-\u9fffぁ-んァ-ン]/.test(raw)
  const meaning = opts.readingOnly ? 0 : glossScore(info.meanings, q, makeGlossRe(q))
  if (opts.meaningOnly && !hasJa) return meaning
  const { qHira, qRoma } = queryReadings(raw, opts)
  if (!qHira && !qRoma) return meaning
  const readings = [...info.on, ...info.kun].map((r) => kataToHira(r).replace(/[.\s]/g, ''))
  const romas = readings.map((r) => toRomaji(r))
  if (readings.some((r) => r === qHira) || romas.some((r) => r === qRoma)) return 860
  if (meaning >= 520) return meaning
  if (qHira.length >= 2 && readings.some((r) => r.startsWith(qHira))) return 640
  if (qRoma.length >= 3 && romas.some((r) => r.startsWith(qRoma))) return 620
  if (qHira.length >= 3 && readings.some((r) => r.includes(qHira))) return 480
  return meaning
}

type WordCtx = {
  raw: string
  q: string
  qHira: string
  qRoma: string
  hasJa: boolean
  meaningRe: RegExp | null
  opts: ScoreOpts
}

function wordScoreCtx(w: LexWord, ctx: WordCtx): number {
  const { raw, q, qHira, qRoma, hasJa, meaningRe, opts } = ctx
  const meaning = opts.readingOnly ? 0 : glossScore(w.meanings, q, meaningRe)
  if (opts.meaningOnly && !hasJa) return meaning
  const kana = kataToHira(w.kana || '').replace(/[.\-\s]/g, '')
  if (!qHira && !qRoma && !hasJa) return meaning
  if (w.written === raw) return 1000
  if (!opts.meaningOnly) {
    if (kana && qHira && kana === qHira) return 920
    if (qRoma && toRomaji(kana) === qRoma) return 910
    if (w.alts?.includes(raw)) return 880
    if (/[\u3400-\u9fff]/.test(raw) && w.written.startsWith(raw)) return 760
    if (qHira.length >= 2 && kana.startsWith(qHira)) return 720
    if (qRoma.length >= 3 && toRomaji(kana).startsWith(qRoma)) return 700
    if (/[\u3400-\u9fff]/.test(raw) && w.written.includes(raw)) return 640
    if (qHira.length >= 3 && kana.includes(qHira)) return 560
  }
  return meaning
}

export function wordScore(w: LexWord, query: string, opts: ScoreOpts = {}): number {
  const raw = query.trim()
  if (!raw) return 1
  const q = raw.toLowerCase()
  return wordScoreCtx(w, {
    raw,
    q,
    ...queryReadings(raw, opts),
    hasJa: /[\u3400-\u9fffぁ-んァ-ン]/.test(raw),
    meaningRe: makeGlossRe(q),
    opts,
  })
}

function jlptRank(level: number | null | undefined): number {
  return level ?? 0
}

function sortKanji(dict: KanjiDict, sort: DictSort, a: string, b: string): number {
  const ia = dict[a]
  const ib = dict[b]
  if (sort === 'jlpt') return jlptRank(ib?.jlpt) - jlptRank(ia?.jlpt) || (ia?.freq ?? 99999) - (ib?.freq ?? 99999)
  if (sort === 'strokes') return (ia?.strokes ?? 99) - (ib?.strokes ?? 99) || (ia?.freq ?? 99999) - (ib?.freq ?? 99999)
  return (ia?.freq ?? 99999) - (ib?.freq ?? 99999)
}

function sortWord(dict: KanjiDict, sort: DictSort, a: LexWord, b: LexWord): number {
  if (sort === 'jlpt') {
    return jlptRank(wordJlpt(b.written, dict)) - jlptRank(wordJlpt(a.written, dict)) || Number(b.common) - Number(a.common)
  }
  if (sort === 'len' || sort === 'strokes') {
    return a.written.length - b.written.length || kanjiLen(a.written) - kanjiLen(b.written)
  }
  return Number(b.common) - Number(a.common) || a.written.length - b.written.length
}

export function searchKanji(
  dict: KanjiDict,
  q: string,
  jlpt: JlptFilter,
  sort: DictSort,
  limit = 240,
  extra?: ScoreOpts,
): string[] {
  const parsed = parseDictQuery(q)
  const query = parsed.text
  const opts: ScoreOpts = {
    noRomaji: parsed.noRomaji || extra?.noRomaji,
    meaningOnly: parsed.meaningOnly || extra?.meaningOnly,
    readingOnly: parsed.readingOnly || extra?.readingOnly,
  }
  const jlptUse = parsed.jlpt ?? jlpt
  if (!query) {
    return Object.keys(dict)
      .filter((ch) => matchJlpt(dict[ch]?.jlpt, jlptUse))
      .sort((a, b) => sortKanji(dict, sort, a, b))
      .slice(0, limit)
  }
  const scored: { ch: string; s: number }[] = []
  const exact = uniqueKanji(query)
  if (exact.length && query === exact.join('')) {
    for (const ch of exact) {
      if (dict[ch] && matchJlpt(dict[ch].jlpt, jlptUse)) scored.push({ ch, s: 1000 })
    }
  }
  for (const [ch, info] of Object.entries(dict)) {
    if (!matchJlpt(info.jlpt, jlptUse)) continue
    const s = kanjiScore(ch, info, query, opts)
    if (s) scored.push({ ch, s })
  }
  scored.sort((a, b) => b.s - a.s || sortKanji(dict, sort, a.ch, b.ch))
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of scored) {
    if (seen.has(row.ch)) continue
    seen.add(row.ch)
    out.push(row.ch)
    if (out.length >= limit) break
  }
  return out
}

function isEnglishGlossQuery(raw: string, opts: ScoreOpts): boolean {
  if (!raw || /[\u3400-\u9fffぁ-んァ-ン]/.test(raw)) return false
  if (opts.readingOnly) return false
  if (opts.noRomaji || opts.meaningOnly) return true
  return !queryKana(raw) && !queryRoma(raw)
}

function poolForQuery(list: LexWord[], query: string, opts: ScoreOpts): LexWord[] {
  if (!query || !isEnglishGlossQuery(query, opts) || !isFullLexicon(list)) return list
  const tokens = query.toLowerCase().match(/[a-z][a-z'-]+/g) || [query.toLowerCase()]
  let pool: LexWord[] | null = null
  for (const t of tokens) {
    const hits = glossHits(t)
    if (!hits) return list
    if (!pool) pool = hits
    else {
      const allow = new Set(hits)
      pool = pool.filter((w) => allow.has(w))
    }
  }
  return pool ?? []
}

export function filterWords(
  list: LexWord[],
  q: string,
  dict: KanjiDict,
  jlpt: JlptFilter,
  sort: DictSort,
  limit = 80,
  extra?: ScoreOpts,
): LexWord[] {
  const parsed = parseDictQuery(q)
  const query = parsed.text
  const opts: ScoreOpts = {
    noRomaji: parsed.noRomaji || extra?.noRomaji,
    meaningOnly: parsed.meaningOnly || extra?.meaningOnly,
    readingOnly: parsed.readingOnly || extra?.readingOnly,
  }
  const jlptUse = parsed.jlpt ?? jlpt
  const pool = poolForQuery(list, query, opts)
  const ctx: WordCtx | null = query
    ? {
        raw: query,
        q: query.toLowerCase(),
        ...queryReadings(query, opts),
        hasJa: /[\u3400-\u9fffぁ-んァ-ン]/.test(query),
        meaningRe: makeGlossRe(query.toLowerCase()),
        opts,
      }
    : null
  const scored: { w: LexWord; s: number }[] = []
  for (const w of pool) {
    if (parsed.commonOnly && !w.common) continue
    if (!matchJlpt(wordJlpt(w.written, dict), jlptUse)) continue
    const s = ctx ? wordScoreCtx(w, ctx) : 1
    if (!s) continue
    scored.push({ w, s })
  }
  scored.sort((a, b) => b.s - a.s || sortWord(dict, sort, a.w, b.w))
  const ranked: LexWord[] = []
  const seen = new Set<string>()
  for (const row of scored) {
    const id = `${row.w.written}|${row.w.kana}`
    if (seen.has(id)) continue
    seen.add(id)
    ranked.push(row.w)
  }
  const merged = mergeWordVariants(ranked)
  const capped = query && isEnglishGlossQuery(query, opts) ? capSameGloss(merged, 2) : merged
  return capped.slice(0, limit)
}
