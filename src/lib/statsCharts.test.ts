import { describe, expect, it } from 'vitest'
import { dailyStudySeries } from './statsCharts'
import type { SessionReport } from '../types'

function report(at: string, n: number, quality = 80): SessionReport {
  return {
    at,
    mode: 'draw',
    title: 't',
    durationMs: 1000,
    items: Array.from({ length: n }, () => ({
      char: '日',
      kind: 'draw',
      correct: true,
      timeout: false,
      timeMs: 10,
      quality,
    })),
  }
}

describe('daily study series', () => {
  it('aggregates by local calendar day instead of last N sessions', () => {
    const today = new Date()
    const iso = today.toISOString()
    const hist = [report(iso, 2, 50), report(iso, 4, 100)]
    const { volume, quality } = dailyStudySeries(hist, 7)
    expect(volume).toHaveLength(7)
    expect(volume[6]).toBe(6)
    expect(quality[6]).toBeGreaterThan(0)
    expect(volume.slice(0, 6).every((n) => n === 0)).toBe(true)
  })
})
