import { type FormEvent, useEffect, useState } from 'react'
import { memoApi, memoError } from '../lib/memo'

type KeyStatus = { configured: boolean; hint: string }

export function GeminiKeyField() {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    void memoApi
      .geminiKey()
      .then((r) => {
        setStatus(r)
        setOffline(false)
      })
      .catch(() => setOffline(true))
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      const r = await memoApi.saveGeminiKey(key)
      setStatus(r)
      setKey('')
      setShow(false)
      setMsg('Ключ сохранён — мнемоники пойдут через Gemini')
    } catch (ex) {
      setErr(memoError(ex))
    } finally {
      setBusy(false)
    }
  }

  async function onClear() {
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      const r = await memoApi.clearGeminiKey()
      setStatus(r)
      setKey('')
      setMsg('Ключ удалён')
    } catch (ex) {
      setErr(memoError(ex))
    } finally {
      setBusy(false)
    }
  }

  if (offline) {
    return (
      <div className="api-key-field">
        <p className="muted">
          Поле ключа откроется, когда агент запущен. В готовом приложении это KanjiDesk.exe; при разработке —{' '}
          <code>launch.py</code>.
        </p>
      </div>
    )
  }

  return (
    <form className="api-key-field" onSubmit={(e) => void onSave(e)}>
      <p className="api-key-status">
        {status?.configured ? (
          <>
            Ключ сохранён {status.hint ? <span className="api-key-hint">{status.hint}</span> : null}
          </>
        ) : (
          'Ключ не задан — словарь и пропись работают без него'
        )}
      </p>
      <label className="api-key-row">
        <span className="sr-only">Ключ Gemini API</span>
        <input
          className="field"
          type={show ? 'text' : 'password'}
          value={key}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          placeholder={status?.configured ? 'Вставить новый ключ' : 'Вставить ключ Gemini'}
          onChange={(e) => {
            setKey(e.target.value)
            setMsg('')
            setErr('')
          }}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          {show ? 'Скрыть' : 'Показать'}
        </button>
      </label>
      <p className="muted">
        Бесплатный ключ — на{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Google AI Studio
        </a>
        . Хранится только на этом компьютере.
      </p>
      <div className="row-actions">
        <button type="submit" className="btn primary" disabled={busy || !key.trim()}>
          Сохранить ключ
        </button>
        {status?.configured ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void onClear()}>
            Удалить
          </button>
        ) : null}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>
      {err ? <p className="status-bad">{err}</p> : null}
    </form>
  )
}
