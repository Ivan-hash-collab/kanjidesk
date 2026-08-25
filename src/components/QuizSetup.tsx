import { FuriSeg } from './FuriSeg'
import { SourcesPanel } from './SourcesPanel'
import { applyHypermode, passLabel, settingsSummary, strictnessLabel, strokeParams } from '../lib/quality'
import { isQuizId, patchQuiz, quizOf } from '../lib/storage'
import type { KanjiDict, QuizId, QuizSettings, Settings } from '../types'

type Kind = 'global' | QuizId | 'all'

type Props = {
  settings: Settings
  onSettings: (s: Settings) => void
  writing?: boolean
  kind?: Kind
  dict?: KanjiDict
}

export function QuizSetup({ settings, onSettings, writing = false, kind = 'all', dict }: Props) {
  const mode: QuizId = isQuizId(kind) ? kind : 'draw'
  const q = quizOf(settings, mode)
  const sp = strokeParams(q)
  const showWriting = kind === 'draw' || kind === 'all'
  const showSession = kind === 'practice' || kind === 'draw' || kind === 'mcq' || kind === 'all'
  const showMcq = kind === 'mcq' || kind === 'all'
  const showPractice = kind === 'practice' || kind === 'all'
  const showBrowse = kind === 'browse' || kind === 'all'
  const showGlobal = kind === 'global' || kind === 'all'

  function patch(p: Partial<QuizSettings>) {
    onSettings(patchQuiz(settings, mode, p))
  }

  return (
    <div className="setup-block">
      {kind !== 'global' && kind !== 'all' ? (
        <p className="muted">
          Эти пункты только для режима «{mode === 'draw' ? 'Пропись' : mode === 'mcq' ? 'Тест' : mode === 'practice' ? 'Карточки' : 'Обзор'}».
        </p>
      ) : null}

      {showWriting ? (
        <section className="setup-sec">
          <p className="setup-label">Распознавание штрихов</p>
          <div className="seg wrap">
            {(
              [
                [12, 'Мягко'],
                [35, 'Спокойно'],
                [45, 'Норма'],
                [72, 'Строго'],
                [92, 'Экзамен'],
              ] as const
            ).map(([n, lab]) => (
              <button
                key={n}
                type="button"
                className={q.strictness === n ? 'is-on' : ''}
                onClick={() => patch({ strictness: n })}
              >
                {lab}
              </button>
            ))}
          </div>
          <label className="pref range-pref">
            <span>
              <b>Строгость пера {q.strictness}</b>
              <small>
                {strictnessLabel(q.strictness)} · допуск {sp.leniency.toFixed(2)}
              </small>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={q.strictness}
              onChange={(e) => patch({ strictness: Number(e.target.value) })}
            />
          </label>
          <label className="pref range-pref">
            <span>
              <b>Зачёт написания ≥ {q.passQuality}</b>
              <small>{passLabel(q.passQuality)} · ниже порога знак считается ошибкой</small>
            </span>
            <input
              type="range"
              min={25}
              max={95}
              value={q.passQuality}
              onChange={(e) => patch({ passQuality: Number(e.target.value) })}
            />
          </label>
          <label className="pref range-pref">
            <span>
              <b>Подсказка черты</b>
              <small>{q.hintAfter === 0 ? 'выкл' : `после ${q.hintAfter} ошибок`}</small>
            </span>
            <input
              type="range"
              min={0}
              max={6}
              value={q.hintAfter}
              onChange={(e) => patch({ hintAfter: Number(e.target.value) })}
            />
          </label>
          <label className="pref range-pref">
            <span>
              <b>Засчитать черту</b>
              <small>{q.skipAfterMisses === 0 ? 'никогда' : `после ${q.skipAfterMisses} ошибок`}</small>
            </span>
            <input
              type="range"
              min={0}
              max={8}
              value={q.skipAfterMisses}
              onChange={(e) => patch({ skipAfterMisses: Number(e.target.value) })}
            />
          </label>
          <label className="pref">
            <span>
              <b>Обратный штрих</b>
              <small>Принимать черту в обратную сторону</small>
            </span>
            <input
              type="checkbox"
              checked={q.acceptBackwards}
              onChange={(e) => patch({ acceptBackwards: e.target.checked })}
            />
          </label>
          <label className="pref">
            <span>
              <b>Контур</b>
              <small>Тень знака во время прописи</small>
            </span>
            <input
              type="checkbox"
              checked={q.showOutline}
              onChange={(e) => patch({ showOutline: e.target.checked })}
            />
          </label>
          <label className="pref range-pref">
            <span>
              <b>Толщина пера</b>
              <small>уровень {q.penWidth}</small>
            </span>
            <input
              type="range"
              min={4}
              max={24}
              value={q.penWidth}
              onChange={(e) => patch({ penWidth: Number(e.target.value) })}
            />
          </label>
        </section>
      ) : null}

      {showSession ? (
        <section className="setup-sec">
          <p className="setup-label">Этот круг</p>
          <p className="cfg-summary">{settingsSummary(settings, showWriting || writing, mode)}</p>
          <label className="pref">
            <span>
              <b>Повтор ошибок</b>
              <small>Снова в конце круга</small>
            </span>
            <input type="checkbox" checked={q.repeatWrong} onChange={(e) => patch({ repeatWrong: e.target.checked })} />
          </label>
          <label className="pref">
            <span>
              <b>Пауза после ответа</b>
              <small>Не прыгать сразу дальше</small>
            </span>
            <input type="checkbox" checked={!q.autoNext} onChange={(e) => patch({ autoNext: !e.target.checked })} />
          </label>
          {showPractice || showWriting ? (
            <label className="pref">
              <span>
                <b>Скрыть ответы</b>
                <small>Показать по нажатию</small>
              </span>
              <input type="checkbox" checked={q.hideAnswers} onChange={(e) => patch({ hideAnswers: e.target.checked })} />
            </label>
          ) : null}
          {showMcq ? (
            <>
              <label className="pref">
                <span>
                  <b>Подсказка чтения</b>
                  <small>Первая мора в тесте кандзи → чтение</small>
                </span>
                <input type="checkbox" checked={q.readingHint} onChange={(e) => patch({ readingHint: e.target.checked })} />
              </label>
              <label className="pref">
                <span>
                  <b>Без таймера-штрафа</b>
                  <small>Время не обрывает вопрос</small>
                </span>
                <input type="checkbox" checked={q.disableTimeouts} onChange={(e) => patch({ disableTimeouts: e.target.checked })} />
              </label>
            </>
          ) : null}
          <label className="pref">
            <span>
              <b>Hypermode</b>
              <small>Быстрее и строже, только этот режим</small>
            </span>
            <input type="checkbox" checked={q.hypermode} onChange={(e) => onSettings(applyHypermode(settings, e.target.checked, mode))} />
          </label>
        </section>
      ) : null}

      {showBrowse ? (
        <p className="muted">Обзор без оценки. Озвучка и фуригана — в настройках приложения слева.</p>
      ) : null}

      {showGlobal ? (
        <section className="setup-sec">
          <p className="setup-label">Приложение</p>
          <p className="muted">Тема, озвучка и фуригана действуют везде: словарь, учёба, примеры.</p>
          <label className="pref">
            <span>
              <b>Озвучка</b>
              <small>Чтение, если есть TTS</small>
            </span>
            <input type="checkbox" checked={settings.speech} onChange={(e) => onSettings({ ...settings, speech: e.target.checked })} />
          </label>
          <p className="setup-label">Фуригана</p>
          <p className="muted">Над кандзи в словах и в примерах предложений. В словаре отдельного переключателя нет.</p>
          <FuriSeg value={settings.furi} onChange={(furi) => onSettings({ ...settings, furi })} />
          <label className="pref">
            <span>
              <b>Перевод примеров</b>
              <small>Показывать английский под предложением</small>
            </span>
            <input
              type="checkbox"
              checked={settings.showGloss}
              onChange={(e) => onSettings({ ...settings, showGloss: e.target.checked })}
            />
          </label>
          {dict ? <SourcesPanel dict={dict} /> : null}
        </section>
      ) : null}
    </div>
  )
}
