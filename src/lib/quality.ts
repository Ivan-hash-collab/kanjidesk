import type { ItemLog, QuizId, QuizSettings, Settings, WriteReport } from '../types'
import { patchQuiz, quizOf } from './storage'

export const GRADE_LEVELS = [
  { n: 1, label: 'Мягко', strictness: 12, passQuality: 35, recognize: 'Прощает кривые черты', pass: 'Зачёт почти за любую попытку' },
  { n: 2, label: 'Спокойно', strictness: 35, passQuality: 45, recognize: 'Слабый допуск, ещё удобно учиться', pass: 'Слабый порог, ошибки не страшны' },
  { n: 3, label: 'Норма', strictness: 45, passQuality: 55, recognize: 'Обычная проверка формы черты', pass: 'Обычный зачёт, около D' },
  { n: 4, label: 'Строго', strictness: 72, passQuality: 70, recognize: 'Нужны форма и направление', pass: 'Нужна аккуратность, около C' },
  { n: 5, label: 'Экзамен', strictness: 92, passQuality: 88, recognize: 'Почти совпасть с образцом', pass: 'Почти без ошибок, A/B' },
] as const

export type GradeKind = 'strictness' | 'passQuality'

export function nearestGradeValue(value: number, kind: GradeKind): number {
  const levels = GRADE_LEVELS.map((l) => l[kind])
  return levels.reduce((best, n) => (Math.abs(n - value) < Math.abs(best - value) ? n : best))
}

export function gradeLevelOf(value: number, kind: GradeKind) {
  const snapped = nearestGradeValue(value, kind)
  return GRADE_LEVELS.find((l) => l[kind] === snapped) ?? GRADE_LEVELS[2]
}

export function strokeParams(s: Settings | QuizSettings): {
  leniency: number
  distThreshold: number
  hintAfter: number | false
  skipAfter: number | false
} {
  const t = Math.min(100, Math.max(0, nearestGradeValue(s.strictness, 'strictness'))) / 100
  return {
    leniency: 1.8 - t * 1.4,
    distThreshold: Math.round(450 - t * 230),
    hintAfter: s.hintAfter <= 0 ? false : s.hintAfter,
    skipAfter: s.skipAfterMisses <= 0 ? false : s.skipAfterMisses,
  }
}

export function strictnessLabel(n: number): string {
  return gradeLevelOf(n, 'strictness').label.toLowerCase()
}

export function passLabel(n: number): string {
  const lv = gradeLevelOf(n, 'passQuality')
  return `${lv.n} · ${lv.label.toLowerCase()}`
}

export function writeQuality(r: Omit<WriteReport, 'quality' | 'char'> & { char?: string }): number {
  if (r.strokeCount <= 0) return r.totalMistakes === 0 ? 100 : 20
  const first = r.firstTry / r.strokeCount
  const miss = Math.min(2, r.totalMistakes / r.strokeCount)
  const back = r.backwards / r.strokeCount
  const hint = r.hintedStrokes * 7
  const per = r.timeMs / r.strokeCount
  const timePen = per > 3800 ? Math.min(18, (per - 3800) / 350) : 0
  const score = first * 62 + (1 - miss / 2) * 38 - back * 14 - hint - timePen
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function letterGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

export function stampOf(quality: number): { letter: string; ja: string; ru: string } {
  if (quality >= 90) return { letter: 'A', ja: '秀', ru: 'отлично' }
  if (quality >= 80) return { letter: 'B', ja: '優', ru: 'хорошо' }
  if (quality >= 70) return { letter: 'C', ja: '良', ru: 'норма' }
  if (quality >= 55) return { letter: 'D', ja: '可', ru: 'с трудом' }
  return { letter: 'F', ja: '不可', ru: 'не засчитано' }
}

export function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  return `${m} мин ${s % 60} с`
}

