import { QUIZ_IDS, type CustomList, type QuizId, type QuizSettings, type SessionReport, type Settings, type Stats } from '../types'
import { nearestGradeValue } from './quality'
import { STORAGE_KEYS } from './storageKeys'

const SETTINGS_KEY = STORAGE_KEYS.settings
const STATS_KEY = STORAGE_KEYS.stats
const LISTS_KEY = STORAGE_KEYS.lists
const LAST_KEY = STORAGE_KEYS.lastSession
const HIST_KEY = STORAGE_KEYS.sessionHistory
const NOTES_KEY = STORAGE_KEYS.legacyNotes
const META_KEY = STORAGE_KEYS.kanjiMeta

export const defaultQuiz = (): QuizSettings => ({
  autoNext: true,
  repeatWrong: true,
  hideAnswers: false,
  readingHint: false,
  disableTimeouts: false,
  hypermode: false,
  strictness: 45,
  hintAfter: 2,
  skipAfterMisses: 0,
  acceptBackwards: true,
  showOutline: false,
  penWidth: 12,
  passQuality: 55,
})

function allQuiz(base?: Partial<QuizSettings>): Record<QuizId, QuizSettings> {
  const q = { ...defaultQuiz(), ...base }
  return {
    browse: { ...q, hideAnswers: false, hypermode: false },
    practice: { ...q },
    draw: { ...q },
    mcq: { ...q, hideAnswers: false },
  }
}

export const defaultSettings: Settings = {
  dark: false,
  speech: true,
  furi: 'hover',
  showGloss: true,
  quiz: allQuiz(),
  ...defaultQuiz(),
}

export function isQuizId(m: string): m is QuizId {
  return (QUIZ_IDS as readonly string[]).includes(m)
}

export function quizOf(s: Settings, mode: string): QuizSettings {
  const id: QuizId = isQuizId(mode) ? mode : 'practice'
  return s.quiz?.[id] ?? defaultQuiz()
}

export function withQuiz(s: Settings, mode: string): Settings {
  return { ...s, ...quizOf(s, mode) }
}

export function patchQuiz(s: Settings, mode: string, p: Partial<QuizSettings>): Settings {
  const id: QuizId = isQuizId(mode) ? mode : 'practice'
  const next = { ...quizOf(s, id), ...p }
  return { ...s, quiz: { ...s.quiz, [id]: next } }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

function readJsonValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type StoredSettings = Partial<Omit<Settings, 'quiz'>> & {
  leniency?: number
  quiz?: Partial<Record<QuizId, Partial<QuizSettings>>>
}

export function normalizeSettings(value: unknown): Settings {
  const raw: StoredSettings = isRecord(value) ? (value as StoredSettings) : {}
  const strictness =
    typeof raw.strictness === 'number'
      ? raw.strictness
      : typeof raw.leniency === 'number'
        ? Math.round(((1.8 - raw.leniency) / 1.4) * 100)
        : 45
  const flat: QuizSettings = {
    ...defaultQuiz(),
    autoNext: raw.autoNext ?? true,
    repeatWrong: raw.repeatWrong ?? true,
    hideAnswers: Boolean(raw.hideAnswers),
    readingHint: Boolean(raw.readingHint),
    disableTimeouts: Boolean(raw.disableTimeouts),
    hypermode: Boolean(raw.hypermode),
    hintAfter: raw.hintAfter ?? 2,
    skipAfterMisses: raw.skipAfterMisses ?? 0,
    acceptBackwards: raw.acceptBackwards !== false,
    showOutline: Boolean(raw.showOutline),
    penWidth: Math.min(24, Math.max(4, raw.penWidth ?? 12)),
    passQuality: nearestGradeValue(raw.passQuality ?? 55, 'passQuality'),
    strictness: nearestGradeValue(strictness, 'strictness'),
  }
  const quiz = allQuiz(flat)
  if (raw.quiz) {
    for (const id of QUIZ_IDS) {
      quiz[id] = { ...quiz[id], ...(raw.quiz[id] ?? {}) }
      quiz[id].penWidth = Math.min(24, Math.max(4, quiz[id].penWidth ?? 12))
      quiz[id].strictness = nearestGradeValue(quiz[id].strictness, 'strictness')
      quiz[id].passQuality = nearestGradeValue(quiz[id].passQuality ?? 55, 'passQuality')
    }
  }
  return {
    ...defaultSettings,
    ...raw,
    ...flat,
    quiz,
    furi: raw.furi === 'off' || raw.furi === 'on' || raw.furi === 'hover' ? raw.furi : 'hover',
    showGloss: raw.showGloss !== false,
    speech: raw.speech !== false,
  }
}

export function loadSettings(): Settings {
  return normalizeSettings(readJsonValue(SETTINGS_KEY))
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function loadNotes(): Record<string, string> {
  const meta = loadKanjiMeta()
  const out: Record<string, string> = {}
  for (const [ch, row] of Object.entries(meta)) {
    if (row.note) out[ch] = row.note
  }
  return out
}

export type KanjiMeta = { note: string; mnemonic: string }

export function loadKanjiMeta(): Record<string, KanjiMeta> {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Partial<KanjiMeta>>
      const out: Record<string, KanjiMeta> = {}
      for (const [ch, row] of Object.entries(parsed || {})) {
        out[ch] = { note: row?.note ?? '', mnemonic: row?.mnemonic ?? '' }
      }
      return out
    }
  } catch {
    /* migrate */
  }
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    const notes = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    const out: Record<string, KanjiMeta> = {}
    for (const [ch, note] of Object.entries(notes || {})) {
      out[ch] = { note, mnemonic: '' }
    }
    if (Object.keys(out).length) saveKanjiMeta(out)
    return out
  } catch {
    return {}
  }
}

