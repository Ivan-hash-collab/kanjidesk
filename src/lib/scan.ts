import { isContentWord } from './freq'
import { loadGzJson } from './gzipJson'
import { uniqueKanji } from './kanji'
import { localWordKeys, wordsForKanji } from './lexicon'
import { memoApi } from './memo'
import {
  lookupAt,
  looksLikeStem,
  PARTICLES,
  segmentText,
  type MorphHit,
} from './morph'

const CJK = /[\u3400-\u9FFF々]/

export type { MorphHit }

export function squashJa(text: string): string {
  return text.replace(/([\u3040-\u30FF\u3400-\u9FFF々ー])\s+(?=[\u3040-\u30FF\u3400-\u9FFF々ー])/g, '$1')
}

let terms: Set<string> | null = null
let loading: Promise<Set<string>> | null = null
const pending = new Set<string>()
const enrichCache = new Map<string, Promise<string[]>>()
const tokenCache = new Map<string, { start: number; surface: string; lemma: string; lemmas?: string[] }[]>()
const MAX_CACHE = 64

function remember<K, V>(map: Map<K, V>, key: K, value: V) {
  map.set(key, value)
  if (map.size <= MAX_CACHE) return
  const first = map.keys().next().value
  if (first !== undefined) map.delete(first)
}

const CORE_LEMMAS = [
  'する',
  'くる',
  '来る',
  '行く',
  'いく',
  'ある',
  'いる',
  'なる',
  'できる',
  'かかる',
  '掛かる',
  'みる',
  '見る',
  'たべる',
  '食べる',
  'いう',
  '言う',
  '思う',
  'おく',
  '置く',
  'かく',
  '書く',
  'よむ',
  '読む',
  'はなす',
  '話す',
  'きく',
  '聞く',
  'まつ',
  '待つ',
  'もつ',
  '持つ',
  'とる',
  '取る',
  'わかる',
  '分かる',
  '浸かる',
  '浸る',
  'つかる',
  'ひたる',
  '買う',
  '使う',
  '作る',
  '出る',
  '入る',
  '帰る',
  '起きる',
  '寝る',
]

function keepDictTerm(w: string): boolean {
  if (!w) return false
  if (looksLikeStem(w)) return false
  if (PARTICLES.has(w)) return true
  if (w.length === 1 && !CJK.test(w)) return false
  if (CJK.test(w)) return true
  return isContentWord(w)
}

export async function ensureScanTerms(): Promise<Set<string>> {
  if (terms) {
    for (const w of pending) terms.add(w)
    return terms
  }
  if (!loading) {
    loading = Promise.all([
      localWordKeys().catch(() => [] as string[]),
      loadGzJson<Record<string, { written: string; kana?: string; alts?: string[] }[]>>(
        './data/words-by-kanji.json.gz',
      ).catch(() => ({}) as Record<string, { written: string; kana?: string; alts?: string[] }[]>),
    ]).then(([keys, byKanji]) => {
      const set = new Set<string>(CORE_LEMMAS)
      for (const p of PARTICLES) set.add(p)
      for (const k of keys) {
        if (keepDictTerm(k)) set.add(k)
      }
      for (const list of Object.values(byKanji)) {
        for (const w of list) {
          if (w.written && keepDictTerm(w.written)) set.add(w.written)
          if (w.kana && keepDictTerm(w.kana)) set.add(w.kana)
          for (const a of w.alts ?? []) {
            if (keepDictTerm(a)) set.add(a)
          }
        }
      }
      for (const w of pending) set.add(w)
      terms = set
      return set
    })
  }
  return loading
}

export function addScanTerms(words: string[]) {
  for (const w of words) {
    if (!w || looksLikeStem(w)) continue
    pending.add(w)
    terms?.add(w)
  }
}

