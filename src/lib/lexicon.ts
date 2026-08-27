import { loadDict, uniqueKanji } from './kanji'
import { loadGzJson, loadJson } from './gzipJson'
import { mergeGlosses } from './gloss'
import { deinflectWritten, kunLemma, matchWordToKun } from './deinflect'
import { deinflect } from './morph'
import { ensurePitch, pitchOf } from './pitch'
import type { KanjiDict } from '../types'

export type LexWord = {
  written: string
  kana: string
  meanings: string[]
  common: boolean
  alts?: string[]
  pitch?: number[]
}

export type Sentence = {
  ja: string
  en: string
}

type ApiVariant = {
  written: string
  pronounced: string
  priorities?: string[]
}

type ApiWord = {
  meanings?: { glosses?: string[] }[]
  variants?: ApiVariant[]
}

const wordCache = new Map<string, LexWord[]>()
const wordInflight = new Map<string, Promise<LexWord[]>>()
const sentCache = new Map<string, Sentence[]>()
let localKanji: Record<string, Sentence[]> | null = null
let localWord: Record<string, Sentence[]> | null = null
let localTried = false

async function localSents() {
  if (localTried) return
  localTried = true
  try {
    const [k, w] = await Promise.all([
      loadGzJson<Record<string, Sentence[]>>('./data/sents-kanji.json.gz'),
      loadGzJson<Record<string, Sentence[]>>('./data/sents-word.json.gz'),
    ])
    localKanji = k
    localWord = w
  } catch {
    localKanji = {}
    localWord = {}
  }
}

function commonOf(v: ApiVariant): boolean {
  return Boolean(v.priorities && v.priorities.length)
}

const CJK = /[\u3400-\u9FFF々]/

export function kanjiLen(s: string): number {
  return [...s].filter((c) => CJK.test(c)).length
}