function saveKanjiMeta(meta: Record<string, KanjiMeta>) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function saveKanjiMetaClear(): void {
  localStorage.removeItem(NOTES_KEY)
  localStorage.removeItem(META_KEY)
}

function patchMeta(ch: string, patch: Partial<KanjiMeta>): Record<string, KanjiMeta> {
  const all = loadKanjiMeta()
  const cur = all[ch] || { note: '', mnemonic: '' }
  const next = { ...cur, ...patch }
  if (!next.note.trim() && !next.mnemonic.trim()) delete all[ch]
  else all[ch] = { note: next.note, mnemonic: next.mnemonic }
  saveKanjiMeta(all)
  return all
}

export function saveNotes(notes: Record<string, string>): void {
  const all = loadKanjiMeta()
  for (const [ch, note] of Object.entries(notes)) {
    const cur = all[ch] || { note: '', mnemonic: '' }
    all[ch] = { ...cur, note }
  }
  saveKanjiMeta(all)
}

export function noteOf(ch: string): string {
  return loadKanjiMeta()[ch]?.note ?? ''
}

export function mnemonicOf(ch: string): string {
  return loadKanjiMeta()[ch]?.mnemonic ?? ''
}

export function saveNote(ch: string, text: string): Record<string, KanjiMeta> {
  return patchMeta(ch, { note: text.trim() })
}

export function saveMnemonic(ch: string, text: string): Record<string, KanjiMeta> {
  return patchMeta(ch, { mnemonic: text.trim() })
}

export function mergeNotes(incoming: Record<string, string>, keepExisting: boolean): number {
  const all = loadKanjiMeta()
  let n = 0
  for (const [ch, text] of Object.entries(incoming)) {
    const t = text.trim()
    if (!ch || !t) continue
    if (keepExisting && all[ch]?.note) continue
    all[ch] = { note: t, mnemonic: all[ch]?.mnemonic ?? '' }
    n += 1
  }
  saveKanjiMeta(all)
  return n
}

export function mergeMnemonics(incoming: Record<string, string>, keepExisting: boolean): number {
  const all = loadKanjiMeta()
  let n = 0
  for (const [ch, text] of Object.entries(incoming)) {
    const t = text.trim()
    if (!ch || !t) continue
    if (keepExisting && all[ch]?.mnemonic) continue
    all[ch] = { note: all[ch]?.note ?? '', mnemonic: t }
    n += 1
  }
  saveKanjiMeta(all)
  return n
}

