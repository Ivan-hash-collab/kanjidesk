import { describe, expect, it } from 'vitest'
import { parseChannel, windowTitleFor } from './appMode'

describe('app channel', () => {
  it('marks local launch.py as debug', () => {
    const ch = parseChannel({ debug: true, channel: 'local', label: 'отладка', version: '0.2.6' })
    expect(ch).toEqual({ debug: true, channel: 'local', label: 'отладка', version: '0.2.6' })
    expect(windowTitleFor(ch!)).toContain('отладка')
  })

  it('marks the GitHub exe as release', () => {
    const ch = parseChannel({ debug: false, channel: 'exe', label: 'релиз', version: '0.2.6' })
    expect(ch?.debug).toBe(false)
    expect(ch?.version).toBe('0.2.6')
    expect(windowTitleFor(ch!)).not.toContain('отладка')
  })

  it('rejects junk', () => {
    expect(parseChannel({ channel: 'prod' })).toBeNull()
  })
})
