import { describe, expect, it } from 'vitest'
import { initialNav, navReducer } from './appNav'

describe('app navigation reducer', () => {
  it('keeps the full pending start payload while a round is busy', () => {
    const base = initialNav(['日'], 'old')
    const next = navReducer(base, {
      type: 'start',
      chars: ['本', '語'],
      title: 'N5',
      busy: true,
      intent: { nonce: 1, mode: 'draw', autoStart: true },
    })
    expect(next.sheet).toBe('leave')
    expect(next.session).toEqual(['日'])
    expect(next.pending).toEqual({
      kind: 'start',
      chars: ['本', '語'],
      title: 'N5',
      intent: { nonce: 1, mode: 'draw', autoStart: true },
    })

    const left = navReducer(next, { type: 'leave', dest: 'study' })
    expect(left.session).toEqual(['本', '語'])
    expect(left.title).toBe('N5')
    expect(left.view).toBe('study')
    expect(left.pending).toBeNull()
  })

  it('home closes nested mnemonic and overlay state', () => {
    const open = navReducer(initialNav(['日'], 'set'), { type: 'memo', chars: ['日'], title: 'set' })
    expect(open.memoOpen).toBe(true)
    const home = navReducer({ ...open, sheet: 'leave' }, { type: 'home' })
    expect(home.view).toBe('home')
    expect(home.memoOpen).toBe(false)
    expect(home.sheet).toBeNull()
  })
})
