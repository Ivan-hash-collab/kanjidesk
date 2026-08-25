import { loadGzJson } from './gzipJson'

export type StrokeJson = {
  strokes: string[]
  medians: number[][][]
  radStrokes?: number[]
}

const mem = new Map<string, StrokeJson>()
let pack: Record<string, StrokeJson> | null = null
let packTried = false

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      resolve(null)
      return
    }
    const req = indexedDB.open('kanjidesk-strokes', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('s')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

async function idbGet(char: string): Promise<StrokeJson | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction('s', 'readonly')
    const req = tx.objectStore('s').get(char)
    req.onsuccess = () => resolve((req.result as StrokeJson) || null)
    req.onerror = () => resolve(null)
  })
}

async function idbSet(char: string, data: StrokeJson): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction('s', 'readwrite')
    tx.objectStore('s').put(data, char)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function preloadStrokes(): Promise<void> {
  await loadPack()
}

async function loadPack(): Promise<Record<string, StrokeJson>> {
  if (pack) return pack
  if (packTried) return pack ?? {}
  packTried = true
  try {
    pack = await loadGzJson<Record<string, StrokeJson>>('./data/strokes-ja.json.gz')
  } catch {
    pack = {}
  }
  return pack
}

async function fetchJson(url: string): Promise<StrokeJson | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as StrokeJson
  } catch {
    return null
  }
}

export async function loadStrokes(char: string): Promise<StrokeJson> {
  const hit = mem.get(char)
  if (hit) return hit
  const stored = await idbGet(char)
  if (stored?.strokes?.length) {
    mem.set(char, stored)
    return stored
  }
  const fromPack = (await loadPack())[char]
  if (fromPack?.strokes?.length) {
    mem.set(char, fromPack)
    void idbSet(char, fromPack)
    return fromPack
  }
  const encoded = encodeURIComponent(char)
  const remote =
    (await fetchJson(`https://cdn.jsdelivr.net/gh/mnako/hanzi-writer-data-ja@master/data/${encoded}.json`)) ||
    (await fetchJson(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encoded}.json`))
  if (remote?.strokes?.length) {
    mem.set(char, remote)
    void idbSet(char, remote)
    return remote
  }
  throw new Error('no-strokes')
}
