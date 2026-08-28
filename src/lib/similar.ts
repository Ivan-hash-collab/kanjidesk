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
 * Canonical radical keys used by that character. A kanji that *is* a radical
 * (e.g. 丨) will list a half/full-width lookalike (｜), so we gather all of its
 * own radical keys plus the char itself.
 */
async function radicalKeys(ch: string): Promise<string[]> {
  const own = rads?.[ch] ?? []
  return [...new Set([ch, ...own])]
}

/** Kanji that contain a given radical, e.g. 月 → 明, 期, 朝, … */
export async function kanjiWithRadical(rad: string, limit = 60): Promise<string[]> {
  await ensureRadicals()
  const keys = await radicalKeys(rad)
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

/** How many kanji contain `rad` (across all its radical spellings). */
export async function radicalCount(rad: string): Promise<number> {
  await ensureRadicals()
  const keys = await radicalKeys(rad)
  const seen = new Set<string>()
  for (const key of keys) {
    for (const other of byRadical?.get(key) ?? []) seen.add(other)
  }
  return seen.size
}

/** True if `ch` is used as a radical by other kanji. */
export async function isRadical(ch: string): Promise<boolean> {
  await ensureRadicals()
  const keys = await radicalKeys(ch)
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
