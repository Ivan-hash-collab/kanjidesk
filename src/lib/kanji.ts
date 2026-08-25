import type { KanjiDict, KanjiInfo } from '../types'

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/g

let cache: KanjiDict | null = null

export async function loadDict(): Promise<KanjiDict> {
  if (cache) return cache
  const res = await fetch('./data/kanji.json')
  if (!res.ok) throw new Error('Не удалось загрузить словарь кандзи')
  cache = (await res.json()) as KanjiDict
  return cache
}

export function uniqueKanji(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const m = text.match(CJK_RE)
  if (!m) return out
  for (const ch of m) {
    if (!seen.has(ch)) {
      seen.add(ch)
      out.push(ch)
    }
  }
  return out
}

export function infoOf(dict: KanjiDict, ch: string): KanjiInfo | null {
  return dict[ch] ?? null
}

export function meaningLine(info: KanjiInfo | null, max = 3): string {
  if (!info || !info.meanings.length) return 'нет в словаре'
  return info.meanings.slice(0, max).join(', ')
}

export function readingLine(info: KanjiInfo | null): string {
  if (!info) return '—'
  const on = info.on.join(' · ')
  const kun = info.kun.join(' · ')
  if (on && kun) return `${on} ／ ${kun}`
  return on || kun || '—'
}

const SMALL_KANA = new Set('ゃゅょャュョぁぃぅぇぉァィゥェォ')

export function firstMora(s: string): string {
  const t = s.replace(/[-.．。\s]/g, '')
  if (!t) return ''
  if (t.length >= 2 && SMALL_KANA.has(t[1])) return t.slice(0, 2)
  return t.slice(0, 1)
}

export function readingHintText(info: KanjiInfo | null, kind?: string): string {
  if (!info) return ''
  if (kind === 'k2on' || kind === 'k2kun' || kind === 'k2r') return firstMora(info.on[0] || info.kun[0] || '')
  return firstMora(info.kun[0] || info.on[0] || '')
}

export function stripReading(s: string): string {
  return s.replace(/[-.．。ー\s]/g, '').toLowerCase()
}

export function allReadings(info: KanjiInfo | null): string[] {
  if (!info) return []
  return [...info.on, ...info.kun]
}

export function readingMatch(input: string, info: KanjiInfo | null): boolean {
  const got = stripReading(input)
  if (!got || !info) return false
  return allReadings(info).some((r) => stripReading(r) === got)
}

export function meaningMatch(input: string, info: KanjiInfo | null): boolean {
  const got = input.trim().toLowerCase()
  if (!got || !info) return false
  return info.meanings.some((m) => m.toLowerCase() === got || m.toLowerCase().includes(got))
}

export function jlptLabel(n: number | null | undefined): string {
  if (!n) return ''
  return `N${n}`
}

export function gradeLabel(g: number | null | undefined): string {
  if (!g) return ''
  if (g >= 1 && g <= 6) return `小学校 · ${g} год`
  if (g === 8) return 'средняя школа · 常用'
  if (g === 9 || g === 10) return '人名用'
  return `grade ${g}`
}

export function gradeBadge(g: number | null | undefined): string {
  if (!g) return ''
  if (g >= 1 && g <= 6) return `小${g}`
  if (g === 8) return '中'
  if (g === 9 || g === 10) return '名'
  return String(g)
}

export function listByJlpt(dict: KanjiDict, level: number): string[] {
  return Object.keys(dict)
    .filter((ch) => dict[ch].jlpt === level)
    .sort((a, b) => (dict[a].freq ?? 99999) - (dict[b].freq ?? 99999))
}

export function listByGrade(dict: KanjiDict, grade: number): string[] {
  return Object.keys(dict)
    .filter((ch) => dict[ch].grade === grade)
    .sort((a, b) => (dict[a].strokes ?? 99) - (dict[b].strokes ?? 99))
}

export function listByFreq(dict: KanjiDict, max = 250): string[] {
  return Object.keys(dict)
    .filter((ch) => typeof dict[ch].freq === 'number' && (dict[ch].freq ?? 0) > 0)
    .sort((a, b) => (dict[a].freq ?? 99999) - (dict[b].freq ?? 99999))
    .slice(0, max)
}

export function listNoJlpt(dict: KanjiDict, kind: 'joyo' | 'jinmei'): string[] {
  return Object.keys(dict)
    .filter((ch) => {
      const info = dict[ch]
      if (info.jlpt) return false
      if (kind === 'jinmei') return info.grade === 9 || info.grade === 10
      return (info.grade ?? 0) >= 1 && (info.grade ?? 0) <= 8
    })
    .sort((a, b) => (dict[a].freq ?? 99999) - (dict[b].freq ?? 99999))
}

export function searchDict(dict: KanjiDict, q: string, limit = 80): string[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const chars = uniqueKanji(query)
  if (chars.length && query === chars.join('')) return chars
  const out: string[] = []
  for (const [ch, info] of Object.entries(dict)) {
    if (ch === query) {
      out.unshift(ch)
      continue
    }
    if (info.on.some((r) => r.replace(/\./g, '') === query)) {
      out.push(ch)
      continue
    }
    if (info.kun.some((r) => r.replace(/\./g, '').includes(query))) {
      out.push(ch)
      continue
    }
    if (info.meanings.some((m) => m.toLowerCase().includes(query))) {
      out.push(ch)
    }
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

export function quizChoices(
  dict: KanjiDict,
  char: string,
  kind: 'meaning' | 'on' | 'kun',
): { prompt: string; answer: string; options: string[] } | null {
  const info = dict[char]
  if (!info) return null
  let answer = ''
  let prompt = ''
  if (kind === 'meaning') {
    if (!info.meanings.length) return null
    answer = info.meanings[0]
    prompt = 'значение'
  } else if (kind === 'on') {
    if (!info.on.length) return null
    answer = info.on[0]
    prompt = 'он-чтение'
  } else {
    if (!info.kun.length) return null
    answer = info.kun[0]
    prompt = 'кун-чтение'
  }

  const pool = Object.keys(dict).filter((c) => {
    if (c === char) return false
    const o = dict[c]
    if (kind === 'meaning') return o.meanings.length > 0
    if (kind === 'on') return o.on.length > 0
    return o.kun.length > 0
  })
  const same = pool.filter((c) => dict[c].jlpt && dict[c].jlpt === info.jlpt)
  const pickFrom = same.length >= 8 ? same : pool
  const distractors: string[] = []
  for (const c of shuffle(pickFrom)) {
    const o = dict[c]
    const val =
      kind === 'meaning' ? o.meanings[0] : kind === 'on' ? o.on[0] : o.kun[0]
    if (val && val !== answer && !distractors.includes(val)) distractors.push(val)
    if (distractors.length === 3) break
  }
  while (distractors.length < 3) distractors.push('—')
  return { prompt, answer, options: shuffle([answer, ...distractors]) }
}
