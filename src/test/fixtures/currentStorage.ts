import type { CustomList, SessionReport, Settings, Stats } from '../../types'
import { CURRENT_STORAGE_VERSION } from '../../lib/storageMigrations'
import { STORAGE_KEYS } from '../../lib/storageKeys'

export function currentStorageFixture(today: string) {
  const practiceQuiz = {
    autoNext: false,
    repeatWrong: true,
    hideAnswers: true,
    readingHint: true,
    disableTimeouts: false,
    hypermode: true,
    strictness: 61,
    hintAfter: 3,
    skipAfterMisses: 2,
    acceptBackwards: false,
    showOutline: true,
    penWidth: 16,
    passQuality: 70,
  }

  const settings: Settings = {
    dark: true,
    speech: false,
    furi: 'on',
    showGloss: false,
    quiz: {
      browse: {
        ...practiceQuiz,
        autoNext: true,
        hideAnswers: false,
        hypermode: false,
      },
      practice: { ...practiceQuiz },
      draw: {
        ...practiceQuiz,
        readingHint: false,
        penWidth: 20,
      },
      mcq: {
        ...practiceQuiz,
        hideAnswers: false,
        strictness: 50,
      },
    },
    ...practiceQuiz,
  }

  const stats: Stats = {
    streak: 8,
    lastDay: today,
    writtenToday: ['日', '本'],
    writesTotal: 144,
  }

  const lists: CustomList[] = [
    { id: 'folder-1', name: 'JLPT', kind: 'folder', parentId: null, chars: [] },
    { id: 'list-1', name: 'N5', kind: 'list', parentId: 'folder-1', chars: ['日', '本', '語'] },
  ]

  const history: SessionReport[] = [
    {
      at: `${today}T10:00:00.000Z`,
      mode: 'practice',
      title: 'N5',
      durationMs: 42_000,
      items: [
        {
          char: '日',
          kind: 'write',
          correct: true,
          timeout: false,
          timeMs: 2_400,
          quality: 84,
        },
      ],
    },
  ]

  const lastSession = ['日', '本', '語']
  const kanjiMeta = {
    日: { note: 'Солнце и день', mnemonic: 'Круглое солнце стало квадратом' },
    本: { note: 'Основа', mnemonic: '' },
    語: { note: '', mnemonic: 'Пять ртов рассказывают историю' },
  }
  const memoIds = {
    studyId: 27,
    studySig: '日|本|語',
    extras: { '日|本': 31 },
  }

  return {
    stored: {
      [STORAGE_KEYS.version]: String(CURRENT_STORAGE_VERSION),
      [STORAGE_KEYS.settings]: JSON.stringify(settings),
      [STORAGE_KEYS.stats]: JSON.stringify(stats),
      [STORAGE_KEYS.lists]: JSON.stringify(lists),
      [STORAGE_KEYS.lastSession]: JSON.stringify(lastSession),
      [STORAGE_KEYS.sessionHistory]: JSON.stringify(history),
      [STORAGE_KEYS.kanjiMeta]: JSON.stringify(kanjiMeta),
      [STORAGE_KEYS.memoIds]: JSON.stringify(memoIds),
    },
    expected: {
      settings,
      stats,
      lists,
      lastSession,
      history,
      notes: { 日: 'Солнце и день', 本: 'Основа' },
      kanjiMeta,
      memoIds,
    },
  }
}
