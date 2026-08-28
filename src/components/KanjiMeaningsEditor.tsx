import { useEffect, useState, type DragEvent } from 'react'
import { effectiveKanjiMeanings, setKanjiMeanings, KANJI_META_EVENT } from '../lib/kanjiMeta'

type Props = {
  char: string
  fallback: string[]
}

export function KanjiMeaningsEditor({ char, fallback }: Props) {
  const [items, setItems] = useState<string[]>(() => effectiveKanjiMeanings(char, fallback))
  const [draft, setDraft] = useState('')
  const [drag, setDrag] = useState<number | null>(null)

  useEffect(() => {
    const sync = () => setItems(effectiveKanjiMeanings(char, fallback))
    window.addEventListener(KANJI_META_EVENT, sync)
    return () => window.removeEventListener(KANJI_META_EVENT, sync)
  }, [char, fallback])

  function save(next: string[]) {
    setItems(next)
    setKanjiMeanings(char, next)
  }

  function onAdd() {
    const t = draft.trim()
    if (!t) return
    save([...items, t])
    setDraft('')
  }

  function onDelete(i: number) {
    save(items.filter((_, idx) => idx !== i))
  }

  function onDrop(target: number) {
    if (drag == null || drag === target) return
    const next = items.slice()
    const [moved] = next.splice(drag, 1)
    next.splice(target, 0, moved)
    save(next)
    setDrag(null)
  }

  return (
    <div className="meanings-editor">
      <p className="kicker">Значения (первое — главное)</p>
      <ul className="meaning-list">
        {items.map((g, i) => (
          <li
            key={`${g}-${i}`}
            className={drag === i ? 'is-drag' : ''}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            onDragEnd={() => setDrag(null)}
          >
            <span className="drag-handle" aria-hidden>⠿</span>
            <span className="meaning-text">{g}</span>
            <button type="button" className="btn ghost" aria-label={`Удалить ${g}`} onClick={() => onDelete(i)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <input className="field" value={draft} placeholder="добавить значение" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} />
        <button type="button" className="btn" onClick={onAdd}>Добавить</button>
        {items.length > fallback.length ? (
          <button type="button" className="btn ghost" onClick={() => save(fallback.slice())}>Сбросить</button>
        ) : null}
      </div>
    </div>
  )
}