export type SessionStats = {
  n: number
  ok: number
  bad: number
  accuracy: number
  quality: number
  grade: string
  avgMs: number
  timeouts: number
  writes: number
  clean: number
  hinted: number
  backwards: number
  avgMistakes: number
  firstTryPct: number
  bands: Record<string, number>
  worst: { char: string; quality: number }[]
  best: { char: string; quality: number }[]
}

export function summarize(items: ItemLog[]): SessionStats {
  const n = items.length
  const ok = items.filter((x) => x.correct).length
  const writes = items.filter((x) => x.write)
  const q = n ? Math.round(items.reduce((a, x) => a + x.quality, 0) / n) : 0
  const bands: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const x of items) bands[letterGrade(x.quality)] += 1
  const byChar = new Map<string, number[]>()
  for (const x of items) {
    const arr = byChar.get(x.char) ?? []
    arr.push(x.quality)
    byChar.set(x.char, arr)
  }
  const ranked = [...byChar.entries()]
    .map(([char, qs]) => ({
      char,
      quality: Math.round(qs.reduce((a, b) => a + b, 0) / qs.length),
    }))
    .sort((a, b) => a.quality - b.quality)
  const w = writes.map((x) => x.write!)
  const strokeSum = w.reduce((a, x) => a + x.strokeCount, 0)
  const firstSum = w.reduce((a, x) => a + x.firstTry, 0)
  return {
    n,
    ok,
    bad: n - ok,
    accuracy: n ? Math.round((ok / n) * 100) : 0,
    quality: q,
    grade: letterGrade(q),
    avgMs: n ? Math.round(items.reduce((a, x) => a + x.timeMs, 0) / n) : 0,
    timeouts: items.filter((x) => x.timeout).length,
    writes: w.length,
    clean: w.filter((x) => x.totalMistakes === 0).length,
    hinted: w.filter((x) => x.hintedStrokes > 0).length,
    backwards: w.reduce((a, x) => a + x.backwards, 0),
    avgMistakes: w.length ? Math.round((w.reduce((a, x) => a + x.totalMistakes, 0) / w.length) * 10) / 10 : 0,
    firstTryPct: strokeSum ? Math.round((firstSum / strokeSum) * 100) : 0,
    bands,
    worst: ranked.slice(0, 8),
    best: ranked.slice(-5).reverse(),
  }
}

export function emptyWrite(char: string): WriteReport {
  return {
    char,
    totalMistakes: 0,
    backwards: 0,
    hintedStrokes: 0,
    strokeCount: 0,
    firstTry: 0,
    timeMs: 0,
    quality: 0,
  }
}

export function settingsSummary(s: Settings, writing: boolean, mode?: string): string {
  const q = mode ? quizOf(s, mode) : s
  const bits: string[] = []
  if (q.hypermode) bits.push('hypermode')
  bits.push(q.autoNext ? 'авто дальше' : 'ручной переход')
  if (q.repeatWrong) bits.push('повтор ошибок')
  if (s.speech) bits.push('озвучка')
  if (q.hideAnswers) bits.push('скрыть ответы')
  if (q.disableTimeouts) bits.push('без таймера')
  if (writing) {
    bits.push(`распознавание ${strictnessLabel(q.strictness)}`)
    bits.push(`зачёт ${passLabel(q.passQuality ?? 55)}`)
    bits.push(q.showOutline ? 'контур' : 'без контура')
    if (q.hintAfter > 0) bits.push(`подсказка с ${q.hintAfter}`)
  }
  return bits.join(', ')
}

export function applyHypermode(s: Settings, on: boolean, mode: QuizId = 'draw'): Settings {
  if (!on) return patchQuiz(s, mode, { hypermode: false })
  return patchQuiz(s, mode, {
    hypermode: true,
    autoNext: true,
    hintAfter: 0,
    strictness: 92,
    acceptBackwards: false,
    disableTimeouts: false,
    hideAnswers: true,
    passQuality: 70,
  })
}
