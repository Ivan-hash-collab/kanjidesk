import { describe, expect, it } from 'vitest'
import { capSameGloss, mergeWordVariants } from './lexicon'

describe('word list collapse', () => {
  it('merges duplicate writings and kanji variants of the same sense', () => {
    const merged = mergeWordVariants([
      { written: '膣肉', kana: 'ちつにく', meanings: ['vulva'], common: false },
      { written: '膣肉', kana: 'ちつにく', meanings: ['vulva'], common: false },
      { written: '肉壺', kana: 'にくつぼ', meanings: ['pussy'], common: false },
      { written: '肉壷', kana: 'にくつぼ', meanings: ['pussy'], common: false },
    ])
    expect(merged.map((w) => w.written)).toEqual(['膣肉', '肉壺'])
    expect(merged[1]?.alts).toContain('肉壷')
  })

  it('keeps at most two hits with the same first gloss', () => {
    const capped = capSameGloss(
      [
        { written: '淫口', kana: 'いんこう', meanings: ['pussy'], common: false },
        { written: '肉壺', kana: 'にくつぼ', meanings: ['pussy'], common: false },
        { written: '肉壷', kana: 'にくつぼ', meanings: ['pussy'], common: false },
      ],
      2,
    )
    expect(capped.map((w) => w.written)).toEqual(['淫口', '肉壺'])
  })
})
