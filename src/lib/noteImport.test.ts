import { describe, expect, it } from 'vitest'
import { notesFromGrid, previewText } from './noteImport'

describe('note import preview', () => {
  it('parses pasted kanji and text columns', () => {
    const tables = previewText('漢字\tмнемоника\n日\tсолнце\n月\tлуна')
    expect(tables).toHaveLength(1)
    const map = notesFromGrid(tables[0]!.rows, 0, 1, true)
    expect(map).toEqual({ 日: 'солнце', 月: 'луна' })
  })
})
