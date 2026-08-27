import { loadJson } from './gzipJson'

export type WordFreq = { w: string; n: number; r: number }
export type KanjiFreq = { ch: string; r: number; jlpt: number | null; strokes: number | null }

let words: WordFreq[] | null = null
let wordMap: Map<string, WordFreq> | null = null
let kanji: KanjiFreq[] | null = null
let kanjiMap: Map<string, KanjiFreq> | null = null

async function ensureWords() {
  if (words) return
  words = await loadJson<WordFreq[]>('./data/freq-words.json').catch(() => [])
  wordMap = new Map(words.map((x) => [x.w, x]))
}

async function ensureKanji() {
  if (kanji) return
  kanji = await loadJson<KanjiFreq[]>('./data/freq-kanji.json').catch(() => [])
  kanjiMap = new Map(kanji.map((x) => [x.ch, x]))
}

const CJK = /[\u3400-\u9FFF]/

export async function wordFreqOf(w: string): Promise<WordFreq | null> {
  await ensureWords()
  return wordMap?.get(w) ?? null
}

export async function kanjiFreqOf(ch: string): Promise<KanjiFreq | null> {
  await ensureKanji()
  return kanjiMap?.get(ch) ?? null
}

export async function freqOfKanji(ch: string, dictFreq?: number | null): Promise<number | null> {
  await ensureKanji()
  return kanjiMap?.get(ch)?.r ?? dictFreq ?? null
}

export async function preloadFreq() {
  await Promise.all([ensureWords(), ensureKanji()])
}

export type WordFreqHit = { r: number; n?: number; kind: 'word' } | null

export function freqOfWordSync(written: string, extra: Iterable<string> = []): WordFreqHit {
  if (!wordMap) return null
  const seen = new Set<string>()
  for (const k of [written, ...extra]) {
    if (!k || seen.has(k)) continue
    seen.add(k)
    const f = wordMap.get(k)
    if (f) return { r: f.r, n: f.n, kind: 'word' }
  }
  return null
}

export async function freqOfWord(written: string, extra: Iterable<string> = []): Promise<WordFreqHit> {
  await ensureWords()
  const seen = new Set<string>()
  for (const k of [written, ...extra]) {
    if (!k || seen.has(k)) continue
    seen.add(k)
    const f = wordMap?.get(k)
    if (f) return { r: f.r, n: f.n, kind: 'word' }
  }
  return null
}

export function isContentWord(w: string): boolean {
  if (!w) return false
  if (CJK.test(w)) return w.length >= 1
  return w.length >= 2 && /^[\u3040-\u30FFー]+$/.test(w)
}

export async function topWords(n = 40): Promise<WordFreq[]> {
  await ensureWords()
  return (words ?? []).filter((x) => isContentWord(x.w)).slice(0, n)
}

export async function topKanji(n = 80): Promise<KanjiFreq[]> {
  await ensureKanji()
  return (kanji ?? []).slice(0, n)
}

export function freqLabel(rank: number | null | undefined): string {
  if (!rank) return ''
  if (rank <= 500) return `частота ${rank} · очень частое`
  if (rank <= 1000) return `частота ${rank} · частое`
  if (rank <= 2501) return `частота ${rank}`
  return `частота ${rank}`
}
