import { useEffect, useReducer, useRef, useState } from 'react'
import { BackBtn } from './components/BackBtn'
import { HelpBlurb, Sheet } from './components/Sheet'
import { QuizSetup } from './components/QuizSetup'
import { Tip } from './components/Tip'
import { AboutView } from './views/About'
import { DictionaryView, type DictApi } from './views/Dictionary'
import { HomeView } from './views/Home'
import { ListsView } from './views/Lists'
import { MnemonicsView } from './views/Mnemonics'
import { StudyView, type StudyApi } from './views/Study'
import { loadDict, uniqueKanji } from './lib/kanji'
import { initialNav, navReducer } from './lib/appNav'
import { preloadStrokes } from './lib/strokes'
import { defaultSettings, factoryReset, isQuizId, loadLastSession, loadSettings, loadStats, saveLastSession, saveSettings } from './lib/storage'
import { clearAllNotes } from './lib/notesRepo'
import type { BusyInfo, KanjiDict, Settings, StudyIntent, StudyMode, ViewId } from './types'

const NAV: { id: ViewId; label: string; tip: string }[] = [
  { id: 'home', label: 'Главная', tip: 'Серия, загрузка из Anki, вставка набора' },
  { id: 'study', label: 'Учёба', tip: 'Обзор, карточки, пропись, тесты' },
  { id: 'lists', label: 'Списки', tip: 'Папки, предпросмотр, JLPT и школа' },
  { id: 'dict', label: 'Словарь', tip: 'Кандзи, слова, деревья радикалов, примеры' },
  { id: 'memo', label: 'Мнемоники', tip: 'набор целиком: сначала список, потом истории' },
  { id: 'about', label: 'Справка', tip: 'Как пользоваться и откат к заводским' },
]

const EMPTY_BUSY: BusyInfo = { active: false, writing: false, label: '' }

