import { describe, expect, it } from 'vitest'
import { looksLikeRomaji, queryKana, romajiToHira, toRomaji } from './kana'

describe('romaji', () => {
  it('converts common readings both ways', () => {
    expect(romajiToHira('mizu')).toBe('みず')
    expect(romajiToHira('sui')).toBe('すい')
    expect(romajiToHira('toukyou')).toBe('とうきょう')
    expect(romajiToHira('kanji')).toBe('かんじ')
    expect(romajiToHira('nichi')).toBe('にち')
    expect(toRomaji('スイ')).toBe('sui')
    expect(toRomaji('みず')).toBe('mizu')
    expect(toRomaji('み.ず')).toBe('mizu')
  })

  it('treats a romaji query as hiragana', () => {
    expect(queryKana('mizu')).toBe('みず')
    expect(queryKana('スイ')).toBe('すい')
  })

  it('does not parse English as leftover kana', () => {
    expect(romajiToHira('lewd')).toBe('')
    expect(queryKana('lewd')).toBe('')
    expect(looksLikeRomaji('lewd')).toBe(false)
    expect(romajiToHira('water')).toBe('')
    expect(looksLikeRomaji('mizu')).toBe(true)
  })
})
