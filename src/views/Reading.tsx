import { useMemo, useState } from 'react'
import { RubyText } from '../components/Ruby'
import { READINGS } from '../data/readings'
import type { Reading } from '../data/readings'
import { uniqueKanji } from '../lib/kanji'
import { speakJa } from '../lib/speech'
import type { FuriMode } from '../types'

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const

type Props = {
  session: string[]
  speech: boolean
  furi: FuriMode
  onKanji: (ch: string) => void
  onStudyKanji: (chars: string[]) => void
}

export function ReadingView({ session, speech, furi, onKanji, onStudyKanji }: Props) {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('N5')
  const [id, setId] = useState(READINGS[0].id)
  const [showTr, setShowTr] = useState(false)

  const list = useMemo(() => READINGS.filter((r) => r.level === level), [level])
  const current: Reading = list.find((r) => r.id === id) ?? list[0]
  const sessionSet = useMemo(() => new Set(session), [session])
  const chars = useMemo(() => uniqueKanji(current.body), [current.body])

  return (
    <div className="panel reading-view page">
      <header className="panel-head">
        <div>
          <p className="kicker">Graded reading</p>
          <h2>Наборы чтения</h2>
        </div>
        <p className="lede">
          Свои тексты по уровням JLPT — не платные наборы из телефона. Кандзи из текущей
          сессии подчёркнуты красным.
        </p>
      </header>

      <div className="seg">
        {LEVELS.map((lv) => (
          <button
            key={lv}
            type="button"
            className={lv === level ? 'is-on' : ''}
            onClick={() => {
              setLevel(lv)
              const first = READINGS.find((r) => r.level === lv)
              if (first) setId(first.id)
              setShowTr(false)
            }}
          >
            {lv}
          </button>
        ))}
      </div>

      <div className="reading-layout">
        <aside className="reading-nav">
          {list.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`reading-nav-item ${r.id === current.id ? 'is-on' : ''}`}
              onClick={() => {
                setId(r.id)
                setShowTr(false)
              }}
            >
              <span>{r.titleJa}</span>
              <small>{r.title}</small>
            </button>
          ))}
        </aside>
        <article className="reading-sheet">
          <h3>
            {current.titleJa}
            <small>{current.title}</small>
          </h3>
          <RubyText text={current.body} highlight={sessionSet} furi={furi} onKanji={onKanji} />
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => speakJa(current.body.replace(/\[[^\]]+\]/g, ''), speech)}>
              Слушать
            </button>
            <button type="button" className="btn" onClick={() => setShowTr((v) => !v)}>
              {showTr ? 'Скрыть перевод' : 'Показать перевод'}
            </button>
            <button type="button" className="btn primary" onClick={() => onStudyKanji(chars)}>
              Прописать кандзи текста
            </button>
          </div>
          {showTr ? <p className="translation">{current.translation}</p> : null}
        </article>
      </div>
    </div>
  )
}
