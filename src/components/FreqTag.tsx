import { useEffect, useState } from 'react'
import { freqOfWord } from '../lib/freq'
import { jlptLabel, uniqueKanji } from '../lib/kanji'
import type { KanjiDict } from '../types'

type Props = {
  rank: number | null | undefined
  kind: 'kanji' | 'word'
  jlpt?: number | null
  corpusN?: number | null
}

export function FreqTag({ rank, kind, jlpt, corpusN }: Props) {
  const bits: string[] = []
  if (jlpt) bits.push(jlptLabel(jlpt))
  if (rank && rank > 0) {
    const hint = rank <= 500 ? 'очень частое' : rank <= 1500 ? 'частое' : rank <= 5000 ? 'среднее' : 'редкое'
    bits.push(kind === 'kanji' ? `кандзи #${rank}` : `корпус #${rank}`)
    if (corpusN != null && kind === 'word') bits.push(`${corpusN.toLocaleString('ru-RU')} вхожд.`)
    return (
      <span className="freq-tag" title={`${hint}${jlpt ? ` · ${jlptLabel(jlpt)}` : ''} · ${kind === 'word' ? 'корпус, не JLPT' : 'частотный список кандзи'}`}>
        {bits.join(' · ')}
      </span>
    )
  }
  if (jlpt) {
    return (
      <span className="freq-tag" title={jlptLabel(jlpt)}>
        {jlptLabel(jlpt)}
      </span>
    )
  }
  return null
}

export function WordRank({
  written,
  alts,
  kana,
  dict,
}: {
  written: string
  alts?: string[]
  kana?: string
  dict?: KanjiDict
}) {
  const [hit, setHit] = useState<{ r: number; n?: number; kind: 'word' | 'kanji' } | null>(null)
  const extra = [kana, ...(alts ?? [])].filter(Boolean).join('\0')
  useEffect(() => {
    let live = true
    const extras = extra ? extra.split('\0') : []
    void freqOfWord(written, extras).then((f) => {
      if (live) setHit(f)
    })
    return () => {
      live = false
    }
  }, [written, extra])
  const jlpts = dict
    ? uniqueKanji(written)
        .map((ch) => dict[ch]?.jlpt)
        .filter((n): n is number => Boolean(n))
    : []
  const jlpt = jlpts.length ? Math.min(...jlpts) : null
  return <FreqTag rank={hit?.r} kind={hit?.kind ?? 'word'} jlpt={jlpt} corpusN={hit?.n} />
}
