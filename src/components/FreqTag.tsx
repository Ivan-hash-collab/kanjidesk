import { useEffect, useState } from 'react'
import { wordJlpt } from '../lib/dictSearch'
import { freqOfWord, freqOfWordSync } from '../lib/freq'
import { jlptLabel } from '../lib/kanji'
import type { KanjiDict } from '../types'

type Props = {
  rank: number | null | undefined
  kind: 'kanji' | 'word'
  jlpt?: number | null
  corpusN?: number | null
  common?: boolean
}

export function FreqTag({ rank, kind, jlpt, corpusN, common }: Props) {
  const bits: string[] = []
  if (jlpt) bits.push(jlptLabel(jlpt))
  if (common && kind === 'word') bits.push('частотное')
  if (rank && rank > 0) {
    const hint = rank <= 500 ? 'очень частое' : rank <= 1500 ? 'частое' : rank <= 5000 ? 'среднее' : 'редкое'
    bits.push(kind === 'kanji' ? `кандзи #${rank}` : `корпус #${rank}`)
    if (corpusN != null && kind === 'word') bits.push(`${corpusN.toLocaleString('ru-RU')} вхожд.`)
    return (
      <span className="freq-tag" title={`${hint}${jlpt ? ` · ${jlptLabel(jlpt)}` : ''}${common ? ' · JMdict common' : ''} · ${kind === 'word' ? 'корпус, не JLPT' : 'частотный список кандзи'}`}>
        {bits.join(' · ')}
      </span>
    )
  }
  if (!bits.length) return null
  return (
    <span className="freq-tag" title={bits.join(' · ')}>
      {bits.join(' · ')}
    </span>
  )
}

export function WordRank({
  written,
  alts,
  kana,
  dict,
  common,
}: {
  written: string
  alts?: string[]
  kana?: string
  dict?: KanjiDict
  common?: boolean
}) {
  const extra = [kana, ...(alts ?? [])].filter(Boolean).join('\0')
  const extras = extra ? extra.split('\0') : []
  const [hit, setHit] = useState(() => freqOfWordSync(written, extras))
  useEffect(() => {
    let live = true
    const now = freqOfWordSync(written, extras)
    if (now) {
      setHit(now)
      return () => {
        live = false
      }
    }
    void freqOfWord(written, extras).then((f) => {
      if (live) setHit(f)
    })
    return () => {
      live = false
    }
  }, [written, extra])
  const jlpt = dict ? wordJlpt(written, dict) : null
  return <FreqTag rank={hit?.r} kind={hit?.kind ?? 'word'} jlpt={jlpt} corpusN={hit?.n} common={common} />
}
