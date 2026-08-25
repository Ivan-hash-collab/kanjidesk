import { Dialog } from './Dialog'
import { uniqueKanji } from '../lib/kanji'

type Props = {
  chars: string[]
  name: string
  chunk: number
  onChunk: (n: number) => void
  onStudy: (chars: string[], name: string) => void
  onMemo?: (chars: string[], name: string) => void
  onClose: () => void
}

export function chunkOf(chars: string[], size: number): string[][] {
  if (size <= 0 || size >= chars.length) return [chars]
  const out: string[][] = []
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size))
  return out
}

export function ListPreview({ chars, name, chunk, onChunk, onStudy, onMemo, onClose }: Props) {
  const parts = chunkOf(chars, chunk)
  return (
    <Dialog open onClose={onClose} labelledBy="list-preview-title">
        <header className="panel-head tight">
          <div>
            <p className="kicker">Предпросмотр</p>
            <h3 id="list-preview-title">
              {name} · {chars.length}
            </h3>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <p className="muted">Разбей длинный набор на круги. Каждый знак отдельно, не сплошной ряд.</p>
        <div className="seg">
          {[10, 20, 25, 50, 0].map((n) => (
            <button key={n} type="button" className={chunk === n ? 'is-on' : ''} onClick={() => onChunk(n)}>
              {n === 0 ? 'все' : `${n} шт.`}
            </button>
          ))}
        </div>
        <div className="preview-grid">
          {chars.map((ch, i) => (
            <button
              key={`${ch}-${i}`}
              type="button"
              className="preview-cell jp"
              title={`Учить ${ch}`}
              onClick={() => onStudy([ch], `${name} · ${ch}`)}
            >
              {ch}
            </button>
          ))}
        </div>
        {parts.length > 1 ? (
          <ul className="set-rows">
            {parts.map((part, i) => (
              <li key={i}>
                <b className="set-badge">{i + 1}</b>
                <div>
                  <strong>
                    Часть {i + 1}/{parts.length}
                  </strong>
                  <span>{part.length} кандзи</span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onStudy(part, `${name} · ${i + 1}/${parts.length}`)}
                  >
                    Учёба
                  </button>
                  {onMemo ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onMemo(part, `${name} · ${i + 1}/${parts.length}`)}
                    >
                      Мнемоники
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="row-actions">
            <button type="button" className="btn primary study-btn" onClick={() => onStudy(chars, name)}>
              Учёба · все
            </button>
            {onMemo ? (
              <button type="button" className="btn study-btn" onClick={() => onMemo(chars, name)}>
                Мнемоники · все
              </button>
            ) : null}
          </div>
        )}
    </Dialog>
  )
}

export function previewChars(text: string): string[] {
  return uniqueKanji(text)
}
