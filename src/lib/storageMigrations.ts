import { normalizeSettings } from './storage'
import { STORAGE_KEYS } from './storageKeys'

export const CURRENT_STORAGE_VERSION = 1

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>

export type StorageMigrationResult = {
  fromVersion: number
  toVersion: number
  migrated: boolean
  error?: string
}

type Migration = (storage: StorageAdapter) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function migrateSettings(storage: StorageAdapter): void {
  const raw = storage.getItem(STORAGE_KEYS.settings)
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return
  storage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalizeSettings(parsed)))
}

function migrateNotes(storage: StorageAdapter): void {
  const legacy = parseJson(storage.getItem(STORAGE_KEYS.legacyNotes))
  if (!isRecord(legacy)) return

  const currentRaw = storage.getItem(STORAGE_KEYS.kanjiMeta)
  const current = currentRaw === null ? {} : parseJson(currentRaw)
  if (!isRecord(current)) return

  const next: Record<string, unknown> = { ...current }
  let changed = currentRaw === null

  for (const [char, legacyNote] of Object.entries(legacy)) {
    if (typeof legacyNote !== 'string') continue
    const row = isRecord(next[char]) ? next[char] : {}
    const note = typeof row.note === 'string' ? row.note : ''
    const mnemonic = typeof row.mnemonic === 'string' ? row.mnemonic : ''
    if (note) continue
    next[char] = { ...row, note: legacyNote, mnemonic }
    changed = true
  }

  if (changed) {
    storage.setItem(STORAGE_KEYS.kanjiMeta, JSON.stringify(next))
  }
}

const migrations: Record<number, Migration> = {
  1(storage) {
    migrateSettings(storage)
    migrateNotes(storage)
  },
}

function readVersion(storage: StorageAdapter): number {
  const value = Number(storage.getItem(STORAGE_KEYS.version))
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function migrateLocalStorage(storage?: StorageAdapter): StorageMigrationResult {
  let target: StorageAdapter
  try {
    if (storage) target = storage
    else if (typeof localStorage !== 'undefined') target = localStorage
    else return { fromVersion: 0, toVersion: 0, migrated: false }
  } catch (error) {
    return { fromVersion: 0, toVersion: 0, migrated: false, error: errorMessage(error) }
  }

  let fromVersion = 0
  try {
    fromVersion = readVersion(target)
  } catch (error) {
    return { fromVersion, toVersion: fromVersion, migrated: false, error: errorMessage(error) }
  }

  if (fromVersion >= CURRENT_STORAGE_VERSION) {
    return { fromVersion, toVersion: fromVersion, migrated: false }
  }

  let version = fromVersion
  try {
    while (version < CURRENT_STORAGE_VERSION) {
      const nextVersion = version + 1
      const migration = migrations[nextVersion]
      if (!migration) throw new Error(`Missing localStorage migration ${nextVersion}`)
      migration(target)
      target.setItem(STORAGE_KEYS.version, String(nextVersion))
      version = nextVersion
    }
  } catch (error) {
    return {
      fromVersion,
      toVersion: version,
      migrated: version !== fromVersion,
      error: errorMessage(error),
    }
  }

  return { fromVersion, toVersion: version, migrated: true }
}
