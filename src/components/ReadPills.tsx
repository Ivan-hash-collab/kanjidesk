import type { KanjiInfo } from '../types'

type Props = {
  info: KanjiInfo | null
  max?: number
  active?: string
  onReading?: (reading: string) => void
}

export function ReadPills({ info, max = 4, active, onReading }: Props) {
  if (!info) return null
  const on = info.on.slice(0, max)
  const kun = info.kun.slice(0, max)
  if (!on.length && !kun.length) return null
  return (
    <div className="read-pills">
      {on.map((r) =>
        onReading ? (
          <button
            key={`on-${r}`}
            type="button"
            className={`pill on ${active === r || active === r.replace(/[.\-]/g, '') ? 'is-on' : ''}`}
            title={`Слова и знаки с чтением ${r}`}
            onClick={() => onReading(r)}
          >
            {r}
          </button>
        ) : (
          <span key={`on-${r}`} className="pill on">
            {r}
          </span>
        ),
      )}
      {kun.map((r) =>
        onReading ? (
          <button
            key={`kun-${r}`}
            type="button"
            className={`pill kun ${active === r || active === r.replace(/[.\-]/g, '') ? 'is-on' : ''}`}
            title={`Слова и знаки с чтением ${r}`}
            onClick={() => onReading(r)}
          >
            {r}
          </button>
        ) : (
          <span key={`kun-${r}`} className="pill kun">
            {r}
          </span>
        ),
      )}
    </div>
  )
}
