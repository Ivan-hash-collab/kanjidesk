import { useEffect, useState } from 'react'
import { meaningLine } from '../lib/kanji'
import { kanjiWithRadical, radicalCount, radicalsOf } from '../lib/similar'
import type { KanjiDict } from '../types'

type Props = {
  rad: string
  dict: KanjiDict
  onKanji: (ch: string) => void
}

export function RadicalCard({ rad, dict, onKanji }: Props) {
  const [list, setList] = useState<string[]>([])
  const [own, setOwn] = useState<string[]>([])
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    setList([])
    setOwn([])
    setTotal(null)
    void Promise.all([kanjiWithRadical(rad, 60), radicalsOf(rad), radicalCount(rad)]).then(([l, o, n]) => {
      if (!live) return
      setList(l)
      setOwn(o)
      setTotal(n)
    })
    return () => {
      live = false
    }
  }, [rad])

  return (
    <section className="radical-card">
      <p className="kicker">
        Радикал {rad}
        {total != null ? ` · входит в ${total} кандзи` : ''}
      </p>
      <p className="muted">Это радикал, а не кандзи: здесь только знаки, в состав которых он входит.</p>
      {list.length ? (
        <div className="kanji-chips">
          {list.map((ch) => (
            <button key={ch} type="button" className="chip" onClick={() => onKanji(ch)}>
              <span className="jp">{ch}</span>
              <small>{meaningLine(dict[ch], 1) || '—'}</small>
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
