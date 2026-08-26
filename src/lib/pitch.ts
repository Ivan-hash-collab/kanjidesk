import { loadGzJson } from './gzipJson'
import { kataToHira } from './kana'

type PitchTable = Record<string, number[]>

let table: PitchTable | null = null
let tried = false

function key(written: string, kana: string): string {
  return `${written}|${kataToHira(kana).replace(/[.\-\s]/g, '')}`
}

export async function ensurePitch(): Promise<PitchTable> {
  if (table) return table
  if (tried) return {}
  tried = true
  try {
    table = await loadGzJson<PitchTable>('./data/pitch.json.gz')
  } catch {
    table = {}
  }
  return table
}

export function pitchOf(written: string, kana: string, ready: PitchTable | null = table): number[] | null {
  if (!ready) return null
  const k = kataToHira(kana || '').replace(/[.\-\s]/g, '')
  const hit =
    (written && k ? ready[key(written, k)] : undefined) ||
    (k ? ready[k] : undefined) ||
    (written ? ready[written] : undefined)
  return hit?.length ? hit : null
}
