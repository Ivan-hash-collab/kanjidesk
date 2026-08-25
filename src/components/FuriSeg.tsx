import type { FuriMode } from '../types'

const OPTS: { id: FuriMode; lab: string }[] = [
  { id: 'on', lab: 'Показывать' },
  { id: 'hover', lab: 'По наведению' },
  { id: 'off', lab: 'Отключена' },
]

type Props = {
  value: FuriMode
  onChange: (f: FuriMode) => void
}

export function FuriSeg({ value, onChange }: Props) {
  return (
    <div className="seg furi-seg" title="Фуригана над кандзи">
      {OPTS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'is-on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.lab}
        </button>
      ))}
    </div>
  )
}
