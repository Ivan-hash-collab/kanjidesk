export type AppChannel = {
  debug: boolean
  channel: 'exe' | 'local' | 'vite'
  label: string
}

export function fallbackChannel(): AppChannel {
  if (import.meta.env.DEV) return { debug: true, channel: 'vite', label: 'отладка' }
  return { debug: false, channel: 'exe', label: 'релиз' }
}

export function parseChannel(value: unknown): AppChannel | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const channel = rec.channel
  if (channel !== 'exe' && channel !== 'local' && channel !== 'vite') return null
  return {
    channel,
    debug: rec.debug === true || channel !== 'exe',
    label: typeof rec.label === 'string' ? rec.label : channel === 'exe' ? 'релиз' : 'отладка',
  }
}

export function windowTitleFor(channel: AppChannel): string {
  return channel.debug ? 'KanjiDesk · отладка' : 'KanjiDesk — пропись на ПК'
}

export async function loadAppChannel(): Promise<AppChannel> {
  try {
    const res = await fetch('./app-mode.json', { cache: 'no-store' })
    if (res.ok) {
      const parsed = parseChannel(await res.json())
      if (parsed) return parsed
    }
  } catch {
    /* keep fallback */
  }
  return fallbackChannel()
}
