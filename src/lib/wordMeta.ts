const KEY = 'kanjidesk.wordMeta'
export const WORD_META_EVENT = 'kanjidesk-wordmeta'

type WordMeta = {
  /** User-authored meanings in priority order. Empty = use dictionary. */
  meanings?: string[]
  /** Keep dictionary meanings but this custom order (ids of dict meanings). */
  enabled?: boolean
}

let cache: Record<string, WordMeta> | null = null

function read(): Record<string, WordMeta> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, WordMeta>) : {}
  } catch {
    cache = {}
  }
  return cache
}

function write() {
  localStorage.setItem(KEY, JSON.stringify(read()))
  window.dispatchEvent(new Event(WORD_META_EVENT))
}

function idOf(written: string, kana: string): string {
  return kana ? `${written}|${kana}` : written
}

export function customMeanings(written: string, kana: string): string[] | null {
  const m = read()[idOf(written, kana)]
  return m?.meanings?.length ? m.meanings : null
}

export function setMeanings(written: string, kana: string, meanings: string[]): void {
  const store = read()
  const id = idOf(written, kana)
  if (meanings.length) store[id] = { ...store[id], meanings }
  else delete store[id]
  write()
}

export function enabledOf(written: string, kana: string): boolean {
  return read()[idOf(written, kana)]?.enabled ?? false
}

export function setEnabled(written: string, kana: string, enabled: boolean): void {
  const store = read()
  const id = idOf(written, kana)
  if (enabled) store[id] = { ...store[id], enabled }
  else if (store[id]) {
    delete store[id].enabled
    if (!store[id].meanings?.length) delete store[id]
  }
  write()
}

export function effectiveMeanings(written: string, kana: string, fallback: string[]): string[] {
  const custom = customMeanings(written, kana)
  return custom ?? fallback
}
