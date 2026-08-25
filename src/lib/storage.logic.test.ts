import { describe, expect, it } from 'vitest'
import { defaultSettings, loadStats, patchQuiz } from './storage'

describe('settings and stats logic', () => {
  it('does not copy quiz patches onto global theme fields', () => {
    const next = patchQuiz({ ...defaultSettings, speech: true, furi: 'hover' }, 'draw', { autoNext: false, hideAnswers: true })
    expect(next.speech).toBe(true)
    expect(next.furi).toBe('hover')
    expect(next.quiz.draw.autoNext).toBe(false)
    expect(next.quiz.practice.autoNext).toBe(true)
  })

  it('resets streak after a missed day', () => {
    const old = new Date()
    old.setDate(old.getDate() - 3)
    const key = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`
    localStorage.setItem(
      'kanjidesk.stats',
      JSON.stringify({ streak: 9, lastDay: key, writtenToday: ['日'], writesTotal: 12 }),
    )
    expect(loadStats()).toMatchObject({ streak: 0, writtenToday: [] })
  })
})
