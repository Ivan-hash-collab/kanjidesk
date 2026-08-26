import { QuizSetup } from '../components/QuizSetup'
import { ImportNotes } from '../components/ImportNotes'
import { Tip } from '../components/Tip'
import { forgetMemoSessions, memoApi } from '../lib/memo'
import { defaultSettings, type ResetScope } from '../lib/storage'
import type { KanjiDict, QuizId, Settings } from '../types'
import { useState } from 'react'

type Props = {
  dict: KanjiDict
  settings: Settings
  onSettings: (s: Settings) => void
  onReset: (scope: ResetScope) => void
}

type ConfirmKind = ResetScope | 'memoArchive'

const QUIZ_TAB: { id: QuizId; name: string }[] = [
  { id: 'browse', name: 'Обзор' },
  { id: 'practice', name: 'Карточки' },
  { id: 'draw', name: 'Пропись' },
  { id: 'mcq', name: 'Тест' },
]

export function AboutView({ dict, settings, onSettings, onReset }: Props) {
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [quiz, setQuiz] = useState<QuizId>('draw')
  const [notes, setNotes] = useState(false)
  const [wipeMsg, setWipeMsg] = useState('')
  return (
    <div className="panel about-panel page">
      <header className="panel-head compact">
        <div>
          <p className="kicker">Справка</p>
          <h2>Как пользоваться</h2>
        </div>
      </header>
      <div className="about-grid">
        <div className="prose">
          <p>
            ПК-тренажёр: пропись AnimCJK/KanjiVG, словарь KANJIDIC, примеры Tanaka/Tatoeba. Не копия
            Kanji Study и не разблокировка покупок.
          </p>
          <ol>
            <li>Anki → CopyKanji → буфер или «Открыть на ПК».</li>
            <li>Главная → загрузить сессию → Учёба.</li>
            <li>У каждого квиза свои настройки (шестерёнка в круге). Тест не берёт строгость пера.</li>
            <li>Лампочка — твоя запись к знаку и история агента. Импорт CSV/Excel/TXT/DB — в Словаре, Списках или ниже; режим «Перезаписать» затирает поле.</li>
            <li>Интервалы только в Anki. Мнемоники — сначала набор (Главная / Списки / файл), потом истории сразу на все знаки.</li>
          </ol>
        </div>
        <section className="card tight">
          <h3>Настройки</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.dark}
              onChange={(e) => onSettings({ ...settings, dark: e.target.checked })}
            />
            Тёмная бумага
          </label>
          <QuizSetup settings={settings} onSettings={onSettings} kind="global" dict={dict} />
          <p className="setup-label">По квизам</p>
          <div className="seg wrap">
            {QUIZ_TAB.map((t) => (
              <button key={t.id} type="button" className={quiz === t.id ? 'is-on' : ''} onClick={() => setQuiz(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <QuizSetup settings={settings} onSettings={onSettings} kind={quiz} />
          <button type="button" className="btn" onClick={() => setNotes(true)}>
            Импорт заметок
          </button>
          {notes ? (
            <div className="preview-back" onClick={() => setNotes(false)} role="presentation">
              <div className="preview-pane" onClick={(e) => e.stopPropagation()}>
                <ImportNotes defaultKeep={false} onClose={() => setNotes(false)} />
              </div>
            </div>
          ) : null}
          <h3>Откат к заводским</h3>
          {confirm ? (
            <div className="confirm-strip">
              <p>
                {confirm === 'all'
                  ? 'Стереть настройки, списки, заметки, статистику и кэш штрихов?'
                  : confirm === 'lists'
                    ? 'Удалить все свои папки и списки?'
                    : confirm === 'progress'
                      ? 'Обнулить серию, историю кругов и последнюю сессию?'
                      : confirm === 'history'
                        ? 'Очистить календарь кругов на главной? Серия и текущий набор останутся.'
                        : confirm === 'memoArchive'
                          ? 'Удалить архив сессий мнемоник? Свои мнемоники и заметки в словаре не трогаются.'
                      : confirm === 'notes'
                        ? 'Удалить все пользовательские подсказки?'
                        : 'Вернуть настройки пера и квизов?'}
              </p>
              <button
                type="button"
                className="btn bad"
                onClick={() => {
                  if (confirm === 'memoArchive') {
                    void (async () => {
                      try {
                        await memoApi.clearSessions()
                        forgetMemoSessions()
                        setWipeMsg('Архив мнемоник очищен')
                      } catch (e) {
                        setWipeMsg(e instanceof Error ? e.message : 'Не удалось очистить архив')
                      }
                      setConfirm(null)
                    })()
                    return
                  }
                  onReset(confirm)
                  setConfirm(null)
                }}
              >
                Да, сбросить
              </button>
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Нет
              </button>
            </div>
          ) : (
            <div className="row-actions wrap">
              <Tip label="Перо, строгость, фуригана — как при первом запуске">
                <button type="button" className="btn" onClick={() => setConfirm('settings')}>
                  Настройки
                </button>
              </Tip>
              <button type="button" className="btn" onClick={() => setConfirm('lists')}>
                Списки
              </button>
              <button type="button" className="btn" onClick={() => setConfirm('notes')}>
                Заметки
              </button>
              <button type="button" className="btn" onClick={() => setConfirm('history')}>
                История кругов
              </button>
              <button type="button" className="btn" onClick={() => setConfirm('memoArchive')}>
                Архив мнемоник
              </button>
              <button type="button" className="btn" onClick={() => setConfirm('progress')}>
                Серия и прогресс
              </button>
              <button type="button" className="btn bad" onClick={() => setConfirm('all')}>
                Всё
              </button>
              <button type="button" className="btn ghost" onClick={() => onSettings(defaultSettings)}>
                Только квизы
              </button>
            </div>
          )}
          {wipeMsg ? <p className="muted">{wipeMsg}</p> : null}
        </section>
      </div>
    </div>
  )
}
