import { summarize } from './quality'
import { localDayKey } from './storage'
import type { SessionReport } from '../types'

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function dailyStudySeries(hist: SessionReport[], days: number): { quality: number[]; volume: number[] } {
  const map = new Map<string, SessionReport[]>()
  for (const h of hist) {
    const key = localDayKey(h.at)
    const bag = map.get(key) ?? []
    bag.push(h)
    map.set(key, bag)
  }
  const quality: number[] = []
  const volume: number[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const items = map.get(dayKey(d)) ?? []
    const logs = items.flatMap((h) => h.items)
    quality.push(logs.length ? summarize(logs).quality : 0)
    volume.push(logs.length)
  }
  return { quality, volume }
}
