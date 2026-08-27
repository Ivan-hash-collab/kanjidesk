import { useEffect, useState } from 'react'
import { meaningLine } from '../lib/kanji'
import { kanjiWithRadical, radicalsOf } from '../lib/similar'
import type { KanjiDict } from '../types'

type Props = {
  rad: string
  dict: KanjiDict
  onKanji: (ch: string) => void
}

export function RadicalCard({ rad, dict, onKanji }: Props) {
  const [list, setList] = useState<string[]>([])
  const [own, setOwn] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setList([])
    setOwn([])
    void Promise.all([kanjiWithRadical(rad, 40), radicalsOf(rad)]).then(([l, o]) => {
      if (!live) return
      setList(l)
      setOwn(o)
    })
    return () => {
      live = false
    }
  }, [rad])

  return (
    <section className="radical-card">
      <p className="kicker">Кандзи, где встречается радикал {rad}</p>
      {list.length ? (
        <div className="kanji-chips">
          {list.map((ch) => (
            <button key={ch} type="button" className="chip" onClick={() => onKanji(ch)}>
              <span className="jp">{ch}</span>
              <small>{meaningLine(dict[ch], 1)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Нет знаков с этим радикалом в открытых данных.</p>
      )}
      {own.length ? <p className="muted">Сам состоит из: {own.join('、')}</p> : null}
    </section>
  )
}
