import { useEffect, useState } from 'react'
import { MemoKanji } from './MemoKanji'
import { persistNote } from '../lib/notesRepo'
import { noteOf } from '../lib/storage'

type Props = {
  char: string
  chars?: string[]
  title?: string
  locked?: boolean
}

export function HintBulb({ char, chars = [], title = 'KanjiDesk', locked }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [has, setHas] = useState(false)

  useEffect(() => {
    const n = noteOf(char)
    setText(n)
    setHas(Boolean(n))
    setOpen(false)
  }, [char])

  if (!char) return null
  return (
    <div className="hint-wrap">
      <button
        type="button"
        className={`hint-bulb ${has ? 'has-note' : ''} ${open ? 'is-on' : ''}`}
        title={has ? 'Подсказка' : 'Нет записи — нажми, чтобы добавить'}
        onClick={() => setOpen((v) => !v)}
        disabled={locked && !has}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path
            d="M9 21h6M12 3a6 6 0 0 0-3 11c.5.6 1 1.4 1 2h4c0-.6.5-1.4 1-2A6 6 0 0 0 12 3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="hint-pop">
          <p className="kicker">Запись для {char}</p>
          <textarea
            className="area compact"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Своя мнемоника или подсказка"
          />
          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void persistNote(char, text).then((res) => {
                  if (!res.ok) return
                  setHas(Boolean(text.trim()))
                  setOpen(false)
                })
              }}
            >
              Сохранить
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
          <p className="kicker">История</p>
          <MemoKanji char={char} chars={chars.length ? chars : [char]} title={title} hint />
        </div>
      ) : null}
    </div>
  )
}
