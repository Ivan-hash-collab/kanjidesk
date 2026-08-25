import { describe, expect, it } from 'vitest'
import { groupMemoRounds, type SessionMessage } from './memo'

function msg(id: number, text: string, run: string, chunk = 0): SessionMessage {
  return {
    id,
    session_id: 1,
    chunk_index: chunk,
    skills: ['mnemonic'],
    kanji: ['日'],
    text_ru: text,
    created_at: 't',
    meta: { run_id: run },
  }
}

describe('mnemonic rounds', () => {
  it('treats an empty message list as no generated analysis', () => {
    expect(groupMemoRounds([])).toEqual([])
  })

  it('groups only the current run after history is cleared', () => {
    expect(groupMemoRounds([msg(3, 'new', 'run-2')]).map((r) => r.runId)).toEqual(['run-2'])
  })

  it('keeps a rewrite as a separate latest round', () => {
    const rounds = groupMemoRounds([msg(1, 'old story', 'run-1'), msg(2, 'new story', 'run-2')])
    expect(rounds.map((r) => r.runId)).toEqual(['run-1', 'run-2'])
    expect(rounds.at(-1)?.text).toContain('new story')
    expect(rounds[0]?.text).toContain('old story')
  })
})
