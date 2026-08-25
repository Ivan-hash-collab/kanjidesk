import type { KanjiDict } from '../types'
import { uniqueKanji } from './kanji'
import { deinflect } from './morph'

function normRead(s: string): string {
  return s.replace(/[.\-\s'’]/g, '').replace(/ー/g, '')
}

function toHira(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCharCode(c - 0x60)
      return ch
    })
    .join('')
}

const KANA = /[\u3040-\u30FFー]/
const I_E = /[いきぎしじちぢにひびみりえけげせぜてでねへべめれ]$/

/** Godan row: dictionary ending → inflected row starts. */
const GODAN: Record<string, string[]> = {
  う: ['う', 'い', 'わ', 'っ', 'え', 'お'],
  く: ['く', 'き', 'か', 'け', 'こ'],
  ぐ: ['ぐ', 'ぎ', 'が', 'げ', 'ご'],
  す: ['す', 'し', 'さ', 'せ', 'そ'],
  つ: ['つ', 'ち', 'た', 'っ', 'て', 'と'],
  ぬ: ['ぬ', 'に', 'な', 'ね', 'の'],
  ぶ: ['ぶ', 'び', 'ば', 'べ', 'ぼ'],
  む: ['む', 'み', 'ま', 'め', 'も'],
  る: ['る', 'り', 'ら', 'っ', 'れ', 'ろ'],
}

const TE_TA: Record<string, [string, string]> = {
  う: ['って', 'った'],
  つ: ['って', 'った'],
  る: ['って', 'った'],
  く: ['いて', 'いた'],
  ぐ: ['いで', 'いだ'],
  す: ['して', 'した'],
  ぬ: ['んで', 'んだ'],
  ぶ: ['んで', 'んだ'],
  む: ['んで', 'んだ'],
}

const AUX = [
  '',
  'ます',
  'ました',
  'ません',
  'ませんでした',
  'ない',
  'なかった',
  'なくて',
  'ます',
  'たい',
  'たく',
  'たかった',
  'そう',
  'ながら',
  'たり',
  'たりする',
  'れる',
  'れる',
  'られる',
  'させる',
  'せる',
  'ば',
  'る',
  'こと',
  'もの',
  'よう',
  'ため',
  '方',
  '中',
]

export type KunRead = {
  stem: string
  okuri: string
  lemmaKana: string
}

export type ReadingHit = 'exact' | 'stem'

export function parseKunReading(reading: string): KunRead {
  const hira = toHira(reading.trim()).replace(/^-+/, '').replace(/-+$/g, '')
  const dot = hira.split(/[.\.．]/)
  const stem = toHira(normRead(dot[0] || ''))
  const okuri = toHira(normRead(dot.slice(1).join('') || ''))
  return { stem, okuri, lemmaKana: stem + okuri }
}

export function resolveKun(ch: string, reading: string, dict: KanjiDict): KunRead {
  const want = toHira(normRead(reading))
  const info = dict[ch]
  if (info) {
    for (const r of info.kun) {
      const full = toHira(normRead(r))
      if (full === want || toHira(r) === toHira(reading) || r === reading) {
        return parseKunReading(r.includes('.') || r.includes('．') ? r : reading.includes('.') ? reading : r)
      }
    }
    for (const r of info.kun) {
      const parsed = parseKunReading(r)
      if (parsed.lemmaKana === want || parsed.stem === want) return parsed
    }
  }
  if (/[.\.．]/.test(reading)) return parseKunReading(reading)
  return parseKunReading(reading)
}

function ichidan(okuri: string): boolean {
  if (!okuri.endsWith('る') || okuri.length < 2) return false
  return I_E.test(okuri.slice(0, -1))
}