export function isLexJunk(w: { written: string; kana?: string; meanings?: string[] }): boolean {
  const wr = w.written || ''
  if (!wr) return true
  if (/[ヽヾゝゞ゛゜]/.test(wr) && kanjiLen(wr) === 0) return true
  if (!CJK.test(wr)) return true
  if (/^[\u2E80-\u2EFF\u2F00-\u2FDF\u31C0-\u31EF]+$/.test(wr)) return true
  const gl = (w.meanings?.[0] || '').trim().toLowerCase()
  if (
    wr.length <= 3 &&
    /^(dot|stroke|drop|slash|lid|hook|box|knife|power|ice|seal|cliff|mouth|earth|woman|child|roof|inch|small|mountain|river|tree|water|fire|claw|dog|jade|field|eye|stone|spirit|grain|hole|stand|bamboo|rice|silk|sheep|ear|flesh|boat|grass|insect|clothes|see|horn|words|shell|red|run|foot|cart|west|gold|long|gate|rain|blue|face|wind|eat|head|horse|fish|bird|yellow|black|tooth|dragon)$/.test(
      gl,
    )
  ) {
    return true
  }
  if (/^слово\s*#\d+/i.test(gl)) return true
  return false
}

export function normRead(s: string): string {
  return s.replace(/[.\-\s'’]/g, '').replace(/ー/g, '')
}

function pickVariant(variants: ApiVariant[], ch: string): ApiVariant | null {
  const usable = variants.filter((v) => v.written)
  if (!usable.length) return null
  const withCh = usable.filter((v) => v.written.includes(ch))
  const pool = withCh.length ? withCh : usable
  pool.sort(
    (a, b) =>
      Number(commonOf(b)) - Number(commonOf(a)) ||
      kanjiLen(b.written) - kanjiLen(a.written) ||
      a.written.length - b.written.length,
  )
  return pool[0]
}

export function mergeWordVariants(words: LexWord[]): LexWord[] {
  const byWritten = new Map<string, LexWord>()
  const writtenOrder: string[] = []
  for (const w of words) {
    const prev = byWritten.get(w.written)
    if (!prev) {
      byWritten.set(w.written, {
        ...w,
        meanings: mergeGlosses(w.meanings),
        alts: w.alts ? [...w.alts] : [],
      })
      writtenOrder.push(w.written)
      continue
    }
    byWritten.set(w.written, {
      ...prev,
      meanings: mergeGlosses(prev.meanings, w.meanings).slice(0, 12),
      common: prev.common || w.common,
      kana: prev.kana || w.kana,
      alts: [...new Set([...(prev.alts ?? []), ...(w.alts ?? [])])].filter((x) => x !== prev.written),
      pitch: prev.pitch?.length ? prev.pitch : w.pitch,
    })
  }
  const bySense = new Map<string, LexWord>()
  const senseOrder: string[] = []
  for (const written of writtenOrder) {
    const w = byWritten.get(written)
    if (!w) continue
    const key = `${normRead(w.kana) || w.written}|${(w.meanings[0] || '').toLowerCase()}`
    const prev = bySense.get(key)
    if (!prev) {
      bySense.set(key, { ...w, alts: w.alts ?? [] })
      senseOrder.push(key)
      continue
    }
    const alts = [...new Set([...(prev.alts ?? []), w.written, ...(w.alts ?? [])])].filter((x) => x !== prev.written)
    bySense.set(key, {
      ...prev,
      meanings: mergeGlosses(prev.meanings, w.meanings).slice(0, 12),
      common: prev.common || w.common,
      alts,
      pitch: prev.pitch?.length ? prev.pitch : w.pitch,
    })
  }
  return senseOrder.map((k) => bySense.get(k)!)
}

export function capSameGloss(words: LexWord[], maxPer = 2): LexWord[] {
  if (maxPer <= 0) return words
  const n = new Map<string, number>()
  const out: LexWord[] = []
  for (const w of words) {
    const g = (w.meanings[0] || '').trim().toLowerCase()
    if (!g) {
      out.push(w)
      continue
    }
    const c = n.get(g) ?? 0
    if (c >= maxPer) continue
    n.set(g, c + 1)
    out.push(w)
  }
  return out
}

export function collapseWords(words: LexWord[]): LexWord[] {
  return mergeWordVariants(words)
    .filter((w) => !isLexJunk(w))
    .sort(
    (a, b) =>
      Number(b.common) - Number(a.common) ||
      Number(kanjiLen(a.written) !== 1) - Number(kanjiLen(b.written) !== 1) ||
      kanjiLen(a.written) - kanjiLen(b.written) ||
      a.written.length - b.written.length,
  )
}

let localByKanji: Record<string, LexWord[]> | null = null
let localByTried = false

async function localWordsIndex(): Promise<Record<string, LexWord[]>> {
  if (localByTried) return localByKanji ?? {}
  localByTried = true
  try {
    localByKanji = await loadGzJson<Record<string, LexWord[]>>('./data/words-by-kanji.json.gz')
  } catch {
    localByKanji = {}
  }
  return localByKanji ?? {}
}

let flatWords: LexWord[] | null = null
let glossIndex: Map<string, LexWord[]> | null = null

const GLOSS_STOP = new Set(['the', 'and', 'of', 'to', 'a', 'an', 'in', 'on', 'for', 'or', 'by', 'with', 'from', 'as'])

export function glossTokens(meanings: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of meanings) {
    const parts = m.toLowerCase().match(/[a-z][a-z'-]{1,}/g) || []
    for (const t of parts) {
      if (t.length < 2 || GLOSS_STOP.has(t) || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function buildGlossIndex(words: LexWord[]) {
  const idx = new Map<string, LexWord[]>()
  for (const w of words) {
    for (const t of glossTokens(w.meanings)) {
      const arr = idx.get(t)
      if (arr) arr.push(w)
      else idx.set(t, [w])
    }
  }
  glossIndex = idx
}

export function isFullLexicon(list: LexWord[]): boolean {
  return Boolean(flatWords && list === flatWords)
}

export function glossHits(token: string): LexWord[] | null {
  if (!glossIndex) return null
  return glossIndex.get(token.toLowerCase()) ?? []
}

export async function allLocalWords(): Promise<LexWord[]> {
  if (flatWords) return flatWords
  const idx = await localWordsIndex()
  const seen = new Set<string>()
  const out: LexWord[] = []
  for (const list of Object.values(idx)) {
    for (const w of list) {
      const id = `${w.written}|${w.kana}`
      if (seen.has(id) || isLexJunk(w)) continue
      seen.add(id)
      out.push(w)
    }
  }
  flatWords = collapseWords(out)
  buildGlossIndex(flatWords)
  return flatWords
}

export function parseTermKey(k: string): { written: string; kana: string } {
  const m = k.match(/^(.+?)\{([^}]+)\}$/)
  if (m) return { written: (m[1] ?? k).trim(), kana: (m[2] ?? '').trim() }
  return { written: k.replace(/\{[^}]*\}/g, '').trim(), kana: '' }
}

async function backupTerms(ch: string): Promise<LexWord[]> {
  await localSents()
  const out: LexWord[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(localWord ?? {})) {
    const { written, kana } = parseTermKey(key)
    if (!written.includes(ch) || seen.has(written)) continue
    if (/[ヽヾゝゞ]/.test(written) || !CJK.test(written)) continue
    seen.add(written)
    const sample = localWord?.[key]?.[0]
    out.push({
      written,
      kana,
      meanings: sample?.en ? [tidyEn(sample.en)] : [],
      common: false,
    })
    if (out.length >= 200) break
  }
  try {
    const freq = await loadJson<{ w: string }[]>('./data/freq-words.json')
    for (const x of freq) {
      if (!x.w.includes(ch) || seen.has(x.w)) continue
      seen.add(x.w)
      out.push({ written: x.w, kana: '', meanings: [], common: false })
      if (out.length >= 280) break
    }
  } catch {
    /* optional */
  }
  return out
}

async function fetchWordsForKanji(ch: string): Promise<LexWord[]> {
  const local = (await localWordsIndex())[ch] ?? []
  const extra = await backupTerms(ch)
  try {
    const res = await fetch(`https://kanjiapi.dev/v1/words/${encodeURIComponent(ch)}`)
    if (!res.ok) throw new Error('words')
    const data = (await res.json()) as ApiWord[]
    const out: LexWord[] = []
    for (const w of data) {
      const glosses = (w.meanings ?? []).flatMap((m) => m.glosses ?? [])
      const v = pickVariant(w.variants ?? [], ch)
      if (!v) continue
      const alts = (w.variants ?? [])
        .map((x) => x.written)
        .filter((x) => x && x !== v.written && kanjiLen(x) > 0)
      out.push({
        written: v.written,
        kana: v.pronounced,
        meanings: glosses,
        common: commonOf(v),
        alts: [...new Set(alts)].slice(0, 4),
      })
    }
    return (await enrichWords([...local, ...out, ...extra])).filter((w) => !isLexJunk(w)).slice(0, 400)
  } catch {
    return (await enrichWords([...local, ...extra])).filter((w) => !isLexJunk(w))
  }
}

export async function wordsForKanji(ch: string): Promise<LexWord[]> {
  const cacheKey = `v10:${ch}`
  if (wordCache.has(cacheKey)) return wordCache.get(cacheKey) ?? []
  const pending = wordInflight.get(cacheKey)
  if (pending) return pending
  const job = fetchWordsForKanji(ch).then((list) => {
    wordCache.set(cacheKey, list)
    return list
  }).finally(() => {
    wordInflight.delete(cacheKey)
  })
  wordInflight.set(cacheKey, job)
  return job
}

export function tidyEn(en: string): string {
  return en.replace(/\s*#ID=\S+/gi, '').replace(/\s+/g, ' ').trim()
}

async function glossBackups(written: string): Promise<string[]> {
  await localSents()
  const tanakaHits: string[] = []
  for (const [key, rows] of Object.entries(localWord ?? {})) {
    if (parseTermKey(key).written !== written) continue
    for (const s of rows) {
      const t = tidyEn(s.en)
      if (t.length > 0 && t.length <= 72) tanakaHits.push(t)
    }
  }
  const tanaka = mergeGlosses(tanakaHits)
  const chars = uniqueKanji(written)
  if (!chars.length && !tanaka.length) return mergeGlosses(tanaka)
  const dict = await loadDict().catch(() => null)
  let kanjiMeanings: string[] = []
  if (dict && chars.length === 1 && written === chars[0]) {
    kanjiMeanings = dict[chars[0]]?.meanings ?? []
  } else if (dict && chars.length) {
    kanjiMeanings = mergeGlosses(...chars.map((ch) => dict[ch]?.meanings.slice(0, 2)))
  }
  return mergeGlosses(tanaka, kanjiMeanings)
}

async function enrichWords(words: LexWord[]): Promise<LexWord[]> {
  const collapsed = collapseWords(words).map((w) => ({
    ...w,
    meanings: mergeGlosses(w.meanings).slice(0, 12),
  }))
  const pitches = await ensurePitch()
  const withPitch = collapsed.map((w) => {
    if (w.pitch?.length) return w
    const p = pitchOf(w.written, w.kana, pitches)
    return p?.length ? { ...w, pitch: p } : w
  })
  if (withPitch.every((w) => w.meanings.length)) return withPitch
  return Promise.all(
    withPitch.map(async (w) => {
      if (w.meanings.length) return w
      return { ...w, meanings: (await glossBackups(w.written)).slice(0, 12) }
    }),
  )
}

let formIndex: Map<string, LexWord[]> | null = null

async function wordFormIndex(): Promise<Map<string, LexWord[]>> {
  if (formIndex) return formIndex
  const idx = await localWordsIndex()
  const map = new Map<string, LexWord[]>()
  const add = (key: string, w: LexWord) => {
    if (!key) return
    const arr = map.get(key) ?? []
    if (!arr.some((x) => x.written === w.written && x.kana === w.kana)) arr.push(w)
    map.set(key, arr)
  }
  for (const list of Object.values(idx)) {
    for (const w of list) {
      add(w.written, w)
      add(w.kana, w)
      for (const a of w.alts ?? []) add(a, w)
    }
  }
  formIndex = map
  return map
}

function preferWord(a: LexWord, b: LexWord): LexWord {
  const ac = Number(a.common) - Number(b.common)
  if (ac !== 0) return ac > 0 ? a : b
  const ak = kanjiLen(a.written) - kanjiLen(b.written)
  if (ak !== 0) return ak > 0 ? a : b
  return a.written.length <= b.written.length ? a : b
}

function pickWord(list: LexWord[]): LexWord | null {
  if (!list.length) return null
  return list.reduce((best, w) => preferWord(best, w))
}

export async function findWord(written: string): Promise<LexWord | null> {
  const key = written.trim()
  if (!key) return null
  const forms = [...new Set([key, ...deinflect(key), ...deinflectWritten(key)])]
  const idx = await wordFormIndex()
  for (const form of forms) {
    const hit = pickWord(idx.get(form) ?? [])
    if (hit) {
      if (hit.meanings.length) return hit
      return { ...hit, meanings: await glossBackups(hit.written) }
    }
  }
  const chars = uniqueKanji(key)
  for (const form of forms) {
    const formChars = uniqueKanji(form)
    for (const ch of formChars.length ? formChars : chars) {
      const list = await wordsForKanji(ch)
      const hit =
        list.find((w) => w.written === form) ??
        list.find((w) => w.kana === form) ??
        list.find((w) => w.alts?.includes(form)) ??
        list.find((w) => w.written === key) ??
        list.find((w) => w.alts?.includes(key))
      if (hit) {
        if (hit.meanings.length) return hit
        return { ...hit, meanings: await glossBackups(hit.written) }
      }
    }
  }
  const meanings = await glossBackups(key)
  if (meanings.length && !chars.length) {
    await localSents()
    return {
      written: key,
      kana: key,
      meanings,
      common: Boolean(localWord?.[key]),
    }
  }
  return null
}

function toHiraLocal(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export function wordsForReading(
  words: LexWord[],
  ch: string,
  reading: string,
  dict: KanjiDict,
): { exact: LexWord[]; stem: LexWord[] } {
  const bag = [...words]
  const lemma = kunLemma(ch, reading, dict)
  if (lemma && !bag.some((w) => w.written === lemma.written)) {
    bag.unshift({
      written: lemma.written,
      kana: lemma.kana,
      meanings: (dict[ch]?.meanings ?? []).slice(0, 3),
      common: Boolean(lemma && (dict[ch]?.freq ?? 99) <= 1500),
    })
  }
  const exact: LexWord[] = []
  const stem: LexWord[] = []
  const seen = new Set<string>()
  const rd = normRead(reading)
  for (const w of bag) {
    // For a single-kanji reading (on or kun), only accept words whose kana
    // actually begins with that reading, so an on-reading never pulls in a
    // kun-reading word.
    const hira = normRead(toHiraLocal(w.kana))
    if (rd && hira && !hira.startsWith(rd)) continue
    const kind = matchWordToKun(w.written, w.kana, ch, reading, dict)
    if (!kind) continue
    const id = `${w.written}|${w.kana}`
    if (seen.has(id)) continue
    seen.add(id)
    if (kind === 'exact') exact.push(w)
    else stem.push(w)
  }
  return { exact, stem }
}

function tidySent(s: Sentence): Sentence {
  return {
    ja: s.ja.trim(),
    en: tidyEn(s.en),
  }
}

function uniqSents(rows: Sentence[], cap: number): Sentence[] {
  const seen = new Set<string>()
  const out: Sentence[] = []
  for (const raw of rows) {
    const s = tidySent(raw)
    if (!s.ja || !s.en || seen.has(s.ja)) continue
    seen.add(s.ja)
    out.push(s)
    if (out.length >= cap) break
  }
  return out
}

export async function localWordKeys(): Promise<string[]> {
  await localSents()
  return Object.keys(localWord ?? {})
    .map((k) => k.replace(/\{[^}]*\}/g, '').trim())
    .filter(Boolean)
}

export async function sentencesFor(q: string): Promise<Sentence[]> {
  const key = q.trim()
  if (!key) return []
  if (sentCache.has(key)) return sentCache.get(key) ?? []
  await localSents()
  const local: Sentence[] = []
  if (localWord?.[key]) local.push(...localWord[key])
  if (key.length === 1 && localKanji?.[key]) local.push(...localKanji[key])
  let out = uniqSents(local, 8)
  if (out.length >= 4) {
    sentCache.set(key, out)
    return out
  }
  try {
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { text?: string; translations?: { text?: string; lang?: string }[][] }[]
      }
      const net: Sentence[] = []
      for (const row of data.results ?? []) {
        const ja = row.text ?? ''
        const flat = (row.translations ?? []).flat()
        const en = flat.find((t) => t.lang === 'eng' || t.lang === 'en')?.text || flat[0]?.text || ''
        if (ja && en) net.push({ ja, en })
      }
      out = uniqSents([...out, ...net], 8)
    }
  } catch {
    /* local only */
  }
  sentCache.set(key, out)
  return out
}
