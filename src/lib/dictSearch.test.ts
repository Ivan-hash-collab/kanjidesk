import { describe, expect, it } from 'vitest'
import { filterWords, kanjiScore, matchJlpt, parseDictQuery, searchKanji, wordJlpt, wordScore } from './dictSearch'
import type { KanjiDict } from '../types'

const dict: KanjiDict = {
  水: { strokes: 4, grade: 1, freq: 200, jlpt: 5, meanings: ['water'], on: ['スイ'], kun: ['みず'] },
  火: { strokes: 4, grade: 1, freq: 400, jlpt: 5, meanings: ['fire'], on: ['カ'], kun: ['ひ'] },
  漢: { strokes: 13, grade: 8, freq: 800, jlpt: 1, meanings: ['China'], on: ['カン'], kun: [] },
  字: { strokes: 6, grade: 1, freq: 500, jlpt: null, meanings: ['character'], on: ['ジ'], kun: ['あざ'] },
}

describe('dict search filters', () => {
  it('matches JLPT chips including empty', () => {
    expect(matchJlpt(5, 'all')).toBe(true)
    expect(matchJlpt(5, 5)).toBe(true)
    expect(matchJlpt(1, 5)).toBe(false)
    expect(matchJlpt(null, 'none')).toBe(true)
    expect(matchJlpt(5, 'none')).toBe(false)
  })

  it('does not treat a compound as JLPT of its kanji', () => {
    expect(wordJlpt('水', dict)).toBe(5)
    expect(wordJlpt('水火', dict)).toBeNull()
    expect(wordJlpt('漢水', dict)).toBeNull()
    expect(wordJlpt('字', dict)).toBeNull()
  })

  it('finds kanji by reading and meaning and can browse by JLPT', () => {
    expect(searchKanji(dict, 'mizu', 'all', 'freq')).toContain('水')
    expect(searchKanji(dict, 'sui', 'all', 'freq')).toContain('水')
    expect(searchKanji(dict, 'water', 'all', 'freq')[0]).toBe('水')
    expect(searchKanji(dict, '', 5, 'freq')).toEqual(['水', '火'])
    expect(searchKanji(dict, '', 'none', 'freq')).toEqual(['字'])
  })

  it('scores an exact word above a gloss substring', () => {
    expect(kanjiScore('水', dict.水, 'water')).toBeGreaterThan(kanjiScore('水', dict.水, 'wat'))
    const exact = { written: '水', kana: 'みず', meanings: ['water'], common: true }
    const loose = { written: '水曜日', kana: 'すいようび', meanings: ['Wednesday'], common: false }
    expect(wordScore(exact, '水')).toBeGreaterThan(wordScore(loose, '水'))
  })

  it('filters related words by inferred JLPT', () => {
    const words = [
      { written: '水', kana: 'みず', meanings: ['water'], common: true },
      { written: '漢字', kana: 'かんじ', meanings: ['kanji'], common: true },
      { written: '字', kana: 'じ', meanings: ['character'], common: false },
    ]
    expect(filterWords(words, '', dict, 5, 'freq').map((w) => w.written)).toEqual(['水'])
    expect(filterWords(words, 'kanji', dict, 'all', 'freq')[0]?.written).toBe('漢字')
  })

  it('does not treat English lewd as a reading of え', () => {
    const collar = { written: '領', kana: 'えり', meanings: ['collar', 'lapel'], common: true }
    const lewd = { written: '淫ら', kana: 'みだら', meanings: ['obscene', 'lewd'], common: false }
    expect(wordScore(collar, 'lewd')).toBe(0)
    expect(wordScore(lewd, 'lewd')).toBeGreaterThan(0)
    expect(filterWords([collar, lewd], 'lewd', dict, 'all', 'freq').map((w) => w.written)).toEqual(['淫ら'])
  })

  it('parses commands that drop romaji readings', () => {
    expect(parseDictQuery('me -roma')).toMatchObject({
      text: 'me',
      noRomaji: true,
      meaningOnly: false,
      readingOnly: false,
      commonOnly: false,
    })
    expect(parseDictQuery('en:lewd #n5 #common').text).toBe('lewd')
    expect(parseDictQuery('en:lewd #n5 #common').meaningOnly).toBe(true)
    expect(parseDictQuery('en:lewd #n5 #common').jlpt).toBe(5)
    expect(parseDictQuery('en:lewd #n5 #common').commonOnly).toBe(true)
    expect(parseDictQuery('kana:みず').readingOnly).toBe(true)
  })

  it('can exclude romaji readings for short latin like me', () => {
    const eye = { written: '目', kana: 'め', meanings: ['eye'], common: true }
    const withEye: KanjiDict = {
      ...dict,
      目: { strokes: 5, grade: 1, freq: 70, jlpt: 5, meanings: ['eye'], on: ['モク'], kun: ['め'] },
    }
    expect(wordScore(eye, 'me')).toBeGreaterThan(0)
    expect(wordScore(eye, 'me', { noRomaji: true })).toBe(0)
    expect(filterWords([eye], 'me -roma', dict, 'all', 'freq')).toEqual([])
    expect(filterWords([eye], 'eye -roma', dict, 'all', 'freq')[0]?.written).toBe('目')
    expect(filterWords([eye], 'en:eye', dict, 'all', 'freq')[0]?.written).toBe('目')
    expect(searchKanji(withEye, 'me -roma', 'all', 'freq')).not.toContain('目')
    expect(searchKanji(withEye, 'eye -roma', 'all', 'freq')).toContain('目')
  })

  it('merges variant writings and does not tag compounds as kanji JLPT', () => {
    const meat: KanjiDict = {
      ...dict,
      肉: { strokes: 6, grade: 2, freq: 300, jlpt: 4, meanings: ['meat'], on: ['ニク'], kun: [] },
    }
    expect(wordJlpt('肉', meat)).toBe(4)
    expect(wordJlpt('肉壺', meat)).toBeNull()
    const words = [
      { written: '膣肉', kana: 'ちつにく', meanings: ['vulva'], common: false },
      { written: '膣肉', kana: 'ちつにく', meanings: ['vulva'], common: false },
      { written: '肉壺', kana: 'にくつぼ', meanings: ['pussy'], common: false },
      { written: '肉壷', kana: 'にくつぼ', meanings: ['pussy'], common: false },
      { written: '淫口', kana: 'いんこう', meanings: ['pussy'], common: false },
    ]
    expect(filterWords(words, 'vulva', meat, 'all', 'freq').map((w) => w.written)).toEqual(['膣肉'])
    expect(filterWords(words, 'pussy', meat, 'all', 'freq').map((w) => w.written)).toEqual(['肉壺', '淫口'])
    expect(filterWords(words, 'pussy', meat, 4, 'freq')).toEqual([])
  })
})
