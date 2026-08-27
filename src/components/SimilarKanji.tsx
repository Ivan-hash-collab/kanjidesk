import { useEffect, useState } from 'react'
import { meaningLine } from '../lib/kanji'
import { kanjiWithRadical, radicalsOf, similarByRadical } from '../lib/radicals'
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
  const [similar, setSimilar] = useState<string[]>([])
  const [byRad, setByRad] = useState<{ rad: string; list: string[] }[]>([])
  const [rads, setRads] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setSimilar([])
    setByRad([])
    setRads([])
    void (async () => {
      const [sim, rds] = await Promise.all([similarByRadical(char), radicalsOf(char)])
      if (!live) return
      setSimilar(sim)
      setRads(rds)
      const groups = await Promise.all(
        rds.slice(0, 4).map(async (rad) => ({ rad, list: (await kanjiWithRadical(rad, 8)).filter((x) => x !== char) })),
      )
      if (live) setByRad(groups.filter((g) => g.list.length))
    })()
    return () => {
      live = false
    }
  }, [char])

  if (!similar.length && !byRad.length) return null
  return (
    <section className="similar-kanji">
      {similar.length ? (
        <>
          <p className="kicker">Похожие по значению/составу кандзи</p>
          <div className="kanji-chips">
            {similar.slice(0, 18).map((ch) => (
              <Chip key={ch} ch={ch} dict={dict} onKanji={onKanji} />
            ))}
          </div>
        </>
      ) : null}
      {byRad.length ? (
        <>
          <p className="kicker">Радикалы и где они встречаются</p>
          {byRad.map((g) => (
            <div key={g.rad} className="rad-group">
              <b className="jp rad-glyph">{g.rad}</b>
              <div className="kanji-chips">
                {g.list.map((ch) => (
                  <Chip key={ch} ch={ch} dict={dict} onKanji={onKanji} />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
      {rads.length ? <p className="muted">Радикалы: {rads.join('、')}</p> : null}
    </section>
  )
}