export default function App() {
  const [dict, setDict] = useState<KanjiDict | null>(null)
  const [err, setErr] = useState('')
  const [nav, dispatch] = useReducer(navReducer, null, () => initialNav(loadLastSession(), 'Последняя сессия'))
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [stats, setStats] = useState(() => loadStats())
  const [busy, setBusy] = useState<BusyInfo>(EMPTY_BUSY)
  const [intent, setIntent] = useState<StudyIntent | null>(null)
  const [studyInner, setStudyInner] = useState(false)
  const [studyMode, setStudyMode] = useState<StudyMode>('hub')
  const [dictDepth, setDictDepth] = useState(0)
  const studyRef = useRef<StudyApi>(null)
  const dictRef = useRef<DictApi>(null)

  const { view, session, title, sheet, pending, memoOpen, dictFocus, dictWord, dictQuery, settingsKind, trail } = nav

  useEffect(() => {
    loadDict()
      .then(setDict)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'ошибка загрузки'))
    void preloadStrokes()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark)
    saveSettings(settings)
  }, [settings])

  function start(chars: string[], name: string, next?: { mode: StudyMode; autoStart?: boolean }) {
    const nextIntent: StudyIntent = {
      nonce: Date.now(),
      mode: next?.mode ?? 'hub',
      autoStart: next?.autoStart ?? false,
    }
    if (busy.active) {
      dispatch({ type: 'start', chars, title: name, intent: nextIntent, busy: true })
      return
    }
    saveLastSession(chars)
    dispatch({ type: 'start', chars, title: name, intent: nextIntent })
    setIntent(nextIntent)
  }

  function openMemo(chars: string[], name: string) {
    if (busy.active) {
      dispatch({ type: 'memo', chars, title: name, busy: true })
      return
    }
    saveLastSession(chars)
    dispatch({ type: 'memo', chars, title: name })
  }

  function goHome() {
    if (busy.active) {
      dispatch({ type: 'request', view: 'home', busy: true })
      return
    }
    studyRef.current?.abortToHub()
    dictRef.current?.reset()
    setDictDepth(0)
    dispatch({ type: 'home' })
  }

  function goBack() {
    if (view === 'dict' && dictRef.current?.back()) return
    if (view === 'study') {
      if (studyRef.current?.stepBack()) return
      if (busy.active) {
        dispatch({ type: 'sheet', tab: 'leave' })
        return
      }
    }
    dispatch({ type: 'back' })
  }

  function openDict(ch: string, word = '') {
    dispatch({ type: 'openDict', ch, word })
  }

  function openLookup(q: string) {
    const chars = uniqueKanji(q)
    dispatch({
      type: 'openLookup',
      q,
      ch: chars.length === 1 && q === chars[0] ? chars[0] : '',
      word: chars.length >= 1 && q !== chars[0] ? q : chars.length > 1 ? q : '',
    })
  }

  function requestView(id: ViewId) {
    if (id === 'study') {
      if (!busy.active) {
        setIntent({ nonce: Date.now(), mode: 'hub', autoStart: false })
      }
      dispatch({ type: 'request', view: 'study' })
      return
    }
    if (busy.active) {
      dispatch({ type: 'request', view: id, busy: true })
      return
    }
    if (id !== 'dict') {
      dictRef.current?.reset()
      setDictDepth(0)
    }
    studyRef.current?.abortToHub()
    dispatch({ type: 'request', view: id })
  }

  function leaveTo(dest: ViewId | 'hub' | 'setup') {
    if (dest === 'setup') {
      studyRef.current?.pauseToSetup()
      dispatch({ type: 'leave', dest: 'setup' })
      return
    }
    const queued = pending
    studyRef.current?.abortToHub()
    setBusy(EMPTY_BUSY)
    dispatch({ type: 'leave', dest })
    if (queued?.kind === 'start' && queued.chars) {
      saveLastSession(queued.chars)
      setIntent(queued.intent ?? { nonce: Date.now(), mode: 'hub', autoStart: false })
    }
    if (queued?.kind === 'memo' && queued.chars) saveLastSession(queued.chars)
  }

  if (err) {
    return (
      <div className="boot-fail">
        <p>{err}</p>
      </div>
    )
  }
  if (!dict) {
    return (
      <div className="boot">
        <span>墨</span>
        <p>Загрузка словаря…</p>
      </div>
    )
  }

  const navOn = (id: ViewId) => {
    if (sheet === 'help' && id === 'about') return true
    if (sheet && id !== 'study') return view === id
    return view === id && !sheet
  }

  return (
    <div className={`shell ${sheet ? 'is-sheet' : ''}`}>
      <aside className="nav">
        <div className="brand">
          <span>墨</span>
          <div>
            <strong>KanjiDesk</strong>
            <small>пропись на ПК</small>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <Tip key={item.id} label={item.tip}>
              <button
                type="button"
                className={navOn(item.id) ? 'is-on' : ''}
                onClick={() => requestView(item.id)}
              >
                {item.label}
                {busy.active && item.id !== 'study' ? <em className="nav-lock">сессия</em> : null}
              </button>
            </Tip>
          ))}
        </nav>
        <Tip label="Тема, озвучка, фуригана — для всего приложения.">
          <button
            type="button"
            className="nav-gear"
            onClick={() => dispatch({ type: 'sheet', tab: 'settings', settingsKind: 'global' })}
          >
            Настройки
          </button>
        </Tip>
        <p className="nav-session">
          в сессии <b>{session.length}</b>
          {busy.active ? <span className="nav-busy">{busy.label}</span> : null}
        </p>
      </aside>
      <main className={`main ${view === 'study' ? 'is-study' : ''}`}>
        {view !== 'home' ? (
          <div className="view-bar">
            <BackBtn onClick={goHome} label="На главную" />
            {(view === 'study' ? studyInner : view === 'dict' ? dictDepth > 1 : trail.length > 2) ? (
              <BackBtn onClick={goBack} label="Назад" />
            ) : (
              <span className="view-bar-slot" />
            )}
          </div>
        ) : null}
        <div className={`view-pane ${view === 'study' ? 'is-on' : ''}`}>
          <StudyView
            ref={studyRef}
            dict={dict}
            chars={session}
            title={title}
            settings={settings}
            paused={sheet !== null}
            intent={intent}
            onStats={() => setStats(loadStats())}
            onBusy={setBusy}
            onIntentHandled={() => setIntent(null)}
            onInner={setStudyInner}
            onSettings={setSettings}
            onMode={setStudyMode}
            onOpenSheet={(tab) => {
              dispatch({
                type: 'sheet',
                tab,
                settingsKind: tab === 'settings' ? (isQuizId(studyMode) ? studyMode : 'practice') : settingsKind,
              })
            }}
            onOpenKanji={(ch) => openDict(ch)}
            onOpenWord={(w) => openLookup(w)}
            onLookup={openLookup}
          />
        </div>
        {view === 'home' ? (
          <HomeView
            stats={stats}
            last={session}
            onStart={(chars, name) => start(chars, name)}
            onMemo={openMemo}
          />
        ) : null}
        {view === 'lists' ? (
          <ListsView dict={dict} onOpen={(chars, name) => start(chars, name)} onMemo={openMemo} />
        ) : null}
        {view === 'memo' ? (
          <MnemonicsView
            chars={session}
            title={title}
            dict={dict}
            opened={memoOpen}
            onOpenSet={() => dispatch({ type: 'setMemoOpen', open: true })}
            onCloseSet={() => dispatch({ type: 'setMemoOpen', open: false })}
            onGoLists={() => requestView('lists')}
            onOpenKanji={(ch) => openDict(ch)}
            onLoadChars={openMemo}
          />
        ) : null}
        {view === 'dict' ? (
          <DictionaryView
            ref={dictRef}
            dict={dict}
            speech={settings.speech}
            furi={settings.furi}
            showGloss={settings.showGloss}
            focus={dictFocus}
            focusWord={dictWord}
            focusQuery={dictQuery}
            onStudy={(chars, name) => start(chars, name || chars.join(''), { mode: 'draw', autoStart: true })}
            onDepth={setDictDepth}
          />
        ) : null}
        {view === 'about' ? (
          <AboutView
            dict={dict}
            settings={settings}
            onSettings={setSettings}
            onReset={(scope) => {
              factoryReset(scope)
              if (scope === 'notes' || scope === 'all') void clearAllNotes()
              if (scope === 'settings' || scope === 'all') setSettings(defaultSettings)
              if (scope === 'progress' || scope === 'all') setStats(loadStats())
            }}
          />
        ) : null}
      </main>

      {sheet ? (
        <Sheet tab={sheet} onTab={(tab) => dispatch({ type: 'sheet', tab })} onClose={() => dispatch({ type: 'closeSheet' })}>
          {sheet === 'settings' ? (
            <>
              {settingsKind === 'global' ? (
                <section className="setup-sec">
                  <p className="setup-label">Вид</p>
                  <label className="pref">
                    <span>
                      <b>Тёмная бумага</b>
                      <small>Ночной режим для всего приложения</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.dark}
                      onChange={(e) => setSettings({ ...settings, dark: e.target.checked })}
                    />
                  </label>
                </section>
              ) : (
                <p className="muted">
                  Настройки только этого квиза. Тема, озвучка и фуригана — пункт «Настройки» слева.
                </p>
              )}
              <QuizSetup settings={settings} onSettings={setSettings} kind={settingsKind} dict={dict} />
            </>
          ) : null}
          {sheet === 'help' ? <HelpBlurb /> : null}
          {sheet === 'leave' ? (
            <div className="leave-pane">
              {busy.active ? (
                <>
                  <p>
                    Круг ещё идёт: <b>{busy.label}</b>. Если уйдёшь, ответы этого круга не сохранятся в
                    разбор.
                  </p>
                  <div className="row-actions">
                    <button type="button" className="btn primary" onClick={() => dispatch({ type: 'closeSheet' })}>
                      Продолжить
                    </button>
                    <button type="button" className="btn" onClick={() => leaveTo('setup')}>
                      К параметрам режима
                    </button>
                    <button type="button" className="btn" onClick={() => leaveTo('hub')}>
                      Меню режимов
                    </button>
                  </div>
                  {(() => {
                    const dest: ViewId | null =
                      pending?.kind === 'home'
                        ? 'home'
                        : pending?.kind === 'memo'
                          ? 'memo'
                          : pending?.kind === 'start'
                            ? 'study'
                            : pending?.kind === 'view' && pending.view && pending.view !== 'study'
                              ? pending.view
                              : null
                    if (!dest) return null
                    return (
                      <button type="button" className="btn bad" onClick={() => leaveTo(dest)}>
                        Всё равно открыть «{NAV.find((n) => n.id === dest)?.label}»
                      </button>
                    )
                  })()}
                </>
              ) : (
                <>
                  <p>Сейчас круга нет — можно спокойно переключать разделы.</p>
                  <button type="button" className="btn primary" onClick={() => dispatch({ type: 'closeSheet' })}>
                    Закрыть
                  </button>
                </>
              )}
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  )
}
