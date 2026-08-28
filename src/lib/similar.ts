import { loadJson } from './gzipJson'
import type { KanjiDict } from '../types'

let rads: Record<string, string[]> | null = null
let byRadical: Map<string, string[]> | null = null
let loadingRad: Promise<void> | null = null

async function ensureRadicals() {
  if (rads && byRadical) return
  if (!loadingRad) {
    loadingRad = loadJson<Record<string, string[]>>('./data/radicals.json')
      .catch(() => ({}))
      .then((r) => {
        rads = r
        const idx = new Map<string, string[]>()
        for (const [ch, list] of Object.entries(r)) {
          for (const rad of list) {
            const arr = idx.get(rad)
            if (arr) arr.push(ch)
            else idx.set(rad, [ch])
          }
        }
        byRadical = idx
      })
  }
  await loadingRad
}

/** Radicals of a kanji, e.g. 明 → ['日','月']. */
export async function radicalsOf(ch: string): Promise<string[]> {
  await ensureRadicals()
  return rads?.[ch] ?? []
}

/** Kanji that share at least one radical with `ch` (visual/simplified lookalikes). */
export async function similarVisual(ch: string, limit = 30): Promise<string[]> {
  await ensureRadicals()
  const mine = rads?.[ch] ?? []
  if (!mine.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const rad of mine) {
    for (const other of byRadical?.get(rad) ?? []) {
      if (other === ch || seen.has(other)) continue
      seen.add(other)
      out.push(other)
    }
  }
  return out.slice(0, limit)
}

/**
 * Keys by which `ch` is used as a radical BY OTHER kanji. A char is a radical
 * only when its own radical list names *itself* (麻, 石, 月…) — in which case
 * the key is `ch` — or when the list is a single half/full-width variant that
 * stands in for it (丨 → ｜). For an ordinary kanji like 磨 (whose list is a set
 * of unrelated parts) this is empty, so it is NOT a radical and its count is 0.
 */
async function ownRadicalKeys(ch: string): Promise<string[]> {
  const own = rads?.[ch] ?? []
  const keys = new Set<string>()
  if (own.includes(ch)) {
    keys.add(ch)
    return [...keys]
  }
  // Single-lookalike variant that represents the char, e.g. 丨's list is ['｜'].
  if (own.length === 1 && byRadical?.has(own[0])) {
    keys.add(own[0])
    return [...keys]
  }
  if (byRadical?.has(ch)) keys.add(ch)
  return [...keys]
}

/** Kanji that contain a given radical, e.g. 月 → 明, 期, 朝, … */
export async function kanjiWithRadical(rad: string, limit = 60): Promise<string[]> {
  await ensureRadicals()
  const keys = await ownRadicalKeys(rad)
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of keys) {
    for (const other of byRadical?.get(key) ?? []) {
      if (seen.has(other)) continue
      seen.add(other)
      out.push(other)
    }
  }
  return out.slice(0, limit)
}

/** How many kanji contain `rad` as their radical (0 for non-radicals). */
export async function radicalCount(rad: string): Promise<number> {
  await ensureRadicals()
  const keys = await ownRadicalKeys(rad)
  const seen = new Set<string>()
  for (const key of keys) {
    for (const other of byRadical?.get(key) ?? []) seen.add(other)
  }
  return seen.size
}

/** True only if `ch` is itself used as a radical by other kanji. */
export async function isRadical(ch: string): Promise<boolean> {
  await ensureRadicals()
  const keys = await ownRadicalKeys(ch)
  return keys.some((key) => (byRadical?.get(key) ?? []).length > 0)
}

/** Kanji whose English meanings overlap with `ch` (semantic neighbours). */
export function similarByMeaning(ch: string, dict: KanjiDict, limit = 18): string[] {
  const info = dict[ch]
  if (!info?.meanings?.length) return []
  const mine = new Set(info.meanings.map((m) => m.toLowerCase().trim()))
  if (!mine.size) return []
  const score: { ch: string; n: number }[] = []
  for (const [other, oi] of Object.entries(dict)) {
    if (other === ch || !oi?.meanings?.length) continue
    let n = 0
    for (const m of oi.meanings) {
      if (mine.has(m.toLowerCase().trim())) n += 1
    }
    if (n > 0) score.push({ ch: other, n })
  }
  score.sort((a, b) => b.n - a.n || (dict[a.ch]?.freq ?? 99999) - (dict[b.ch]?.freq ?? 99999))
  return score.slice(0, limit).map((x) => x.ch)
}
