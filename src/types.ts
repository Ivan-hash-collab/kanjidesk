export type KanjiInfo = {
  strokes: number | null
  grade: number | null
  freq: number | null
  jlpt: number | null
  meanings: string[]
  on: string[]
  kun: string[]
}

export type KanjiDict = Record<string, KanjiInfo>

export type StudyMode =
  | 'hub'
  | 'browse'
  | 'practice'
  | 'judge'
  | 'drill'
  | 'draw'
  | 'mcq'
  | 'selfcheck'

export type StudyIntent = {
  nonce: number
  mode: StudyMode
  autoStart: boolean
  fromResume?: boolean
}

export type FuriMode = 'off' | 'hover' | 'on'

export type ViewId = 'home' | 'study' | 'lists' | 'dict' | 'about' | 'memo'

export const QUIZ_IDS = ['browse', 'practice', 'draw', 'mcq'] as const
export type QuizId = (typeof QUIZ_IDS)[number]

export type QuizSettings = {
  autoNext: boolean
  repeatWrong: boolean
  hideAnswers: boolean
  readingHint: boolean
  disableTimeouts: boolean
  hypermode: boolean
  strictness: number
  hintAfter: number
  skipAfterMisses: number
  acceptBackwards: boolean
  showOutline: boolean
  penWidth: number
  passQuality: number
  speech: boolean
  showKanji: 'glyph' | 'blank' | 'reading'
}

export type SheetTab = 'settings' | 'help' | 'leave'

export type BusyInfo = {
  active: boolean
  writing: boolean
  label: string
}

export type Settings = {
  dark: boolean
  speech: boolean
  furi: FuriMode
  showGloss: boolean
  quiz: Record<QuizId, QuizSettings>
  autoNext: boolean
  repeatWrong: boolean
  hideAnswers: boolean
  readingHint: boolean
  disableTimeouts: boolean
  hypermode: boolean
  strictness: number
  hintAfter: number
  skipAfterMisses: number
  acceptBackwards: boolean
  showOutline: boolean
  penWidth: number
  passQuality: number
  showKanji: 'glyph' | 'blank' | 'reading'
}

export type WriteReport = {
  char: string
  totalMistakes: number
  backwards: number
  hintedStrokes: number
  strokeCount: number
  firstTry: number
  timeMs: number
  quality: number
  svg?: string
}

export type ItemLog = {
  char: string
  kind: string
  correct: boolean
  timeout: boolean
  timeMs: number
  quality: number
  picked?: string
  write?: WriteReport
}

export type SessionReport = {
  at: string
  mode: string
  title: string
  durationMs: number
  items: ItemLog[]
}

export type Stats = {
  streak: number
  lastDay: string
  writtenToday: string[]
  writesTotal: number
}

export type ListNode = {
  id: string
  name: string
  kind: 'folder' | 'list'
  parentId: string | null
  chars: string[]
}

export type CustomList = ListNode

export type AnkiSessionFile = {
  updated?: string
  source?: string
  kanji?: string[]
}
