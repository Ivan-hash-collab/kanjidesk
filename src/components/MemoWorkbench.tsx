import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { MemoSettings } from './MemoSettings'
import { StoryEditor } from './StoryEditor'
import {
  countHits,
  ensureStudySession,
  groupMemoRounds,
  joinMemoParts,
  memoApi,
  memoError,
  type BatchExtra,
  type MemoSession,
} from '../lib/memo'
import { ALL_SKILLS, DEFAULT_SKILLS, MNEMONIC_STYLES, type SkillId } from '../lib/skills'
import type { KanjiDict } from '../types'

type Props = {
  sid: number
  onReload: () => Promise<void> | void
  sess: MemoSession
  dict?: KanjiDict
  onOpenKanji?: (ch: string) => void
  onChangeSet?: () => void
}

function FindableText({ text, needle, hitI }: { text: string; needle: string; hitI: number }) {
  const curRef = useRef<HTMLElement | null>(null)
  const skip = useRef(false)
  useLayoutEffect(() => {
    if (!needle || skip.current) {
      skip.current = false
      return
    }
    curRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [needle, hitI])

  if (!needle) return <div className="agent-text">{text}</div>

  const parts: ReactNode[] = []
  let i = 0
  let n = 0
  while (i < text.length) {
    const j = text.indexOf(needle, i)
    if (j < 0) {
      parts.push(text.slice(i))
      break
    }
    if (j > i) parts.push(text.slice(i, j))
    const isCur = n === hitI
    parts.push(
      <mark key={n} ref={isCur ? curRef : undefined} className={isCur ? 'memo-hit is-cur' : 'memo-hit'}>
        <span className="jp">{needle}</span>
      </mark>,
    )
    n += 1
    i = j + needle.length
  }
  return <div className="agent-text">{parts}</div>
}

export function MemoWorkbench({ sid, sess, onReload, onChangeSet }: Props) {
  const [skills, setSkills] = useState<string[]>(DEFAULT_SKILLS)
  const [count, setCount] = useState(2)
  const [style, setStyle] = useState('visual-story')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [roundI, setRoundI] = useState(10_000)
  const [pageI, setPageI] = useState(0)
  const [needle, setNeedle] = useState('')
  const [hitI, setHitI] = useState(0)
  const [wide, setWide] = useState(false)
  const [edit, setEdit] = useState(false)
  const [chat, setChat] = useState('')
  const [reply, setReply] = useState('')
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState('')

  const rounds = useMemo(() => groupMemoRounds(sess.messages || []), [sess.messages])
  const latestRoundKey = rounds.at(-1)?.runId || rounds.at(-1)?.id || ''
  const ri = rounds.length ? Math.max(0, Math.min(roundI, rounds.length - 1)) : 0
  const round = rounds[ri]
  const pages = round?.parts.filter((p) => p.text.trim()) || []
  const pi = pages.length ? Math.max(0, Math.min(pageI, pages.length - 1)) : 0
  const shownText = wide ? round?.text || '' : pages[pi]?.text || ''
  const hits = needle ? countHits(shownText, needle) : 0
  const setChars = sess.kanji.map((k) => k.kanji)
  const done = sess.kanji.filter((k) => k.analyzed).length
  const left = sess.count - done

  useEffect(() => {
    void memoApi
      .settings()
      .then((r) => {
        setCfg(r.values)
        const picked = (r.values.active_skills || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (picked.length) setSkills(picked)
        const n = Number(r.values.mnemonic_count)
        if (n) setCount(n)
        if (r.values.mnemonic_style) setStyle(r.values.mnemonic_style)
      })
      .catch(() => undefined)
  }, [sid])

  useEffect(() => {
    if (!rounds.length) {
      setRoundI(0)
      return
    }
    setRoundI(rounds.length - 1)
  }, [latestRoundKey, rounds.length])

  useEffect(() => {
    setPageI(0)
  }, [ri])

  useEffect(() => {
    setHitI(0)
  }, [needle, ri, pi, wide])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable]')) return
      if (wide) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPageI((i) => Math.max(0, i - 1))
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPageI((i) => Math.min(Math.max(0, pages.length - 1), i + 1))
      }
      if (e.key === 'Tab' && needle && hits > 1) {
        if (!el?.closest('.memo-work')) return
        e.preventDefault()
        setHitI((n) => (e.shiftKey ? (n - 1 + hits) % hits : (n + 1) % hits))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [needle, hits, pages.length, wide])

  function toggleSkill(id: SkillId) {
    setSkills((cur) => {
      const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]
      return next.length ? next : cur
    })
  }

  function pickKanji(ch: string) {
    if (needle === ch && hits > 1) {
      setHitI((n) => (n + 1) % hits)
      return
    }
    setNeedle(ch)
    setHitI(0)
  }

  function extraBody(): BatchExtra {
    const v = cfg
    const num = (k: string, d: number) => {
      const x = Number(v[k])
      return Number.isFinite(x) ? x : d
    }
    return {
      skills,
      mnemonic_count: count,
      mnemonic_style: style,
      mnemonic_refs: v.mnemonic_refs,
      user_prompt: v.user_prompt || '',
      skill_len_mode: v.skill_len_mode || 'global',
      skill_len_global: num('skill_len_global', 2),
      skill_len_mnemonic: num('skill_len_mnemonic', 2),
      skill_len_decompose: num('skill_len_decompose', 2),
      skill_len_readings: num('skill_len_readings', 2),
      skill_len_lookalikes: num('skill_len_lookalikes', 2),
      skill_len_vocab: num('skill_len_vocab', 2),
      skill_len_etymology: num('skill_len_etymology', 2),
    }
  }

  async function runBatch(rewrite: boolean) {
    setErr('')
    setBusy(true)
    setProgress('')
    setReply('')
    try {
      await memoApi
        .saveSettings({
          ...cfg,
          mnemonic_count: String(count),
          mnemonic_style: style,
          active_skills: skills.join(','),
        })
        .then((r) => setCfg(r.values))
        .catch(() => undefined)
      const snap = extraBody()
      const detail = snap.skill_len_global ?? 2
      setApplied(`подробность ${detail} · ${style}`)
      const runId =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`
      const body = { ...snap, force: rewrite || left === 0, run_id: runId }
      const p = await memoApi.batchPlan(sid, body)
      if (!p.chunks.length) {
        setProgress(rewrite ? 'Нечего переписывать.' : 'У всех знаков уже есть разбор.')
        return
      }
      let prior = ''
      for (let i = 0; i < p.chunks.length; i++) {
        const group = p.chunks[i]?.kanji || []
        setProgress(`пачка ${i + 1} / ${p.chunks.length} · ${group.join('')}`)
        const payload = {
          ...body,
          chunk_index: 0,
          only: group,
          prior_text: prior,
        }
        let r = await memoApi.batchRun(sid, payload)
        if (rewrite && r._cached) {
          setProgress(`пачка ${i + 1} / ${p.chunks.length} · повтор без кэша`)
          r = await memoApi.batchRun(sid, {
            ...payload,
            run_id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `run-${Date.now()}-${i}`,
            force: true,
          })
        }
        if (r._error && !(r.text_ru || '').trim()) setErr(r._error)
        if (rewrite && r._cached) {
          setErr('Агент вернул старый кэш. Закрой KanjiDesk и открой через launch.py.')
        }
        prior = [prior, r.text_ru].filter(Boolean).join('\n\n')
        await onReload()
      }
      setRoundI(10_000)
      setPageI(0)
      setProgress('')
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onChat() {
    const q = chat.trim()
    if (!q) return
    setBusy(true)
    setErr('')
    try {
      const r = await memoApi.chatRun(sid, q)
      setReply(r.reply_ru || r.text_ru || '')
      setChat('')
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!confirm('Удалить весь сгенерированный разбор и историю этого набора? Заметки знаков останутся.')) return
    setBusy(true)
    setErr('')
    try {
      const r = await memoApi.deleteRun(sid)
      if (r.analyzed) throw new Error('Разбор не очистился на сервере')
      await onReload()
      setRoundI(0)
      setPageI(0)
      setReply('')
      setChat('')
      setEdit(false)
      setNeedle('')
      setProgress('')
      setApplied('')
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyShown() {
    try {
      await navigator.clipboard.writeText(shownText)
      setProgress('скопировано')
      setTimeout(() => setProgress(''), 1200)
    } catch {
      setErr('Не удалось скопировать')
    }
  }

  return (
    <div className={`memo-work ${wide ? 'is-wide' : ''}`}>
      <div className="memo-toolbar">
        <p className="memo-progress">
          {sess.count} знаков
          {done ? ` · готово ${done}` : ''}
        </p>
        {onChangeSet ? (
          <button type="button" className="btn ghost" onClick={onChangeSet} disabled={busy}>
            Закрыть набор
          </button>
        ) : null}
      </div>

      <div className="memo-setbar">
        <label className="check">
          Стиль
          <select className="field" value={style} onChange={(e) => setStyle(e.target.value)} disabled={busy}>
            {MNEMONIC_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          Вариантов
          <input
            className="field memo-num"
            type="number"
            min={1}
            max={4}
            value={count}
            disabled={busy}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </label>
        {left ? (
          <button type="button" className="btn primary" disabled={busy || !skills.length} onClick={() => void runBatch(false)}>
            Придумать для всех
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={busy || !skills.length} onClick={() => void runBatch(true)}>
            Новые истории
          </button>
        )}
      </div>

      <div className="memo-skills" role="group" aria-label="Что включить в истории">
        {ALL_SKILLS.map((s) => (
          <label key={s.id} className="check" title={s.hint}>
            <input
              type="checkbox"
              checked={skills.includes(s.id)}
              disabled={busy}
              onChange={() => toggleSkill(s.id)}
            />
            {s.label}
          </label>
        ))}
      </div>

      {busy ? <p className="muted">{progress || 'думаю над всем набором…'}</p> : null}
      {applied && !busy ? <p className="muted">В последнем запросе: {applied}</p> : null}
      {err ? <p className="status-bad">{err}</p> : null}

      {setChars.length ? (
        <div className="memo-anchors">
          {setChars.map((ch) => (
            <button
              key={ch}
              type="button"
              className={needle === ch ? 'is-on' : ''}
              aria-pressed={needle === ch}
              onClick={() => pickKanji(ch)}
            >
              {ch}
            </button>
          ))}
          {needle ? (
            <span className="memo-find">
              <button
                type="button"
                className="btn ghost"
                disabled={hits < 2}
                onClick={() => setHitI((n) => (n - 1 + Math.max(hits, 1)) % Math.max(hits, 1))}
              >
                ‹
              </button>
              {hits ? `${Math.min(hitI, hits - 1) + 1} / ${hits}` : '0 / 0'}
              <button
                type="button"
                className="btn ghost"
                disabled={hits < 2}
                onClick={() => setHitI((n) => (n + 1) % Math.max(hits, 1))}
              >
                ›
              </button>
              <button type="button" className="btn ghost" onClick={() => setNeedle('')}>
                снять
              </button>
            </span>
          ) : (
            <span className="memo-find muted">знак → первое вхождение · Tab — следующее</span>
          )}
        </div>
      ) : null}

      <div className="row-actions memo-letter-tools">
        <button type="button" className="btn" disabled={!shownText} onClick={() => void copyShown()}>
          Копировать сообщение
        </button>
        <button type="button" className="btn" disabled={!round} onClick={() => setWide((v) => !v)}>
          {wide ? 'Свернуть' : 'Развернуть'}
        </button>
        <button type="button" className="btn" disabled={!shownText} onClick={() => setEdit(true)}>
          В заметку / редактор
        </button>
        <button type="button" className="btn ghost" disabled={busy || !rounds.length} onClick={() => void onDelete()}>
          Удалить разбор
        </button>
      </div>

      {!rounds.length ? (
        <div className="card memo-empty-set">
          <p>Одно окно на ответ агента. Списки длиннее 10 знаков идут пачками; в развороте пачки склеены с разделителем.</p>
          <p className="muted">После полного разбора контекст пачек сбрасывается. Точечный вопрос подгружает только последний разбор.</p>
        </div>
      ) : (
        <article
          className="memo-letter"
          tabIndex={0}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {shownText ? (
            <FindableText text={shownText} needle={needle} hitI={hits ? hitI % hits : 0} />
          ) : (
            <p className="muted">В этом ответе не осталось текста — сгенерируйте заново.</p>
          )}
        </article>
      )}

      {pages.length && !wide ? (
        <div className="memo-pager">
          <button type="button" className="btn ghost" disabled={pi <= 0} onClick={() => setPageI(pi - 1)}>
            ‹
          </button>
          <b>
            {pi + 1} / {pages.length}
          </b>
          <span className="muted">пачек Gemini</span>
          <button
            type="button"
            className="btn ghost"
            disabled={pi >= pages.length - 1}
            onClick={() => setPageI(pi + 1)}
          >
            ›
          </button>
        </div>
      ) : null}

      {rounds.length > 1 && !wide ? (
        <div className="memo-pager">
          <button type="button" className="btn ghost" disabled={ri <= 0} onClick={() => setRoundI(ri - 1)}>
            ‹
          </button>
          <span className="muted">
            разбор {ri + 1} / {rounds.length}
            {ri === rounds.length - 1 ? ' · последний' : ''}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={ri >= rounds.length - 1}
            onClick={() => setRoundI(ri + 1)}
          >
            ›
          </button>
        </div>
      ) : null}

      {round ? (
        <form
          className="memo-chat"
          onSubmit={(e) => {
            e.preventDefault()
            void onChat()
          }}
        >
          <input
            className="field"
            value={chat}
            disabled={busy}
            placeholder="точечный вопрос по последнему разбору…"
            onChange={(e) => setChat(e.target.value)}
          />
          <button type="submit" className="btn" disabled={busy || !chat.trim()}>
            Спросить
          </button>
        </form>
      ) : null}
      {reply ? <div className="memo-bubble agent-text">{reply}</div> : null}

      <MemoSettings values={cfg} onChange={setCfg} disabled={busy} />

      <Dialog open={edit} onClose={() => setEdit(false)} wide labelledBy="story-editor-title">
        <StoryEditor
          text={wide ? round?.text || shownText : joinMemoParts(pages)}
          chars={setChars}
          onClose={() => setEdit(false)}
        />
      </Dialog>
    </div>
  )
}

export function useMemoSession(chars: string[], title: string) {
  const [sess, setSess] = useState<MemoSession | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    if (!chars.length) {
      setSess(null)
      setErr('')
      setBusy(false)
      return
    }
    setBusy(true)
    setErr('')
    try {
      const next = await ensureStudySession(chars, title)
      setSess(await memoApi.session(next.id))
    } catch (e) {
      setErr(memoError(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chars.join(''), title])

  return { sess, err, busy, reload }
}
