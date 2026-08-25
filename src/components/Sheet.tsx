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

export function HelpBlurb() {
  return (
    <div className="prose">
      <p>
        Сессия не сбрасывается, пока это окно открыто. Таймер на паузе. Закрой меню или нажми Escape
        — вернёшься к тому же знаку.
      </p>
      <ol>
        <li>Тема, озвучка и фуригана — «Настройки» в боковом меню. Перо и строгость — шестерёнка в Учёбе или Справка.</li>
        <li>Уйти из круга — вкладка «Сессия», иначе прогресс этого круга пропадёт.</li>
        <li>Интервалы по-прежнему только в Anki. Мнемоники открываются набором целиком, не по одному знаку.</li>
      </ol>
    </div>
  )
}