export function appendNote(ch: string, chunk: string): string {
  const add = chunk.trim()
  if (!ch || !add) return noteOf(ch)
  const prev = noteOf(ch)
  const next = prev ? `${prev.trim()}\n\n${add}` : add
  saveNote(ch, next)
  return next
}

function yesterday(): string {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return dayKey(y)
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function today(): string {
  return dayKey(new Date())
}

export function localDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return dayKey(d)
}

export function loadStats(): Stats {
  const s = readJson<Stats>(STATS_KEY, {
    streak: 0,
    lastDay: '',
    writtenToday: [],
    writesTotal: 0,
  })
  const t = today()
  if (s.lastDay && s.lastDay !== t && s.lastDay !== yesterday()) {
    s.streak = 0
  }
  if (s.lastDay !== t) {
    s.writtenToday = []
  }
  return s
}

export function markWritten(char: string): Stats {
  const s = loadStats()
  const t = today()
  if (s.lastDay !== t) {
    s.streak = s.lastDay === yesterday() ? s.streak + 1 : 1
    s.lastDay = t
    s.writtenToday = []
  }
  if (!s.writtenToday.includes(char)) s.writtenToday.push(char)
  s.writesTotal += 1
  localStorage.setItem(STATS_KEY, JSON.stringify(s))
  return s
}

export function loadLists(): CustomList[] {
  try {
    const raw = localStorage.getItem(LISTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<Partial<CustomList> & { name: string; chars?: string[] }>
    return parsed.map((row, i) => ({
      id: row.id || String(i + 1),
      name: row.name,
      kind: row.kind === 'folder' ? 'folder' : 'list',
      parentId: row.parentId ?? null,
      chars: Array.isArray(row.chars) ? row.chars : [],
    }))
  } catch {
    return []
  }
}

export function saveLists(lists: CustomList[]): void {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists))
}

export function loadLastSession(): string[] {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveLastSession(chars: string[]): void {
  localStorage.setItem(LAST_KEY, JSON.stringify(chars))
}

export function loadHistory(): SessionReport[] {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    return raw ? (JSON.parse(raw) as SessionReport[]) : []
  } catch {
    return []
  }
}

export function saveSessionReport(rep: SessionReport): SessionReport[] {
  const next = [rep, ...loadHistory()].slice(0, 40)
  localStorage.setItem(HIST_KEY, JSON.stringify(next))
  notifyHistory()
  return next
}

export const HISTORY_EVENT = 'kanjidesk-history'
export const META_EVENT = 'kanjidesk-meta'

export function notifyHistory(): void {
  window.dispatchEvent(new Event(HISTORY_EVENT))
}

export function notifyMeta(): void {
  window.dispatchEvent(new Event(META_EVENT))
}

export function clearHistory(): void {
  localStorage.removeItem(HIST_KEY)
  notifyHistory()
}

export type ResetScope = 'settings' | 'lists' | 'progress' | 'notes' | 'all' | 'history'

export function factoryReset(scope: ResetScope): void {
  if (scope === 'settings' || scope === 'all') localStorage.removeItem(SETTINGS_KEY)
  if (scope === 'lists' || scope === 'all') localStorage.removeItem(LISTS_KEY)
  if (scope === 'notes' || scope === 'all') {
    localStorage.removeItem(NOTES_KEY)
    localStorage.removeItem(META_KEY)
    notifyMeta()
  }
  if (scope === 'history') {
    clearHistory()
    return
  }
  if (scope === 'progress' || scope === 'all') {
    localStorage.removeItem(STATS_KEY)
    localStorage.removeItem(HIST_KEY)
    localStorage.removeItem(LAST_KEY)
    localStorage.removeItem(STORAGE_KEYS.memoIds)
    notifyHistory()
  }
  if (scope === 'all' && 'indexedDB' in window) {
    indexedDB.deleteDatabase('kanjidesk-strokes')
  }
}
