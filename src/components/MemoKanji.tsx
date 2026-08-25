import { type FormEvent, useEffect, useState } from 'react'
import { Fold } from './Fold'
import { infoOf, meaningLine } from '../lib/kanji'
import { memoApi, memoError, readable, sessionForKanji } from '../lib/memo'
import { MEMO_TOPICS, type SkillId } from '../lib/skills'
import type { KanjiDict } from '../types'

type Topic = SkillId | 'ask'

type Props = {
  char: string
  chars: string[]
  title?: string
  sid?: number
  compact?: boolean
  hint?: boolean
  dict?: KanjiDict
  onOpenKanji?: (ch: string) => void
}

export function MemoKanji({ char, chars, title = 'KanjiDesk', sid, compact, hint, dict, onOpenKanji }: Props) {
  const [sessionId, setSessionId] = useState(sid ?? 0)
  const [brief, setBrief] = useState('')
  const [parts, setParts] = useState<Partial<Record<SkillId, string>>>({})
  const [topic, setTopic] = useState<Topic>('mnemonic')
  const [reply, setReply] = useState('')
  const [chat, setChat] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const studyKey = chars.join('')
  const info = dict ? infoOf(dict, char) : null

  useEffect(() => {
    if (!char) return
    let stop = false
    setErr('')
    setParts({})
    setReply('')
    setBrief('')
    setTopic('mnemonic')
    void (async () => {
      try {
        const id = sid ?? (await sessionForKanji(char, chars, title)).id
        if (stop) return
        setSessionId(id)
        const r = await memoApi.entry(id, char)
        if (stop) return
        setBrief(readable(r.entry.briefing || null))
      } catch (e) {
        if (!stop) setErr(memoError(e))
      }
    })()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, studyKey, title, sid])

  async function runSkill(name: SkillId) {
    if (!sessionId) return
    setBusy(true)
    setErr('')
    try {
      const r = await memoApi.skill(sessionId, char, name)
      setParts((prev) => ({ ...prev, [name]: readable(r) || 'Нет текста.' }))
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault()
    if (!sessionId || !chat.trim()) return
    setBusy(true)
    setErr('')
    try {
      const r = await memoApi.chat(sessionId, char, chat.trim())
      setReply(r.reply_ru || r.text_ru || '')
      setChat('')
    } catch (ex) {
      setErr(memoError(ex))
    } finally {
      setBusy(false)
    }
  }

  if (!char) return null

  const current = MEMO_TOPICS.find((t) => t.id === topic)
  const shown =
    topic === 'ask'
      ? ''
      : topic === 'mnemonic'
        ? parts.mnemonic || brief
        : parts[topic] || ''

  if (hint) {
    return (
      <div className="memo-kanji is-hint">
        {brief || parts.mnemonic ? <div className="agent-text">{parts.mnemonic || brief}</div> : <p className="muted">Истории агента ещё нет.</p>}
        <button type="button" className="btn primary" disabled={busy || !sessionId} onClick={() => void runSkill('mnemonic')}>
          Придумать историю
        </button>
        {busy ? <p className="muted">думаю…</p> : null}
        {err ? <p className="status-bad">{err}</p> : null}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="memo-kanji is-compact">
        {brief || parts.mnemonic ? (
          <div className="agent-text">{parts.mnemonic || brief}</div>
        ) : (
          <p className="muted">Истории для этого знака ещё нет.</p>
        )}
        <button type="button" className="btn primary" disabled={busy || !sessionId} onClick={() => void runSkill('mnemonic')}>
          {brief || parts.mnemonic ? 'Другой вариант' : 'Придумать историю'}
        </button>
        {busy ? <p className="muted">думаю…</p> : null}
        {err ? <p className="status-bad">{err}</p> : null}
        <Fold title="Спросить">
          <form className="memo-chat" onSubmit={(e) => void onChat(e)}>
            <input className="field" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="чем отличается от похожего знака?" disabled={busy || !sessionId} />
            <button type="submit" className="btn" disabled={busy || !sessionId}>
              Спросить
            </button>
          </form>
          {reply ? <div className="memo-bubble">{reply}</div> : null}
        </Fold>
      </div>
    )
  }

  return (
    <article className="memo-stage">
      <div className="memo-stage-head">
        <p className="prompt-glyph jp">{char}</p>
        <p className="flash-mean">{meaningLine(info, 3)}</p>
        {onOpenKanji ? (
          <button type="button" className="btn ghost" onClick={() => onOpenKanji(char)}>
            В словарь
          </button>
        ) : null}
      </div>
      <div className="seg memo-topics">
        {MEMO_TOPICS.map((t) => (
          <button key={t.id} type="button" className={topic === t.id ? 'is-on' : ''} onClick={() => setTopic(t.id)}>
            {t.label}
          </button>
        ))}
        <button type="button" className={topic === 'ask' ? 'is-on' : ''} onClick={() => setTopic('ask')}>
          Спросить
        </button>
      </div>
      {topic === 'ask' ? (
        <div className="memo-body">
          <p className="muted">Вопрос только про этот знак. Другие дни агент не помнит.</p>
          <form className="memo-chat" onSubmit={(e) => void onChat(e)}>
            <input
              className="field"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder="чем 本 отличается от 木?"
              disabled={busy || !sessionId}
            />
            <button type="submit" className="btn primary" disabled={busy || !sessionId}>
              Спросить
            </button>
          </form>
          {reply ? <div className="agent-text">{reply}</div> : null}
        </div>
      ) : (
        <div className="memo-body">
          {shown ? (
            <div className="agent-text">{shown}</div>
          ) : (
            <div className="memo-empty">
              <p className="muted">{current?.empty}</p>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !sessionId || !current}
                onClick={() => current && void runSkill(current.id)}
              >
                {current?.cta}
              </button>
            </div>
          )}
          {shown && current ? (
            <button type="button" className="btn ghost" disabled={busy || !sessionId} onClick={() => void runSkill(current.id)}>
              Другой вариант
            </button>
          ) : null}
        </div>
      )}
      {busy ? <p className="muted">думаю…</p> : null}
      {err ? <p className="status-bad">{err}</p> : null}
    </article>
  )
}
