import { memoApi, memoError } from './memo'
import { appendNote, loadKanjiMeta, saveKanjiMetaClear, saveMnemonic, saveNote, type KanjiMeta } from './storage'

export type NoteSync = 'idle' | 'pending' | 'synced' | 'error'

export type NoteSaveResult = {
  ok: boolean
  error?: string
  meta: Record<string, KanjiMeta>
}

function metaSnapshot(): Record<string, KanjiMeta> {
  return loadKanjiMeta()
}

export async function persistKanjiFields(
  kanji: string,
  fields: { mnemonic?: string; notes?: string },
): Promise<NoteSaveResult> {
  if (fields.notes !== undefined) saveNote(kanji, fields.notes)
  if (fields.mnemonic !== undefined) saveMnemonic(kanji, fields.mnemonic)
  const meta = metaSnapshot()
  try {
    await memoApi.notes(kanji, fields)
    return { ok: true, meta }
  } catch (e) {
    return { ok: false, error: memoError(e), meta }
  }
}

export async function persistNote(kanji: string, text: string): Promise<NoteSaveResult> {
  return persistKanjiFields(kanji, { notes: text })
}

export async function persistMnemonic(kanji: string, text: string): Promise<NoteSaveResult> {
  return persistKanjiFields(kanji, { mnemonic: text })
}

export async function persistAppendNote(kanji: string, chunk: string): Promise<NoteSaveResult> {
  const next = appendNote(kanji, chunk)
  return persistKanjiFields(kanji, { notes: next })
}

export async function clearAllNotes(): Promise<NoteSaveResult> {
  saveKanjiMetaClear()
  try {
    await memoApi.clearNotes()
    return { ok: true, meta: {} }
  } catch (e) {
    return { ok: false, error: memoError(e), meta: {} }
  }
}
