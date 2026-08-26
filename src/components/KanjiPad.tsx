import { useEffect, useState } from 'react'
import { persistKanjiFields } from '../lib/notesRepo'
import { META_EVENT, mnemonicOf, noteOf } from '../lib/storage'

type Props = {
  char: string
}

export function KanjiPad({ char }: Props) {
  const [note, setNote] = useState('')
  const [mnemo, setMnemo] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    const load = () => {
      setNote(noteOf(char))
      setMnemo(mnemonicOf(char))
    }
    load()
    setSaved('')
    window.addEventListener(META_EVENT, load)
    return () => window.removeEventListener(META_EVENT, load)
  }, [char])

  async function persist() {
    const res = await persistKanjiFields(char, { notes: note, mnemonic: mnemo })
    setSaved(res.ok ? 'сохранено' : res.error || 'не удалось сохранить')
  }

  return (
    <div className="kanji-pad">
      <label className="pad-field">
        <span className="kicker">Индивидуальная мнемоника</span>
        <textarea
          className="area compact"
          rows={4}
          value={mnemo}
          placeholder="Своя история на этот знак. Массовый импорт — в шапке словаря или в Мнемониках."
          onChange={(e) => setMnemo(e.target.value)}
          onBlur={persist}
        />
      </label>
      <label className="pad-field">
        <span className="kicker">Заметка</span>
        <textarea
          className="area compact"
          rows={4}
          value={note}
          placeholder="Что угодно: ссылки, путаница, примеры…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={persist}
        />
      </label>
      <button type="button" className="btn" onClick={() => void persist()}>
        Сохранить
      </button>
      {saved ? <span className="muted">{saved}</span> : null}
    </div>
  )
}
