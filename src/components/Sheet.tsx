import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { SheetTab } from '../types'

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'settings', label: 'Настройки' },
  { id: 'help', label: 'Справка' },
  { id: 'leave', label: 'Сессия' },
]

type Props = {
  tab: SheetTab
  onTab: (tab: SheetTab) => void
  onClose: () => void
  children: ReactNode
}

export function Sheet({ tab, onTab, onClose, children }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-back" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2 id="sheet-title">Меню</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="seg sheet-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'is-on' : ''}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

const TERMS: [string, string][] = [
  ['Качество', 'Средний балл круга от 0 до 100. Выше — лучше. Оценки A–F — границы этого балла.'],
  ['Слабые', 'Знаки с самым низким средним качеством именно в этом круге. Число — их средний балл из 100.'],
  ['Зачёт написания', 'Порог качества, ниже которого знак считается ошибкой. Настраивается по уровням.'],
  ['Распознавание штрихов', 'Насколько придирчиво сравнивается форма черты с образцом, пока пишешь.'],
  ['Показ кандзи', 'Что видно в вопросе: сам знак, прочерк или только чтение. Меняется в настройках режима.'],
  ['Озвучка', 'TTS-произношение кандзи/слова. Работает в режимах, где включена эта галочка.'],
  ['Слова с чтением', 'Слова, где кандзи читается выбранным способом. Чтение берётся из он/кун списков.'],
  ['Частота', 'Порядковый номер слова/кандзи по встречаемости в корпусе. Меньше номер — чаще.'],
  ['Похожие визуально', 'Кандзи с общими радикалами (похожие по написанию).'],
  ['Похожие по смыслу', 'Кандзи с пересекающимися значениями (синонимы по глоссам).'],
]

export function HelpBlurb() {
  return (
    <div className="prose">
      <p>
        Сессия не сбрасывается, пока это окно открыто. Таймер на паузе. Закрой меню или нажми Escape —
        вернёшься к тому же знаку.
      </p>
      <h3>Термины</h3>
      <dl className="term-list">
        {TERMS.map(([t, d]) => (
          <div key={t}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
