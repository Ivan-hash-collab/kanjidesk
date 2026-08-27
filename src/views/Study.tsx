import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { HintBulb } from '../components/HintBulb'
import { FreqTag } from '../components/FreqTag'
import { GradeStamp } from '../components/GradeStamp'
import { ModeIcon } from '../components/ModeIcon'
import { ReadPills } from '../components/ReadPills'
import { Tip } from '../components/Tip'
import { WordRail } from '../components/WordRail'
import { Writer } from '../components/Writer'
import { WriteBoard } from '../components/WriteBoard'
import {
  gradeLabel,
  infoOf,
  jlptLabel,
  meaningLine,
  readingHintText,
} from '../lib/kanji'
import { buildMcq, type McqKind, type Question } from '../lib/quiz'
import { fmtMs, settingsSummary, summarize } from '../lib/quality'
import { speakJa } from '../lib/speech'
import {
  HISTORY_EVENT,
  clearStudyState,
  loadHistory,
  loadStudyState,
  markWritten,
  saveSessionReport,
  saveStudyState,
  withQuiz,
} from '../lib/storage'
import type { BusyInfo, ItemLog, KanjiDict, SessionReport, Settings, SheetTab, StudyIntent, StudyMode, WriteReport } from '../types'
import { SessionSummary } from './SessionSummary'

type Phase = 'setup' | 'run' | 'done'

type Props = {
  dict: KanjiDict
  chars: string[]
  title: string
  settings: Settings
  paused: boolean
  intent: StudyIntent | null
  onStats: () => void
  onBusy: (info: BusyInfo) => void
  onOpenSheet: (tab: SheetTab) => void
  onIntentHandled: () => void
  onOpenKanji?: (ch: string) => void
  onOpenWord?: (written: string) => void
  onLookup?: (q: string) => void
  onInner?: (inner: boolean) => void
  onSettings?: (s: Settings) => void
  onMode?: (mode: StudyMode) => void
  onMemo?: (chars: string[], title: string) => void
}

export type StudyApi = {
  pauseToSetup: () => void
  abortToHub: () => void
  stepBack: () => boolean
}

const TILES: {
  id: StudyMode
  name: string
  ja: string
  blurb: string
  tip: string
}[] = [
  { id: 'browse', name: 'Обзор', ja: 'Flashcard study', blurb: 'Знак, чтения, слова — без оценки', tip: 'Справочник. Не тест: в конце нет разбора с оценкой.' },
  { id: 'practice', name: 'Карточки', ja: 'Practice', blurb: 'Вспомнил — «знал / не знал»', tip: 'Одна карточка: сначала знак, потом ответ и оценка.' },
  { id: 'draw', name: 'Пропись', ja: 'Writing challenges', blurb: 'Штрихи по порядку', tip: 'Пиши черты. «Пропустить кандзи» всегда внизу.' },
  { id: 'mcq', name: 'Тест', ja: 'Quizzes', blurb: 'Четыре варианта: значение и чтение', tip: 'Каждый знак даёт по вопросу на каждую включённую опцию.' },
]

function mapMode(id: StudyMode): StudyMode {
  if (id === 'drill') return 'mcq'
  if (id === 'judge' || id === 'selfcheck') return 'practice'
  return id
}

function applyLimit(chars: string[], limit: number, doShuffle: boolean): string[] {
  const a = doShuffle ? [...chars].sort(() => Math.random() - 0.5) : chars.slice()
  return limit > 0 ? a.slice(0, limit) : a
}

