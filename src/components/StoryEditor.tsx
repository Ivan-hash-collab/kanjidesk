import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { memoApi, memoError } from '../lib/memo'
import { persistAppendNote, persistMnemonic } from '../lib/notesRepo'

const PRESETS = [
  { id: 'summarize', label: 'Кратко', cmd: 'summarize: сожми до сути, по-русски' },
  { id: 'elaborate', label: 'Разверни', cmd: 'elaborate: дополни деталями, не меняя смысл' },
  { id: 'longer', label: 'Длиннее', cmd: 'make longer: сделай текст длиннее и образнее' },
  { id: 'deeper', label: 'Глубже', cmd: 'explain deeper: объясни глубже, как устроено' },
]

type AskProps = {
  excerpt: string
  onClose: () => void
  onReplace: (text: string) => void
  onInsert: (text: string) => void
}

function AskGemini({ excerpt, onClose, onReplace, onInsert }: AskProps) {
  const [cmd, setCmd] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run(command: string) {
    const c = command.trim()
    if (!c) return
    setBusy(true)
    setErr('')
    try {
      const r = await memoApi.snippet(excerpt, c)
      setReply(r.reply_ru || r.text_ru || '')
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ask-gemini">
      <header className="panel-head tight">
        <div>
          <p className="kicker">Один запрос</p>
          <h3 id="ask-gemini-title">Спросить Gemini</h3>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <p className="muted">Фрагмент уйдёт в одноразовый контекст. После ответа контекст не копится.</p>
      <blockquote className="ask-quote">
        {excerpt.slice(0, 600)}
        {excerpt.length > 600 ? '…' : ''}
      </blockquote>
      <div className="row-actions wrap">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="btn" disabled={busy} onClick={() => void run(p.cmd)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="memo-chat">
        <input
          className="field"
          value={cmd}
          placeholder="своя команда…"
          disabled={busy}
          onChange={(e) => setCmd(e.target.value)}
        />
        <button type="button" className="btn primary" disabled={busy || !cmd.trim()} onClick={() => void run(cmd)}>
          Спросить
        </button>
      </div>
      {busy ? <p className="muted">думаю…</p> : null}
      {err ? <p className="status-bad">{err}</p> : null}
      {reply ? <div className="agent-text">{reply}</div> : null}
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={!reply} onClick={() => onReplace(reply)}>
          Заменить выделенное
        </button>
        <button type="button" className="btn" disabled={!reply} onClick={() => onInsert(reply)}>
          Вставить у курсора
        </button>
        <button
          type="button"
          className="btn"
          disabled={!reply}
          onClick={() => void navigator.clipboard.writeText(reply)}
        >
          Копировать ответ
        </button>
      </div>
    </div>
  )
}

type Props = {
  text: string
  chars: string[]
  onClose: () => void
}

export function StoryEditor({ text, chars, onClose }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState(text)
  const [pick, setPick] = useState(chars[0] || '')
  const [ask, setAsk] = useState('')
  const [msg, setMsg] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; sel: string } | null>(null)
  const dirty = body !== text

  useEffect(() => setBody(text), [text])

  function requestClose() {
    if (dirty && !confirm('Закрыть редактор? Несохранённый текст заметки пропадёт.')) return
    onClose()
  }

  function selected(): string {
    const el = area.current
    if (!el) return ''
    return el.value.slice(el.selectionStart, el.selectionEnd)
  }

  async function addToNote(asMnemonic: boolean) {
    const sel = selected() || body
    if (!pick || !sel.trim()) {
      setMsg('Выделите текст и знак')
      return
    }
    const saved = asMnemonic ? await persistMnemonic(pick, sel) : await persistAppendNote(pick, sel)
    if (!saved.ok) {
      setMsg(saved.error || 'Не удалось сохранить на сервере')
      return
    }
    setMsg(asMnemonic ? `Мнемоника для ${pick}` : `В заметку ${pick}`)
  }

  function replaceSel(next: string) {
    const el = area.current
    if (!el) return
    const a = el.selectionStart
    const b = el.selectionEnd
    const v = el.value.slice(0, a) + next + el.value.slice(b)
    setBody(v)
    setAsk('')
  }

  function insertAt(next: string) {
    const el = area.current
    if (!el) {
      setBody((v) => v + next)
      setAsk('')
      return
    }
    const i = el.selectionStart
    setBody(el.value.slice(0, i) + next + el.value.slice(i))
    setAsk('')
  }

  return (
    <div className="story-editor">
      <header className="panel-head tight">
        <div>
          <p className="kicker">Редактор разбора</p>
          <h3 id="story-editor-title">Заметка из текста Gemini</h3>
        </div>
        <button type="button" className="btn ghost" onClick={requestClose}>
          Закрыть
        </button>
      </header>
      <p className="muted">Выделите кусок → в заметку или в индивидуальную мнемонику. ПКМ по выделению — спросить Gemini.</p>
      <label className="pref">
        <span>
          <b>Знак</b>
        </span>
        <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
          {chars.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </label>
      <textarea
        ref={area}
        className="area story-area"
        rows={16}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onContextMenu={(e) => {
          const sel = selected()
          if (!sel.trim()) return
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, sel })
        }}
      />
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={() => void addToNote(false)}>
          В заметку
        </button>
        <button type="button" className="btn" onClick={() => void addToNote(true)}>
          В мнемонику знака
        </button>
        <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(body)}>
          Копировать всё
        </button>
      </div>
      {msg ? <p className="muted">{msg}</p> : null}
      {menu ? (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y, zIndex: 240 }}>
          <button
            type="button"
            onClick={() => {
              setAsk(menu.sel)
              setMenu(null)
            }}
          >
            Спросить Gemini
          </button>
          <button type="button" onClick={() => setMenu(null)}>
            Отмена
          </button>
        </div>
      ) : null}
      <Dialog open={Boolean(ask)} onClose={() => setAsk('')} labelledBy="ask-gemini-title">
        <AskGemini
          excerpt={ask}
          onClose={() => setAsk('')}
          onReplace={(t) => replaceSel(t)}
          onInsert={(t) => insertAt(t)}
        />
      </Dialog>
    </div>
  )
}
