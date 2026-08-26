import {
  JLPT_FILTERS,
  type DictKind,
  type DictSort,
  type JlptFilter,
} from '../lib/dictSearch'

type Props = {
  kind?: DictKind
  onKind?: (kind: DictKind) => void
  jlpt: JlptFilter
  onJlpt: (jlpt: JlptFilter) => void
  sort: DictSort
  onSort: (sort: DictSort) => void
  roma?: boolean
  onRoma?: (on: boolean) => void
}

export function DictFilters({ kind, onKind, jlpt, onJlpt, sort, onSort, roma, onRoma }: Props) {
  const sorts: { id: DictSort; label: string }[] =
    kind === 'words'
      ? [
          { id: 'freq', label: 'частотные' },
          { id: 'jlpt', label: 'JLPT' },
          { id: 'len', label: 'короткие' },
        ]
      : [
          { id: 'freq', label: 'частота' },
          { id: 'jlpt', label: 'JLPT' },
          { id: 'strokes', label: 'черты' },
        ]

  return (
    <div className="dict-filters">
      {onKind && kind ? (
        <div className="seg" role="tablist" aria-label="Что искать">
          <button type="button" className={kind === 'kanji' ? 'is-on' : ''} onClick={() => onKind('kanji')}>
            Кандзи
          </button>
          <button type="button" className={kind === 'words' ? 'is-on' : ''} onClick={() => onKind('words')}>
            Слова
          </button>
        </div>
      ) : null}
      <div className="seg wrap" role="group" aria-label="JLPT">
        {JLPT_FILTERS.map((f) => (
          <button
            key={String(f.id)}
            type="button"
            className={jlpt === f.id ? 'is-on' : ''}
            onClick={() => onJlpt(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="seg wrap" role="group" aria-label="Сортировка">
        {sorts.map((s) => (
          <button
            key={s.id}
            type="button"
            className={sort === s.id ? 'is-on' : ''}
            onClick={() => onSort(s.id)}
          >
            {s.label}
          </button>
        ))}
        {onRoma ? (
          <button
            type="button"
            className={roma ? 'is-on' : ''}
            title="Латиница как ромадзи (mizu → みず). Выключи или допиши -roma, чтобы искать только значение."
            onClick={() => onRoma(!roma)}
          >
            ромадзи
          </button>
        ) : null}
      </div>
    </div>
  )
}