export const StudyView = forwardRef<StudyApi, Props>(function StudyView(
  {
    dict,
    chars,
    title,
    settings,
    paused,
    intent,
    onStats,
    onBusy,
    onOpenSheet,
    onIntentHandled,
    onOpenKanji,
    onInner,
    onSettings,
    onMode,
    onMemo,
  },
  ref,
) {
  const [mode, setMode] = useState<StudyMode>('hub')
  const [phase, setPhase] = useState<Phase>('setup')
  const [shuffleOn, setShuffleOn] = useState(true)
  const [limit, setLimit] = useState(0)
  const [timerSec, setTimerSec] = useState(0)
  const [drawOutline, setDrawOutline] = useState(false)
  const [mcq, setMcq] = useState({ k2m: true, m2k: true, k2r: true, r2k: false })
  const [readQ, setReadQ] = useState('')

  const [i, setI] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [ok, setOk] = useState(0)
  const [bad, setBad] = useState(0)
  const [missed, setMissed] = useState<string[]>([])
  const [retry, setRetry] = useState(0)
  const [leftMs, setLeftMs] = useState(0)
  const [deck, setDeck] = useState<string[]>(chars)
  const [questions, setQuestions] = useState<Question[]>([])
  const [log, setLog] = useState<ItemLog[]>([])
  const [history, setHistory] = useState<SessionReport[]>(() => loadHistory())
  const [writeDone, setWriteDone] = useState(false)
  const [answers, setAnswers] = useState<(ItemLog | null)[]>([])
  const [sessionMs, setSessionMs] = useState(0)
  const [held, setHeld] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const logRef = useRef<ItemLog[]>([])
  const answersRef = useRef<(ItemLog | null)[]>([])
  const qRef = useRef<Question[]>([])
  const dRef = useRef<string[]>([])
  const startedItem = useRef(Date.now())
  const startedSession = useRef(Date.now())
  const repeated = useRef(new Set<string>())
  const finished = useRef(false)
  const nextTimer = useRef(0)
  const [setupErr, setSetupErr] = useState('')

  const nSession = chars.length

  function openMode(id: StudyMode) {
    setHeld(false)
    setMode(mapMode(id))
    setPhase('setup')
    setReadQ('')
    setSetupErr('')
    resetRun()
  }

  function resetRun() {
    window.clearTimeout(nextTimer.current)
    nextTimer.current = 0
    setI(0)
    setRevealed(false)
    setPicked(null)
    setOk(0)
    setBad(0)
    setMissed([])
    setRetry((x) => x + 1)
    setLeftMs(0)
    logRef.current = []
    setLog([])
    repeated.current = new Set()
    finished.current = false
    setWriteDone(false)
    setConfirmSkip(false)
    setConfirmRestart(false)
    answersRef.current = []
    setAnswers([])
  }

  function begin(fromChars?: string[], asMode?: StudyMode) {
    const useMode = mapMode(asMode ?? mode)
    if (asMode) setMode(useMode)
    const source = fromChars ?? chars
    const d = applyLimit(source, limit, shuffleOn)
    setDeck(d)
    dRef.current = d
    startedSession.current = Date.now()
    startedItem.current = Date.now()
    setReadQ('')
    if (useMode === 'mcq') {
      const kinds: McqKind[] = []
      if (mcq.k2m) kinds.push('k2m')
      if (mcq.m2k) kinds.push('m2k')
      if (mcq.k2r) kinds.push('k2r')
      if (mcq.r2k) kinds.push('r2k')
      const built = buildMcq(dict, d, kinds.length ? kinds : ['k2m'], 0, shuffleOn)
      setQuestions(built)
      qRef.current = built
      if (!built.length) {
        setSetupErr('Не получилось собрать тест: у знаков набора нет значений или чтений.')
        setPhase('setup')
        return
      }
    }
    resetRun()
    const n = useMode === 'mcq' ? qRef.current.length : d.length
    answersRef.current = Array.from({ length: n }, () => null)
    setAnswers(answersRef.current)
    setHeld(false)
    setPhase('run')
    saveStudyState({ chars: d, title, mode: useMode, index: 0, deck: d })
  }

  const q = questions[i]
  const char = mode === 'mcq' ? (q?.char ?? '') : (deck[i] ?? '')
  const info = infoOf(dict, char)
  const total = mode === 'mcq' ? qRef.current.length || questions.length : dRef.current.length || deck.length
  const qs = withQuiz(settings, mode)

  useEffect(() => {
    onMode?.(mode)
  }, [mode, onMode])

  useEffect(() => {
    const reload = () => setHistory(loadHistory())
    window.addEventListener(HISTORY_EVENT, reload)
    return () => window.removeEventListener(HISTORY_EVENT, reload)
  }, [])

  useImperativeHandle(ref, () => ({
    pauseToSetup() {
      setHeld(true)
      setPhase('setup')
    },
    abortToHub() {
      setHeld(false)
      resetRun()
      setMode('hub')
      setPhase('setup')
    },
    stepBack() {
      if (mode === 'hub' && phase !== 'done') return false
      if (phase === 'done') {
        setMode('hub')
        setPhase('setup')
        resetRun()
        return true
      }
      if (phase === 'run') {
        if (mode === 'browse') {
          setMode('hub')
          return true
        }
        onOpenSheet('leave')
        return true
      }
      if (phase === 'setup') {
        setMode('hub')
        return true
      }
      return false
    },
  }))

  useEffect(() => {
    onInner?.(mode !== 'hub' || phase === 'done')
  }, [mode, phase, onInner])

  useEffect(() => {
    if (!intent) return
    if (intent.mode === 'hub') {
      setHeld(false)
      resetRun()
      setMode('hub')
      setPhase('setup')
      onIntentHandled()
      return
    }
    const mapped = mapMode(intent.mode)
    if (intent.autoStart) {
      const saved = loadStudyState()
      if (saved && saved.mode === mapped && saved.chars.length && !intent.fromResume) {
        // Restore the saved run at its saved index (non-mcq decks replay cleanly).
        const d = saved.deck.length ? saved.deck : saved.chars
        setDeck(d)
        dRef.current = d
        answersRef.current = Array.from({ length: d.length }, () => null)
        setAnswers(answersRef.current)
        resetRun()
        setMode(mapped)
        setPhase('run')
        setI(Math.min(saved.index, Math.max(0, d.length - 1)))
        setHeld(false)
        startedSession.current = Date.now()
        if (mapped === 'mcq') {
          const kinds: McqKind[] = []
          if (mcq.k2m) kinds.push('k2m')
          if (mcq.m2k) kinds.push('m2k')
          if (mcq.k2r) kinds.push('k2r')
          if (mcq.r2k) kinds.push('r2k')
          const built = buildMcq(dict, d, kinds.length ? kinds : ['k2m'], 0, shuffleOn)
          setQuestions(built)
          qRef.current = built
        }
        saveStudyState({ ...saved, index: Math.min(saved.index, Math.max(0, d.length - 1)) })
      } else {
        begin(undefined, mapped)
      }
    } else {
      setMode(mapped)
      setHeld(false)
      setPhase('setup')
    }
    onIntentHandled()
    // begin is stable enough for a one-shot intent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  useEffect(() => {
    const writing = mode === 'draw'
    const active = phase === 'run' || held
    const name = TILES.find((t) => t.id === mode)?.ja ?? mode
    onBusy({
      active: active && mode !== 'hub' && mode !== 'browse',
      writing,
      label: `${name} · ${i + 1}/${Math.max(total, 1)}`,
    })
  }, [phase, held, mode, i, total, onBusy])

  useEffect(() => {
    const a = answers[i]
    if (a) {
      setRevealed(true)
      setPicked(a.picked ?? (a.correct ? 'ok' : 'bad'))
      setWriteDone(true)
    } else {
      setRevealed(false)
      setPicked(null)
      setWriteDone(false)
      startedItem.current = Date.now()
    }
  }, [i, answers])

  const record = useCallback(
    (ch: string, correct: boolean, extra?: { kind?: string; timeout?: boolean; write?: WriteReport; picked?: string }) => {
      const slots = answersRef.current.slice()
      while (slots.length <= i) slots.push(null)
      if (slots[i]) return
      if (correct) setOk((n) => n + 1)
      else {
        setBad((n) => n + 1)
        setMissed((m) => (m.includes(ch) ? m : [...m, ch]))
      }
      const item: ItemLog = {
        char: ch,
        kind: extra?.kind ?? mode,
        correct,
        timeout: extra?.timeout ?? false,
        timeMs: Date.now() - startedItem.current,
        quality: extra?.write?.quality ?? (correct ? (extra?.timeout ? 40 : 100) : 0),
        picked: extra?.picked,
        write: extra?.write,
      }
      slots[i] = item
      if (!correct && qs.repeatWrong && !repeated.current.has(ch)) {
        repeated.current.add(ch)
        slots.push(null)
        if (mode === 'mcq') {
          const cur = qRef.current[i]
          if (cur) {
            qRef.current = [...qRef.current, cur]
            setQuestions(qRef.current)
          }
        } else {
          dRef.current = [...dRef.current, ch]
          setDeck(dRef.current)
        }
      }
      answersRef.current = slots
      setAnswers(slots)
      logRef.current = slots.filter((x): x is ItemLog => Boolean(x))
      setLog(logRef.current)
    },
    [i, mode, qs.repeatWrong],
  )

  function finishWrite(ch: string, rep: WriteReport, kind: string) {
    markWritten(ch)
    onStats()
    record(ch, rep.quality >= (qs.passQuality || 55), { write: rep, kind })
    if (qs.speech) speakJa(ch, true)
    setWriteDone(true)
    if (qs.autoNext) scheduleNext(550)
  }

  function skipWrite(ch: string, kind: string, force = false) {
    if (answersRef.current[i]) {
      next()
      return
    }
    if (!writeDone && !confirmSkip && !force) {
      setConfirmSkip(true)
      return
    }
    setConfirmSkip(false)
    if (!writeDone) record(ch, false, { kind })
    next()
  }

  function skipCard() {
    if (answersRef.current[i]) {
      next()
      return
    }
    record(char, false, { kind: mode })
    next()
  }

  function finishSession() {
    if (finished.current) return
    finished.current = true
    const durationMs = Date.now() - startedSession.current
    setSessionMs(durationMs)
    setHeld(false)
    const items = logRef.current.map((x) => {
      if (!x.write) return x
      const write = { ...x.write }
      delete write.svg
      return { ...x, write }
    })
    const rep: SessionReport = {
      at: new Date().toISOString(),
      mode,
      title,
      durationMs,
      items,
    }
    setHistory(saveSessionReport(rep))
    setPhase('done')
    clearStudyState()
    onStats()
  }

  function goTo(n: number) {
    if (n < 0 || n >= total) return
    window.clearTimeout(nextTimer.current)
    nextTimer.current = 0
    setI(n)
    setConfirmSkip(false)
    setReadQ('')
    saveStudyState({ chars: dRef.current, title, mode, index: n, deck: dRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  function next() {
    if (mode === 'browse') {
      if (i >= total - 1) return
      goTo(i + 1)
      return
    }
    if (i >= total - 1) {
      if (answersRef.current[i]) finishSession()
      return
    }
    goTo(i + 1)
  }

  function scheduleNext(ms: number) {
    window.clearTimeout(nextTimer.current)
    nextTimer.current = window.setTimeout(() => next(), ms)
  }

  const timed =
    !paused &&
    !qs.disableTimeouts &&
    mode === 'mcq' &&
    timerSec > 0 &&
    phase === 'run' &&
    !picked
  useEffect(() => {
    if (!timed) return
    const ms = timerSec * 1000
    setLeftMs(ms)
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const left = ms - (Date.now() - t0)
      setLeftMs(left)
      if (left <= 0) {
        window.clearInterval(id)
        if (q) {
          if (answersRef.current[i]) return
          record(q.char, false, { kind: q.title, timeout: true })
          setPicked('__timeout__')
          scheduleNext(550)
        }
      }
    }, 50)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, i, retry])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== 'run' || paused) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (mode === 'browse') {
          next()
          return
        }
        if (answers[i] || (mode === 'draw' && writeDone) || (mode === 'mcq' && picked)) {
          next()
          return
        }
        if (mode === 'practice' && !revealed) {
          setRevealed(true)
          return
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (mode === 'browse' || answersRef.current[i]) goTo(Math.min(i + 1, Math.max(total - 1, 0)))
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(Math.max(i - 1, 0))
      }
      if (q && !picked && mode === 'mcq') {
        const idx = Number(e.key) - 1
        if (idx >= 0 && idx < q.options.length) chooseMcq(q.options[idx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function chooseMcq(opt: string) {
    if (!q || picked || answersRef.current[i]) return
    setPicked(opt)
    const correct = opt === q.answer
    record(q.char, correct, { kind: q.title, picked: opt })
    if (qs.speech) speakJa(q.char, true)
    if (qs.autoNext) scheduleNext(correct ? 500 : 900)
  }

  if (!nSession) {
    return (
      <div className="panel page">
        <header className="panel-head tight">
          <div>
            <p className="kicker">Учёба</p>
            <h2>Нет сессии</h2>
          </div>
        </header>
        <p className="empty">Сначала загрузи сессию на главной или открой список.</p>
      </div>
    )
  }

  if (mode === 'hub') {
    return (
      <div className="panel hub-panel page">
        <header className="panel-head tight">
          <div>
            <p className="kicker">{title}</p>
            <h2>Учёба · {nSession}</h2>
          </div>
        </header>
        <div className="mode-list">
          {TILES.map((t) => (
            <Tip key={t.id} label={t.tip}>
              <button type="button" className="mode-row" onClick={() => openMode(t.id)}>
                <ModeIcon id={t.id} />
                <span className="mode-copy">
                  <b>{t.name}</b>
                  <small>{t.blurb}</small>
                </span>
              </button>
            </Tip>
          ))}
          <Tip label="Истории на все знаки этого набора. Откроется вкладка Мнемоники.">
            <button
              type="button"
              className="mode-row"
              disabled={!chars.length || !onMemo}
              onClick={() => onMemo?.(chars, title)}
            >
              <ModeIcon id="memo" />
              <span className="mode-copy">
                <b>Мнемоники</b>
                <small>Создать истории по этому списку</small>
              </span>
            </button>
          </Tip>
        </div>
      </div>
    )
  }

  const tile = TILES.find((t) => t.id === mode)

  const writingMode = mode === 'draw'
  const lastRep = history.find((h) => h.mode === mode)
  const lastSum = lastRep ? summarize(lastRep.items) : null

  if (phase === 'setup') {
    return (
      <div className="panel setup-panel page">
        <header className="panel-head compact">
          <div>
            <p className="kicker">{title}</p>
            <h2>{tile?.name}</h2>
          </div>
        </header>
        {held ? (
          <div className="pause-banner">
            <p>
              Пауза · {i + 1}/{Math.max(total, 1)} · {ok}–{bad}
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setHeld(false)
                setPhase('run')
              }}
            >
              Продолжить
            </button>
          </div>
        ) : null}
        <div className="setup-ks">
          <div className="setup-cards">
            <div className="stat-bar">
              <div>
                <b>{lastRep ? fmtMs(lastRep.durationMs) : '—'}</b>
                <span>прошлое</span>
              </div>
              <div>
                <b>{limit || nSession}</b>
                <span>в круге</span>
              </div>
              <div>
                <b>{lastSum ? `${lastSum.accuracy}%` : '—'}</b>
                <span>точно</span>
              </div>
            </div>
            <div className="cfg-card">
              {mode !== 'browse' ? (
                <>
                  <label className="pref">
                    <span>
                      <b>Перемешать</b>
                      <small>Случайный порядок знаков</small>
                    </span>
                    <input type="checkbox" checked={shuffleOn} onChange={(e) => setShuffleOn(e.target.checked)} />
                  </label>
                  {nSession > 15 ? (
                    <label className="pref range-pref">
                      <span>
                        <b>Сколько знаков взять</b>
                        <small>
                          {limit || 'все'} из {nSession}. Нужно, когда список длинный — иначе круг будет из всех {nSession}. Ползунок влево = все.
                        </small>
                      </span>
                      <input type="range" min={0} max={Math.min(80, nSession)} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
                    </label>
                  ) : (
                    <p className="muted">В сессии {nSession} знаков — круг возьмёт все.</p>
                  )}
                </>
              ) : (
                <p className="muted">Листаешь набор без оценки. На последнем знаке круг не закрывается разбором.</p>
              )}

              {mode === 'mcq' ? (
                <>
                  {(
                    [
                      ['k2m', 'Кандзи → значение'],
                      ['m2k', 'Значение → кандзи'],
                      ['k2r', 'Кандзи → чтение'],
                      ['r2k', 'Чтение → кандзи'],
                    ] as const
                  ).map(([k, lab]) => (
                    <label key={k} className="pref">
                      <span>
                        <b>{lab}</b>
                        <small>{k === 'k2r' ? 'он и кун вместе' : k === 'r2k' ? 'обратное' : 'по одному вопросу на каждый знак'}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={mcq[k]}
                        onChange={(e) => setMcq({ ...mcq, [k]: e.target.checked })}
                      />
                    </label>
                  ))}
                  <label className="pref">
                    <span>
                      <b>Таймер</b>
                      <small>{timerSec ? `${timerSec} с на вопрос` : 'выкл — вопрос не обрывается'}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={timerSec > 0}
                      onChange={(e) => setTimerSec(e.target.checked ? 8 : 0)}
                    />
                  </label>
                  {timerSec > 0 ? (
                    <label className="pref range-pref">
                      <span>
                        <b>Секунд на вопрос</b>
                        <small>{timerSec} с</small>
                      </span>
                      <input type="range" min={3} max={20} value={timerSec} onChange={(e) => setTimerSec(Number(e.target.value))} />
                    </label>
                  ) : null}
                </>
              ) : null}

              {mode === 'draw' ? (
                <label className="pref">
                  <span>
                    <b>Контур на фоне</b>
                    <small>Тень знака на сетке</small>
                  </span>
                  <input type="checkbox" checked={drawOutline} onChange={(e) => setDrawOutline(e.target.checked)} />
                </label>
              ) : null}
            </div>
            <button type="button" className="cfg-line" onClick={() => onOpenSheet('settings')}>
              <span>⚙</span>
              <small>{settingsSummary(settings, writingMode, mode)}</small>
            </button>
          </div>
          <div className="setup-play">
            {held ? (
              confirmRestart ? (
                <div className="confirm-strip">
                  <p>Сбросить круг?</p>
                  <button type="button" className="btn bad" onClick={() => begin()}>
                    Да
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmRestart(false)}>
                    Нет
                  </button>
                </div>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirmRestart(true)}>
                  Заново
                </button>
              )
            ) : (
              <button type="button" className="play-orb" onClick={() => begin()} aria-label={`Начать ${limit || nSession}`}>
                ▶
              </button>
            )}
            {setupErr ? <p className="status-bad">{setupErr}</p> : null}
          </div>
        </div>
      </div>
    )
  }
  if (phase === 'done') {
    return (
      <SessionSummary
        modeLabel={tile?.ja || mode}
        items={log}
        durationMs={sessionMs}
        history={history}
        onAgain={() => begin()}
        onMissed={() => begin(missed)}
        onSetup={() => setPhase('setup')}
        onHub={() => {
          setMode('hub')
          setPhase('setup')
        }}
        onOpenKanji={onOpenKanji}
      />
    )
  }

  const timerPct = timed && timerSec ? Math.max(0, (leftMs / (timerSec * 1000)) * 100) : 0
  const locked = answers[i]

  function pickRead(r: string) {
    setReadQ((cur) => (cur === r ? '' : r))
  }

  return (
    <div className="panel study page-study">
      <header className="study-run-head">
        {mode === 'browse' ? (
          <p className="run-pills muted">обзор · без оценки · {i + 1}/{total || 1}</p>
        ) : (
          <div className="run-pills">
            <span>{i + 1}/{total || 1}</span>
            <span className="ok">✓ {ok}</span>
            <span className="bad">✕ {bad}</span>
          </div>
        )}
        <button type="button" className="btn head-gear" onClick={() => onOpenSheet('settings')} title="Настройки">
          ⚙
        </button>
        {char ? <HintBulb char={char} chars={chars} title={title} /> : null}
      </header>
      {timed ? <div className="timer-bar"><i style={{ width: `${timerPct}%` }} /></div> : <div className="timer-bar" />}

      {mode === 'browse' ? (
        <div className="browse-layout">
          <div className="flash prompt-stage">
            <div className="flash-meta">
              <span>{i + 1} / {total || 1}</span>
              <span>{jlptLabel(info?.jlpt) || gradeLabel(info?.grade) || ''}</span>
            </div>
            <p className="prompt-glyph jp">{char}</p>
            <ReadPills info={info} active={readQ} onReading={pickRead} max={8} />
            <p className="flash-mean">{meaningLine(info, 4)} <FreqTag rank={info?.freq} kind="kanji" /></p>
            <p className="meta">{info?.strokes ?? '—'} черт · чтение фильтрует слова справа, слово открывается тут же</p>
            <div className="flash-tools">
              <button type="button" className="btn" onClick={() => goTo(i - 1)}>Назад</button>
              <button type="button" className="btn" onClick={() => speakJa(char, qs.speech)}>Слушать</button>
              {i >= total - 1 ? (
                <button type="button" className="btn primary" onClick={() => setMode('hub')}>К режимам</button>
              ) : (
                <button type="button" className="btn primary" onClick={() => next()}>Дальше</button>
              )}
            </div>
            <Writer char={char} mode="animate" settings={qs} variant="preview" />
          </div>
          <WordRail
            char={char}
            dict={dict}
            furi={settings.furi}
            onFuri={(furi) => onSettings?.({ ...settings, furi })}
            showGloss={settings.showGloss}
            reading={readQ}
            onKanji={onOpenKanji}
          />
        </div>
      ) : null}

      {mode === 'practice' ? (
        <div className="study-main prompt-stage">
          <div className="prompt-stamp">
            <p className="prompt-glyph jp">{char}</p>
            {locked ? <GradeStamp quality={locked.quality} write={locked.write} /> : null}
          </div>
          {locked ? (
            <>
              <ReadPills info={info} active={readQ} onReading={pickRead} max={8} />
              <p className="flash-mean">{meaningLine(info, 6)}</p>
              <p className="self-ask">
                {locked.correct ? 'Отмечено: знал' : 'Отмечено: не знал'} · оценку сменить нельзя.
              </p>
              <div className="grade-row">
                <button type="button" className="btn primary" onClick={() => next()}>
                  Дальше
                </button>
              </div>
            </>
          ) : !revealed ? (
            <>
              <p className="self-ask">Вспомни значение и чтения, потом открой ответ.</p>
              <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
                Показать
              </button>
              <button type="button" className="btn skip-btn" onClick={skipCard}>Пропустить кандзи</button>
            </>
          ) : (
            <>
              <ReadPills info={info} active={readQ} onReading={pickRead} max={8} />
              <p className="flash-mean">{meaningLine(info, 6)}</p>
              <p className="self-ask">Совпало с тем, что ты вспомнил?</p>
              <div className="grade-row">
                <button type="button" className="btn bad" onClick={() => { record(char, false, { kind: 'practice', picked: 'missed' }); next() }}>Не знал</button>
                <button type="button" className="btn ok" onClick={() => { record(char, true, { kind: 'practice', picked: 'knew' }); next() }}>Знал</button>
              </div>
              <button type="button" className="btn skip-btn" onClick={skipCard}>Пропустить кандзи</button>
            </>
          )}
        </div>
      ) : null}

      {mode === 'mcq' && q ? (
        <div className="study-main prompt-stage quiz-wide">
          <p className="kicker">{q.title}</p>
          <p className={q.promptIsKanji ? 'prompt-glyph jp' : 'prompt-text'}>
            {qs.showKanji === 'blank' && q.promptIsKanji ? '＿' : qs.showKanji === 'reading' && q.promptIsKanji ? '？' : q.prompt}
          </p>
          {qs.readingHint && q.kind === 'k2r' && !picked ? (
            <p className="hint-mora">подсказка: {readingHintText(info, q.kind)}…</p>
          ) : null}
          <div className={q.optionsAreKanji ? 'mcq-kanji' : 'quiz-opts'}>
            {q.options.map((opt, idx) => {
              const state = picked == null ? '' : opt === q.answer ? 'is-ok' : opt === picked ? 'is-bad' : ''
              return (
                <button
                  key={`${opt}-${idx}`}
                  type="button"
                  className={state}
                  disabled={picked != null}
                  onClick={() => chooseMcq(opt)}
                >
                  <em>{idx + 1}</em>
                  {opt}
                </button>
              )
            })}
          </div>
          {picked && (!qs.autoNext || locked) ? (
            <button type="button" className="btn primary" onClick={() => next()}>Дальше</button>
          ) : null}
          {locked ? (
            <div className="mcq-stamp">
              <GradeStamp quality={locked.quality} write={locked.write} />
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'draw' ? (
        <WriteBoard
          char={char}
          index={i}
          total={total}
          infoStrokes={info?.strokes ?? null}
          locked={Boolean(locked)}
          retry={retry}
          qs={qs}
          drawOutline={drawOutline}
          revealed={revealed}
          confirmSkip={confirmSkip}
          writeDone={writeDone}
          lockedQuality={locked?.write?.quality ?? locked?.quality}
          lockedWrite={locked?.write}
          snapshot={locked?.write?.svg}
          readPills={<ReadPills info={info} active={readQ} onReading={pickRead} max={8} />}
          meaning={meaningLine(info, 3)}
          showReadPills={!(qs.hideAnswers && !revealed)}
          onReveal={() => setRevealed(true)}
          onFinish={(rep) => finishWrite(char, rep, 'draw')}
          onSkip={() => skipWrite(char, 'draw')}
          onNext={() => next()}
          onRetry={() => setRetry((x) => x + 1)}
          onCancelSkip={() => setConfirmSkip(false)}
        />
      ) : null}

      {readQ && mode !== 'browse' ? (
        <div className="lex-dock">
          <header className="lex-dock-head">
            <p className="kicker">Слова с чтением {readQ} · {char}</p>
            <button type="button" className="btn ghost" onClick={() => setReadQ('')}>
              Закрыть
            </button>
          </header>
          <WordRail
            char={char}
            dict={dict}
            furi={settings.furi}
            onFuri={(furi) => onSettings?.({ ...settings, furi })}
            showGloss={settings.showGloss}
            reading={readQ}
            onKanji={onOpenKanji}
          />
        </div>
      ) : null}
    </div>
  )
})
