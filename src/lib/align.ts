import type { KanjiDict, KanjiInfo } from '../types'
import { uniqueKanji } from './kanji'
import { matchWordToKun } from './deinflect'
import { normRead } from './lexicon'

const VOICE: Record<string, string> = {
  か: 'が',
  き: 'ぎ',
  く: 'ぐ',
  け: 'げ',
  こ: 'ご',
  さ: 'ざ',
  し: 'じ',
  す: 'ず',
  せ: 'ぜ',
  そ: 'ぞ',
  た: 'だ',
  ち: 'ぢ',
  つ: 'づ',
  て: 'で',
  と: 'ど',
  は: 'ば',
  ひ: 'び',
  ふ: 'ぶ',
  へ: 'べ',
  ほ: 'ぼ',
}

const HALF: Record<string, string> = {
  は: 'ぱ',
  ひ: 'ぴ',
  ふ: 'ぷ',
  へ: 'ぺ',
  ほ: 'ぽ',
}

export function toHira(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCharCode(c - 0x60)
      return ch
    })
    .join('')
}

function expandReadings(info: KanjiInfo | null): string[] {
  if (!info) return []
  const raw: string[] = []
  for (const r of info.on) raw.push(toHira(normRead(r)))
  for (const r of info.kun) {
    const n = toHira(normRead(r))
    if (n) raw.push(n)
    const stem = toHira(normRead((r.split(/[.\-．]/)[0] || '').replace(/[-.]/g, '')))
    if (stem) raw.push(stem)
  }
  const out = new Set<string>()
  for (const r of raw) {
    if (!r) continue
    out.add(r)
    const head = r[0]
    if (head && VOICE[head]) out.add(VOICE[head] + r.slice(1))
    if (head && HALF[head]) out.add(HALF[head] + r.slice(1))
  }
  return [...out].sort((a, b) => b.length - a.length)
}

const KANA = /[\u3040-\u30FFー]/

function alignWord(written: string, kana: string, dict: KanjiDict): string[] | null {
  const chars = [...written]
  const memo = new Map<string, string[] | null>()

  function rec(wi: number, ki: number): string[] | null {
    const key = `${wi}:${ki}`
    if (memo.has(key)) return memo.get(key) ?? null
    if (wi === chars.length) {
      const ok = ki === kana.length ? [] : null
      memo.set(key, ok)
      return ok
    }
    if (ki > kana.length) {
      memo.set(key, null)
      return null
    }
    const c = chars[wi] ?? ''
    if (KANA.test(c)) {
      if (c === 'ー') {
        if (ki >= kana.length) {
          memo.set(key, null)
          return null
        }
        const rest = rec(wi + 1, ki + 1)
        const ans = rest ? [kana[ki] ?? '', ...rest] : null
        memo.set(key, ans)
        return ans
      }
      const h = toHira(c)
      if (kana.startsWith(h, ki)) {
        const rest = rec(wi + 1, ki + h.length)
        const ans = rest ? [h, ...rest] : null
        memo.set(key, ans)
        return ans
      }
      memo.set(key, null)
      return null
    }
    if (c === '々' && wi > 0) {
      const prev = dict[chars[wi - 1] ?? '']
      for (const r of expandReadings(prev)) {
        const voiced = VOICE[r[0] ?? ''] ? VOICE[r[0] ?? ''] + r.slice(1) : r
        for (const cand of [r, voiced]) {
          if (!kana.startsWith(cand, ki)) continue
          const rest = rec(wi + 1, ki + cand.length)
          if (rest) {
            const ans = [cand, ...rest]
            memo.set(key, ans)
            return ans
          }
        }
      }
    }
    const reads = expandReadings(dict[c] ?? null)
    for (const r of reads) {
      if (!kana.startsWith(r, ki)) continue
      const rest = rec(wi + 1, ki + r.length)
      if (rest) {
        const ans = [r, ...rest]
        memo.set(key, ans)
        return ans
      }
    }
    if (!dict[c]) {
      for (let n = 3; n >= 1; n--) {
        if (ki + n > kana.length) continue
        const rest = rec(wi + 1, ki + n)
        if (rest) {
          const ans = [kana.slice(ki, ki + n), ...rest]
          memo.set(key, ans)
          return ans
        }
      }
    }
    memo.set(key, null)
    return null
  }

  return rec(0, 0)
}

export function wordHasKanjiReading(
  written: string,
  kana: string,
  ch: string,
  reading: string,
  dict: KanjiDict,
): boolean {
  return matchKind(written, kana, ch, reading, dict) != null
}

export function matchKind(
  written: string,
  kana: string,
  ch: string,
  reading: string,
  dict: KanjiDict,
): 'exact' | 'stem' | null {
  if (!written.includes(ch)) return null
  const kun = matchWordToKun(written, kana, ch, reading, dict)
  if (kun) return kun
  const want = toHira(normRead(reading))
  if (!want) return null
  const k = toHira(normRead(kana))
  const stems = readingStems(ch, reading, dict)
  if (!k) return null
  if (uniqueKanji(written).length === 1) {
    if (stems.some((s) => k === s)) return 'exact'
    if (stems.some((s) => s.length >= 2 && k.startsWith(s))) return 'stem'
    return null
  }
  const aligned = alignWord(written, k, dict)
  if (!aligned) return null
  const hit = [...written].some((c, i) => c === ch && stems.includes(aligned[i] ?? ''))
  if (!hit) return null
  const used = [...written].flatMap((c, i) => (c === ch ? [aligned[i] ?? ''] : []))
  return used.some((u) => u === want || u === stems[0]) ? 'exact' : 'stem'
}

function readingStems(ch: string, reading: string, dict: KanjiDict): string[] {
  const want = toHira(normRead(reading))
  const out = new Set<string>()
  if (want) out.add(want)
  const info = dict[ch]
  if (info) {
    for (const r of [...info.on, ...info.kun]) {
      const full = toHira(normRead(r))
      const stem = toHira(normRead((r.split(/[.\-．]/)[0] || '')))
      if (full === want || stem === want || full.startsWith(want) || want.startsWith(full)) {
        if (full) out.add(full)
        if (stem) out.add(stem)
      }
    }
  }
  const fromDots = toHira(normRead((reading.split(/[.\-．]/)[0] || '')))
  if (fromDots) out.add(fromDots)
  return [...out].sort((a, b) => b.length - a.length)
}
