import { loadJson } from './gzipJson'

let rads: Record<string, string[]> | null = null
let byRadical: Map<string, string[]> | null = null
let loading: Promise<void> | null = null

async function ensure() {
  if (rads && byRadical) return
  if (!loading) {
    loading = loadJson<Record<string, string[]>>('./data/radicals.json')
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
  await loading
}

/** Radicals of a kanji, e.g. 月 → ['月']; 明 → ['日','月']. */
export async function radicalsOf(ch: string): Promise<string[]> {
  await ensure()
  return rads?.[ch] ?? []
}

/** Kanji that share at least one radical (excluding the character itself). */
export async function similarByRadical(ch: string, limit = 40): Promise<string[]> {
  await ensure()
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

/** Kanji that contain a given radical, e.g. 月 → 明, 期, 朝, … */
export async function kanjiWithRadical(rad: string, limit = 60): Promise<string[]> {
  await ensure()
  return (byRadical?.get(rad) ?? []).slice(0, limit)
}
