import {
  allReadings,
  infoOf,
  shuffle,
} from './kanji'
import type { KanjiDict } from '../types'

export type McqKind = 'k2m' | 'm2k' | 'k2r' | 'r2k'

export type Question = {
  char: string
  kind: McqKind
  title: string
  prompt: string
  promptIsKanji: boolean
  answer: string
  options: string[]
  optionsAreKanji: boolean
}

function pickDistractorChars(dict: KanjiDict, session: string[], answer: string, n: number): string[] {
  const fromSession = shuffle(session.filter((c) => c !== answer && dict[c]))
  const out: string[] = []
  for (const c of fromSession) {
    if (!out.includes(c)) out.push(c)
    if (out.length === n) return out
  }
  const info = dict[answer]
  const rest = Object.keys(dict).filter((c) => c !== answer && !out.includes(c))
  const ranked = shuffle(
    rest.filter((c) => dict[c].jlpt && dict[c].jlpt === info?.jlpt),
  ).concat(shuffle(rest))
  for (const c of ranked) {
    if (!out.includes(c)) out.push(c)
    if (out.length === n) break
  }
  return out.slice(0, n)
}

function pickText(banned: string, extras: string[]): string[] {
  const out: string[] = []
  for (const v of shuffle(extras)) {
    if (v && v !== banned && !out.includes(v)) out.push(v)
    if (out.length === 3) break
  }
  while (out.length < 3) out.push('—')
  return out
}

function readingsOf(info: { on: string[]; kun: string[] }): string[] {
  return [...info.on, ...info.kun].filter(Boolean)
}

export function buildMcq(
  dict: KanjiDict,
  session: string[],
  kinds: McqKind[],
  limit: number,
  doShuffle: boolean,
): Question[] {
  const chars = doShuffle ? shuffle(session) : session.slice()
  const take = limit > 0 ? chars.slice(0, limit) : chars
  const q: Question[] = []
  for (const char of take) {
    const info = infoOf(dict, char)
    if (!info) continue
    for (const kind of kinds) {
      const others = pickDistractorChars(dict, take, char, 8)
      if (kind === 'k2m') {
        if (!info.meanings.length) continue
        const answer = info.meanings[0]
        const extras = others.flatMap((c) => dict[c]?.meanings.slice(0, 1) ?? [])
        q.push({
          char,
          kind,
          title: 'Кандзи → значение',
          prompt: char,
          promptIsKanji: true,
          answer,
          options: shuffle([answer, ...pickText(answer, extras)]),
          optionsAreKanji: false,
        })
      } else if (kind === 'm2k') {
        if (!info.meanings.length) continue
        q.push({
          char,
          kind,
          title: 'Значение → кандзи',
          prompt: info.meanings[0],
          promptIsKanji: false,
          answer: char,
          options: shuffle([char, ...pickDistractorChars(dict, take, char, 3)]),
          optionsAreKanji: true,
        })
      } else if (kind === 'k2r') {
        const reads = readingsOf(info)
        if (!reads.length) continue
        const answer = reads[0]
        const extras = others.flatMap((c) => readingsOf(dict[c] ?? { on: [], kun: [] }).slice(0, 1))
        q.push({
          char,
          kind,
          title: 'Кандзи → чтение',
          prompt: char,
          promptIsKanji: true,
          answer,
          options: shuffle([answer, ...pickText(answer, extras)]),
          optionsAreKanji: false,
        })
      } else {
        const reading = allReadings(info)[0]
        if (!reading) continue
        q.push({
          char,
          kind,
          title: 'Чтение → кандзи',
          prompt: reading,
          promptIsKanji: false,
          answer: char,
          options: shuffle([char, ...pickDistractorChars(dict, take, char, 3)]),
          optionsAreKanji: true,
        })
      }
    }
  }
  return doShuffle ? shuffle(q) : q
}

export type JudgeKind = 'k2m' | 'k2r' | 'm2k' | 'r2k' | 'mixed'

export type JudgeItem = {
  char: string
  kind: Exclude<JudgeKind, 'mixed'>
  title: string
  prompt: string
  promptIsKanji: boolean
  reveal: string
}

export function buildJudge(
  dict: KanjiDict,
  session: string[],
  kind: JudgeKind,
  limit: number,
  doShuffle: boolean,
): JudgeItem[] {
  const chars = doShuffle ? shuffle(session) : session.slice()
  const take = limit > 0 ? chars.slice(0, limit) : chars
  const cycle: Exclude<JudgeKind, 'mixed'>[] = ['k2m', 'k2r', 'm2k', 'r2k']
  const out: JudgeItem[] = []
  let i = 0
  for (const char of take) {
    const info = infoOf(dict, char)
    if (!info) continue
    const k = kind === 'mixed' ? cycle[i % cycle.length] : kind
    i += 1
    if (k === 'k2m' && info.meanings.length) {
      out.push({
        char,
        kind: k,
        title: 'Кандзи → значение',
        prompt: char,
        promptIsKanji: true,
        reveal: info.meanings.join(' · '),
      })
    } else if (k === 'k2r' && allReadings(info).length) {
      out.push({
        char,
        kind: k,
        title: 'Кандзи → чтение',
        prompt: char,
        promptIsKanji: true,
        reveal: `${info.on.join(' · ') || '—'} ／ ${info.kun.join(' · ') || '—'}`,
      })
    } else if (k === 'm2k' && info.meanings.length) {
      out.push({
        char,
        kind: k,
        title: 'Значение → кандзи',
        prompt: info.meanings.slice(0, 2).join(', '),
        promptIsKanji: false,
        reveal: char,
      })
    } else if (k === 'r2k' && allReadings(info).length) {
      out.push({
        char,
        kind: k,
        title: 'Чтение → кандзи',
        prompt: allReadings(info)[0],
        promptIsKanji: false,
        reveal: char,
      })
    }
  }
  return out
}