function tailsFor(okuri: string): Set<string> {
  const out = new Set<string>()
  if (!okuri) {
    out.add('')
    return out
  }
  out.add(okuri)
  const last = okuri[okuri.length - 1] ?? ''
  const head = okuri.slice(0, -1)

  const add = (core: string) => {
    if (!core) return
    out.add(core)
    for (const a of AUX) out.add(core + a)
  }

  if (ichidan(okuri) || last === 'る' && ichidan(okuri)) {
    add(head)
    add(head + 'る')
    add(head + 'て')
    add(head + 'た')
    add(head + 'ない')
    add(head + 'ます')
    add(head + 'れば')
    add(head + 'よう')
    add(head + 'ろ')
    add(head + 'れ')
    add(head + 'られる')
    add(head + 'させる')
  } else if (GODAN[last]) {
    for (const row of GODAN[last] ?? []) add(head + row)
    const te = TE_TA[last]
    if (te) {
      add(head + te[0])
      add(head + te[1])
    }
    if (last === 'う') {
      add(head + 'なう')
      add(head + 'ない')
      add(head + 'なっ')
      add(head + 'なわ')
    }
  } else if (okuri.endsWith('い')) {
    const adj = okuri.slice(0, -1)
    add(okuri)
    add(adj + 'く')
    add(adj + 'け')
    add(adj + 'かっ')
    add(adj + 'から')
    add(adj + 'けれ')
    add(adj + 'さ')
  } else {
    add(okuri)
  }
  return out
}

let tailCache: Map<string, Set<string>> | null = null
function tails(okuri: string): Set<string> {
  if (!tailCache) tailCache = new Map()
  let set = tailCache.get(okuri)
  if (!set) {
    set = tailsFor(okuri)
    tailCache.set(okuri, set)
  }
  return set
}

function restMatchesOkuri(rest: string, okuri: string): boolean {
  if (!okuri) return rest.length === 0
  if (!rest) return false
  if (rest === okuri || rest.startsWith(okuri)) return true
  const set = tails(okuri)
  if (set.has(rest)) return true
  for (const t of set) {
    if (t && rest.startsWith(t)) return true
  }
  return false
}

export function kunLemma(ch: string, reading: string, dict: KanjiDict): { written: string; kana: string } | null {
  const k = resolveKun(ch, reading, dict)
  if (!k.stem) return null
  return {
    written: k.okuri ? ch + k.okuri : ch,
    kana: k.lemmaKana,
  }
}

export function matchWordToKun(
  written: string,
  kana: string,
  ch: string,
  reading: string,
  dict: KanjiDict,
): ReadingHit | null {
  if (!written.includes(ch)) return null
  const k = resolveKun(ch, reading, dict)
  if (!k.stem && !k.lemmaKana) return null
  const lemma = kunLemma(ch, reading, dict)
  const hira = toHira(normRead(kana))
  const one = uniqueKanji(written).length === 1

  if (lemma && written === lemma.written && (!hira || hira === lemma.kana)) return 'exact'
  if (hira && hira === k.lemmaKana) return 'exact'

  if (hira) {
    if (hira === k.stem && !k.okuri) return 'exact'
    if (hira.startsWith(k.stem)) {
      const rest = hira.slice(k.stem.length)
      if (rest === k.okuri) return 'exact'
      if (one && restMatchesOkuri(rest, k.okuri)) return rest === k.okuri ? 'exact' : 'stem'
      if (!one && restMatchesOkuri(rest, k.okuri)) return 'stem'
    }
  }

  if (one) {
    const after = written.startsWith(ch) ? written.slice(ch.length) : ''
    const okuriPart = (after.match(new RegExp(`^${KANA.source}+`)) || [''])[0]
    const okuriHira = toHira(okuriPart)
    if (lemma && written === lemma.written) return 'exact'
    if (k.okuri && restMatchesOkuri(okuriHira, k.okuri)) return okuriHira === k.okuri ? 'exact' : 'stem'
  }

  return null
}

/** Dictionary-form guesses for an inflected surface (見ていました → 見る). */
export function deinflectWritten(written: string): string[] {
  return deinflect(written)
}
