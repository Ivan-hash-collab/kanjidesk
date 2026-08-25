import { beforeEach, describe, expect, it } from 'vitest'
import { currentStorageFixture } from '../test/fixtures/currentStorage'
import {
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

describe('current localStorage contract', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads the versioned fixture without rewriting user data', () => {
    const fixture = currentStorageFixture(today())
    for (const [key, value] of Object.entries(fixture.stored)) {
      localStorage.setItem(key, value)
    }

    expect(migrateLocalStorage(localStorage)).toEqual({
      fromVersion: CURRENT_STORAGE_VERSION,
      toVersion: CURRENT_STORAGE_VERSION,
      migrated: false,
    })

    expect(loadSettings()).toEqual(fixture.expected.settings)
    expect(loadStats()).toEqual(fixture.expected.stats)
    expect(loadLists()).toEqual(fixture.expected.lists)
    expect(loadLastSession()).toEqual(fixture.expected.lastSession)
    expect(loadHistory()).toEqual(fixture.expected.history)
    expect(loadNotes()).toEqual(fixture.expected.notes)
    expect(loadKanjiMeta()).toEqual(fixture.expected.kanjiMeta)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.memoIds)!)).toEqual(fixture.expected.memoIds)

    for (const [key, value] of Object.entries(fixture.stored)) {
      expect(localStorage.getItem(key)).toBe(value)
    }
  })
})
