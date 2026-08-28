const KEY = 'kanjidesk.kanjiMeanings'
export const KANJI_META_EVENT = 'kanjidesk-kanjimeanings'

let cache: Record<string, string[]> | null = null

function read(): Record<string, string[]> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
  } catch {
    cache = {}
  }
  return cache
}

function write() {
  localStorage.setItem(KEY, JSON.stringify(read()))
  window.dispatchEvent(new Event(KANJI_META_EVENT))
}

export function customKanjiMeanings(ch: string): string[] | null {
  const m = read()[ch]
  return m?.length ? m : null
}

export function setKanjiMeanings(ch: string, meanings: string[]): void {
  const store = read()
  if (meanings.length) store[ch] = meanings
  else delete store[ch]
  write()
}

export function effectiveKanjiMeanings(ch: string, fallback: string[]): string[] {
  return customKanjiMeanings(ch) ?? fallback
}
