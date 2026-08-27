import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionReport, Stats } from '../types'
import {
  defaultSettings,
  loadHistory,
  loadKanjiMeta,
  loadLastSession,
  loadLists,
  loadNotes,
  loadSettings,
  loadStats,
} from './storage'
import { CURRENT_STORAGE_VERSION, migrateLocalStorage } from './storageMigrations'
import { STORAGE_KEYS } from './storageKeys'

function today(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

describe('localStorage migrations', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy flat settings without losing custom or per-mode values', () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        dark: true,
        speech: false,
        furi: 'off',
        leniency: 1.1,
        autoNext: false,
        hintAfter: 4,
        experimental: { keep: true },
        quiz: {
          draw: { strictness: 88, penWidth: 30 },
        },
      }),
    )

    expect(migrateLocalStorage(localStorage)).toEqual({
      fromVersion: 0,
      toVersion: CURRENT_STORAGE_VERSION,
      migrated: true,
    })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!) as Record<string, unknown>
    const settings = loadSettings()

    expect(stored.strictness).toBe(45)
    expect(stored.experimental).toEqual({ keep: true })
    expect(settings).toMatchObject({
      dark: true,
      speech: false,
      furi: 'off',
      strictness: 45,
      autoNext: false,
      hintAfter: 4,
    })
    expect(settings.quiz.practice.strictness).toBe(45)
    expect(settings.quiz.draw).toMatchObject({ strictness: 92, penWidth: 24 })
    expect(localStorage.getItem(STORAGE_KEYS.version)).toBe(String(CURRENT_STORAGE_VERSION))
  })

  it('falls back safely when stored JSON is malformed', () => {
    for (const key of [
      STORAGE_KEYS.settings,
      STORAGE_KEYS.stats,
      STORAGE_KEYS.lists,
      STORAGE_KEYS.lastSession,
      STORAGE_KEYS.sessionHistory,
      STORAGE_KEYS.legacyNotes,
      STORAGE_KEYS.kanjiMeta,
    ]) {
      localStorage.setItem(key, '{broken')
    }

    expect(() => migrateLocalStorage(localStorage)).not.toThrow()
    expect(loadSettings()).toEqual(defaultSettings)
    expect(loadStats()).toEqual({ streak: 0, lastDay: '', writtenToday: [], writesTotal: 0 })
    expect(loadLists()).toEqual([])
    expect(loadLastSession()).toEqual([])
    expect(loadHistory()).toEqual([])
    expect(loadKanjiMeta()).toEqual({})
  })

  it('merges legacy notes into current metadata while preserving current fields', () => {
    localStorage.setItem(
      STORAGE_KEYS.legacyNotes,
      JSON.stringify({
        日: 'legacy day note',
        本: 'legacy book note',
        語: 'legacy language note',
      }),
    )
    localStorage.setItem(
      STORAGE_KEYS.kanjiMeta,
      JSON.stringify({
        日: { note: 'current day note', mnemonic: 'day mnemonic' },
        本: { note: '', mnemonic: 'book mnemonic' },
      }),
    )

    migrateLocalStorage(localStorage)

    expect(loadKanjiMeta()).toEqual({
      日: { note: 'current day note', mnemonic: 'day mnemonic' },
      本: { note: 'legacy book note', mnemonic: 'book mnemonic' },
      語: { note: 'legacy language note', mnemonic: '' },
    })
    expect(loadNotes()).toEqual({
      日: 'current day note',
      本: 'legacy book note',
      語: 'legacy language note',
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.legacyNotes)!)).toEqual({
      日: 'legacy day note',
      本: 'legacy book note',
      語: 'legacy language note',
    })
  })

  it('recovers legacy notes when the newer metadata is malformed', () => {
    localStorage.setItem(STORAGE_KEYS.kanjiMeta, '{broken')
    localStorage.setItem(STORAGE_KEYS.legacyNotes, JSON.stringify({ 学: 'study' }))

    migrateLocalStorage(localStorage)

    expect(loadKanjiMeta()).toEqual({ 学: { note: 'study', mnemonic: '' } })
  })

  it('preserves progress, lists, last session, and history byte-for-byte', () => {
    const stats: Stats = {
      streak: 5,
      lastDay: today(),
      writtenToday: ['学'],
      writesTotal: 92,
    }
    const lists = [
      { id: 'f', name: 'Folder', kind: 'folder', parentId: null, chars: [] },
      { id: 'l', name: 'Study', kind: 'list', parentId: 'f', chars: ['学', '校'] },
    ]
    const lastSession = ['学', '校']
    const history: SessionReport[] = [
      {
        at: new Date().toISOString(),
        mode: 'draw',
        title: 'Study',
        durationMs: 12_000,
        items: [],
      },
    ]
    const stored = {
      [STORAGE_KEYS.stats]: JSON.stringify(stats),
      [STORAGE_KEYS.lists]: JSON.stringify(lists),
      [STORAGE_KEYS.lastSession]: JSON.stringify(lastSession),
      [STORAGE_KEYS.sessionHistory]: JSON.stringify(history),
    }
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value)

    migrateLocalStorage(localStorage)

    for (const [key, value] of Object.entries(stored)) {
      expect(localStorage.getItem(key)).toBe(value)
    }
    expect(loadStats()).toEqual(stats)
    expect(loadLists()).toEqual(lists)
    expect(loadLastSession()).toEqual(lastSession)
    expect(loadHistory()).toEqual(history)
  })

  it('preserves memo session identifiers exactly', () => {
    const raw = JSON.stringify({
      studyId: 42,
      studySig: '日|本',
      extras: { '日': 7, '本': 9 },
    })
    localStorage.setItem(STORAGE_KEYS.memoIds, raw)

    migrateLocalStorage(localStorage)

    expect(localStorage.getItem(STORAGE_KEYS.memoIds)).toBe(raw)
  })
})
