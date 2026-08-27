import { useEffect, useState } from 'react'
import { meaningLine } from '../lib/kanji'
import { radicalsOf, similarByMeaning, similarVisual } from '../lib/similar'
import type { KanjiDict } from '../types'

type Props = {
  char: string
  dict: KanjiDict
  onKanji: (ch: string) => void
}

function Chip({ ch, dict, onKanji }: { ch: string; dict: KanjiDict; onKanji: (ch: string) => void }) {
  return (
    <button type="button" className="chip" onClick={() => onKanji(ch)}>
      <span className="jp">{ch}</span>
      <small>{meaningLine(dict[ch], 1)}</small>
    </button>
  )
}

export function SimilarKanji({ char, dict, onKanji }: Props) {
  const [visual, setVisual] = useState<string[]>([])
  const [rads, setRads] = useState<string[]>([])
  const meaning = similarByMeaning(char, dict, 18)

  useEffect(() => {
    let live = true
    setVisual([])
    setRads([])
    void Promise.all([similarVisual(char, 30), radicalsOf(char)]).then(([v, r]) => {
      if (!live) return
      setVisual(v)
      setRads(r)
    })
    return () => {
      live = false
    }
  }, [char])

  if (!meaning.length && !visual.length) return null
  return (
    <section className="similar-kanji">
      {meaning.length ? (
        <>
          <p className="kicker">Похожие по смыслу</p>
          <div className="kanji-chips">
            {meaning.map((ch) => (
              <Chip key={`m-${ch}`} ch={ch} dict={dict} onKanji={onKanji} />
            ))}
          </div>
        </>
      ) : null}
      {visual.length ? (
        <>
          <p className="kicker">Похожие визуально</p>
          <div className="kanji-chips">
            {visual.map((ch) => (
              <Chip key={`v-${ch}`} ch={ch} dict={dict} onKanji={onKanji} />
            ))}
          </div>
        </>
      ) : null}
      {rads.length ? <p className="muted">Составные радикалы: {rads.join('、')}</p> : null}
    </section>
  )
}