export function lookupHits(text: string, i: number, extra: Iterable<string> = []): MorphHit[] {
  const bag = terms ?? new Set<string>()
  const fromI = lookupAt(text, i, bag, extra)
  const merged: MorphHit[] = []

  for (const tok of tokenCache.get(text) ?? []) {
    if (tok.start <= i && i < tok.start + tok.surface.length && tok.surface.length >= 2) {
      merged.push({
        surface: tok.surface,
        lemma: tok.lemma || tok.surface,
        kind: 'word',
        score: 1200 + tok.surface.length,
      })
      for (const lemma of tok.lemmas ?? []) {
        if (lemma && lemma !== tok.lemma) {
          merged.push({
            surface: tok.surface,
            lemma,
            kind: 'word',
            score: 1180 + tok.surface.length,
          })
        }
      }
    }
  }

  const cover = segmentText(text, bag, extra).find(
    (s) => s.start <= i && i < s.start + s.s.length && s.s.length >= 2,
  )
  if (cover) {
    merged.push({
      surface: cover.s,
      lemma: cover.lemma || cover.s,
      kind: 'word',
      score: 1100 + cover.s.length,
    })
  }

  merged.push(...fromI)

  const best = new Map<string, MorphHit>()
  for (const h of merged) {
    const key = `${h.kind}:${h.surface}:${h.lemma}`
    const prev = best.get(key)
    if (!prev || h.score > prev.score) best.set(key, h)
  }
  let hits = [...best.values()].sort((a, b) => b.score - a.score || b.surface.length - a.surface.length)
  const longest = hits.find((h) => h.kind === 'word')
  hits = hits.filter((h) => {
    if (h.kind === 'kanji') return true
    if (!longest || h.surface === longest.surface) return true
    if (longest.surface.startsWith(h.surface) && h.surface.length < longest.surface.length) {
      return PARTICLES.has(h.surface)
    }
    return true
  })
  return hits.slice(0, 8)
}

export function matchesAt(text: string, i: number, extra: Iterable<string> = []): string[] {
  return lookupHits(text, i, extra).map((h) => h.surface)
}

export function greedySeg(text: string, extra: Iterable<string> = []): { start: number; s: string; lemma: string }[] {
  return segmentText(text, terms ?? new Set<string>(), extra)
}

export function greedyMask(text: string, extra: Iterable<string> = []): boolean[] {
  const mask = Array<boolean>(text.length).fill(false)
  for (const seg of greedySeg(text, extra)) {
    if (seg.s.length >= 2 || CJK.test(seg.s)) {
      for (let k = 0; k < seg.s.length; k++) mask[seg.start + k] = true
    }
  }
  return mask
}

async function loadTokenSpans(text: string) {
  if (tokenCache.has(text)) return
  try {
    const res = await memoApi.tokenize(text)
    const spans: { start: number; surface: string; lemma: string; lemmas?: string[] }[] = []
    let start = 0
    for (const t of res.tokens ?? []) {
      const surface = t.surface || ''
      if (!surface) continue
      const pos = typeof t.begin === 'number' && t.begin >= 0 ? t.begin : Math.max(0, text.indexOf(surface, start))
      spans.push({
        start: pos,
        surface,
        lemma: t.lemma || surface,
        lemmas: t.lemmas,
      })
      start = typeof t.end === 'number' && t.end > pos ? t.end : pos + surface.length
    }
    remember(tokenCache, text, spans)
  } catch {
    /* do not cache a failed network call */
  }
}

export async function enrichScanForText(text: string): Promise<string[]> {
  const cached = enrichCache.get(text)
  if (cached) return cached
  const job = (async () => {
    const set = await ensureScanTerms()
    const extra: string[] = []
    const chars = uniqueKanji(text).slice(0, 16)
    const lists = await Promise.all(chars.map((ch) => wordsForKanji(ch)))
    for (const list of lists) {
      for (const w of list) {
        extra.push(w.written, w.kana, ...(w.alts ?? []))
        if (w.written) set.add(w.written)
        if (w.kana) set.add(w.kana)
        for (const a of w.alts ?? []) set.add(a)
      }
    }
    await loadTokenSpans(text)
    return extra.filter(Boolean)
  })()
  enrichCache.set(text, job)
  try {
    const extra = await job
    remember(enrichCache, text, job)
    return extra
  } catch (error) {
    enrichCache.delete(text)
    throw error
  }
}
