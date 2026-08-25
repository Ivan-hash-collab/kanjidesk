import type { QuizId, SheetTab, StudyIntent, ViewId } from '../types'

export type PendingAction = {
  kind: 'view' | 'start' | 'memo' | 'home'
  view?: ViewId
  chars?: string[]
  title?: string
  intent?: StudyIntent
  memoOpen?: boolean
}

export type AppNavState = {
  view: ViewId
  trail: ViewId[]
  session: string[]
  title: string
  sheet: SheetTab | null
  pending: PendingAction | null
  memoOpen: boolean
  dictFocus: string
  dictWord: string
  dictQuery: string
  settingsKind: 'global' | QuizId
}

export type AppNavAction =
  | { type: 'go'; view: ViewId }
  | { type: 'home' }
  | { type: 'back'; fallback?: ViewId }
  | { type: 'start'; chars: string[]; title: string; intent?: StudyIntent; busy?: boolean }
  | { type: 'memo'; chars: string[]; title: string; busy?: boolean }
  | { type: 'request'; view: ViewId; busy?: boolean }
  | { type: 'leave'; dest: ViewId | 'hub' | 'setup' }
  | { type: 'closeSheet' }
  | { type: 'sheet'; tab: SheetTab | null; settingsKind?: 'global' | QuizId }
  | { type: 'openDict'; ch: string; word?: string }
  | { type: 'openLookup'; q: string; ch: string; word: string }
  | { type: 'setMemoOpen'; open: boolean }
  | { type: 'resetDict' }

export function initialNav(session: string[], title: string): AppNavState {
  return {
    view: 'home',
    trail: ['home'],
    session,
    title,
    sheet: null,
    pending: null,
    memoOpen: false,
    dictFocus: '',
    dictWord: '',
    dictQuery: '',
    settingsKind: 'global',
  }
}

function pushTrail(trail: ViewId[], view: ViewId): ViewId[] {
  if (view === 'home') return ['home']
  return trail[trail.length - 1] === view ? trail : [...trail, view]
}

export function navReducer(state: AppNavState, action: AppNavAction): AppNavState {
  switch (action.type) {
    case 'go':
      return { ...state, view: action.view, trail: pushTrail(state.trail, action.view), sheet: null, pending: null }
    case 'home':
      return {
        ...state,
        view: 'home',
        trail: ['home'],
        sheet: null,
        pending: null,
        memoOpen: false,
        dictFocus: '',
        dictWord: '',
        dictQuery: '',
      }
    case 'back': {
      const next = state.trail.length > 1 ? state.trail.slice(0, -1) : (['home'] as ViewId[])
      return { ...state, trail: next.length ? next : ['home'], view: next[next.length - 1] ?? 'home' }
    }
    case 'start':
      if (action.busy) {
        return { ...state, sheet: 'leave', pending: { kind: 'start', chars: action.chars, title: action.title, intent: action.intent } }
      }
      return {
        ...state,
        session: action.chars,
        title: action.title,
        view: 'study',
        trail: pushTrail(state.trail, 'study'),
        sheet: null,
        pending: null,
        memoOpen: false,
      }
    case 'memo':
      if (action.busy) {
        return { ...state, sheet: 'leave', pending: { kind: 'memo', chars: action.chars, title: action.title, memoOpen: true } }
      }
      return {
        ...state,
        session: action.chars,
        title: action.title,
        view: 'memo',
        trail: pushTrail(state.trail, 'memo'),
        memoOpen: true,
        sheet: null,
        pending: null,
      }
    case 'request':
      if (action.view === 'study') {
        return { ...state, view: 'study', trail: pushTrail(state.trail, 'study'), sheet: null, pending: null }
      }
      if (action.busy) {
        return { ...state, sheet: action.view === 'about' ? 'help' : 'leave', pending: { kind: 'view', view: action.view } }
      }
      return {
        ...state,
        view: action.view,
        trail: pushTrail(state.trail, action.view),
        sheet: null,
        pending: null,
        dictFocus: action.view === 'dict' ? state.dictFocus : '',
        dictWord: action.view === 'dict' ? state.dictWord : '',
        dictQuery: action.view === 'dict' ? state.dictQuery : '',
      }
    case 'leave': {
      const pending = state.pending
      const base: AppNavState = { ...state, sheet: null, pending: null }
      if (action.dest === 'setup' || action.dest === 'hub') {
        return { ...base, view: 'study', trail: pushTrail(state.trail, 'study') }
      }
      if (pending?.kind === 'start' && pending.chars) {
        return navReducer(base, { type: 'start', chars: pending.chars, title: pending.title || base.title, intent: pending.intent })
      }
      if (pending?.kind === 'memo' && pending.chars) {
        return navReducer(base, { type: 'memo', chars: pending.chars, title: pending.title || base.title })
      }
      if (pending?.kind === 'home' || action.dest === 'home' || (pending?.kind === 'view' && pending.view === 'home')) {
        return navReducer(base, { type: 'home' })
      }
      if (pending?.kind === 'view' && pending.view) {
        return navReducer(base, { type: 'go', view: pending.view })
      }
      return navReducer(base, { type: 'go', view: action.dest })
    }
    case 'closeSheet':
      return { ...state, sheet: null, pending: null }
    case 'sheet':
      return {
        ...state,
        sheet: action.tab,
        settingsKind: action.settingsKind ?? state.settingsKind,
      }
    case 'openDict':
      return {
        ...state,
        dictFocus: action.ch,
        dictWord: action.word || '',
        dictQuery: '',
        view: 'dict',
        trail: pushTrail(state.trail, 'dict'),
        sheet: null,
      }
    case 'openLookup':
      return {
        ...state,
        dictFocus: action.ch,
        dictWord: action.word,
        dictQuery: action.q,
        view: 'dict',
        trail: pushTrail(state.trail, 'dict'),
        sheet: null,
      }
    case 'setMemoOpen':
      return { ...state, memoOpen: action.open }
    case 'resetDict':
      return { ...state, dictFocus: '', dictWord: '', dictQuery: '' }
    default:
      return state
  }
}
