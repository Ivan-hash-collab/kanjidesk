import { Fold } from '../components/Fold'
import { BarChart, LineChart } from '../components/Chart'
import { fmtMs, summarize } from '../lib/quality'
import type { ItemLog, SessionReport } from '../types'

type Props = {
  modeLabel: string
  items: ItemLog[]
  durationMs: number
  history: SessionReport[]
  onAgain: () => void
  onMissed: () => void
  onSetup: () => void
  onHub: () => void
  onOpenKanji?: (ch: string) => void
}

export function SessionSummary({
  modeLabel,
  items,
  durationMs,
  history,
  onAgain,
  onMissed,
  onSetup,
  onHub,
  onOpenKanji,
}: Props) {
  const s = summarize(items)
  const missed = [...new Set(items.filter((x) => !x.correct).map((x) => x.char))]
  const trend = history.slice(0, 12).map((h) => summarize(h.items).quality).reverse()
  const writes = items.filter((x) => x.write)

  function glyph(ch: string) {
    if (!onOpenKanji) return <b className="jp">{ch}</b>
    return (
      <button type="button" className="jp-link glyph-btn" onClick={() => onOpenKanji(ch)}>
        {ch}
      </button>
    )
  }

  return (
    <div className="panel page summary-page">
      <header className="panel-head tight">
        <div>
          <p className="kicker">{modeLabel} · {fmtMs(durationMs)}</p>
          <h2>Разбор</h2>
        </div>
      </header>

      <div className="summary-top">
        <span className={`grade-letter g-${s.grade}`}>{s.grade}</span>
        <div className="summary-facts">
          <p>
            <b>{s.grade}</b> · {s.accuracy}% верных · {s.n} ответов
          </p>
          <p className="muted">
            {s.ok} верно · {s.bad} ошибок · {fmtMs(s.avgMs)} на знак
            {s.writes ? ` · пропись ${s.avgMistakes} ош./знак` : ''}
          </p>
        </div>
      </div>

      <LineChart
        title="Качество последних кругов"
        points={trend.length ? trend : [s.quality]}
      />
      <BarChart
        title="Оценки этого круга"
        bars={(['A', 'B', 'C', 'D', 'F'] as const).map((g) => ({
          key: g,
          n: s.bands[g],
          tone: `g-${g}`,
        }))}
      />

      {s.worst.length ? (
        <p className="chip-line">
          {s.n > 0 ? `слабые (среднее качество в этом круге по каждому знаку): ` : 'знаки с низким качеством: '}
          {s.worst.map((w) => (
            <span key={w.char} title={`Среднее качество ${w.char} = ${w.quality} из 100`}>
              {glyph(w.char)}
              <em>{w.quality}</em>
            </span>
          ))}
        </p>
      ) : null}

      {missed.length ? (
        <p className="chip-line">
          ошибки:{' '}
          {missed.map((ch) => (
            <span key={ch}>{glyph(ch)}</span>
          ))}
        </p>
      ) : (
        <p className="status-ok">Без ошибок по ответам.</p>
      )}

      {writes.length ? (
        <Fold title="Каждая пропись" meta={`${writes.length}`} defaultOpen={writes.length <= 4}>
          <ul className="quality-list">
            {writes.map((x, idx) => (
              <li key={`${x.char}-${idx}`}>
                {glyph(x.char)}
                <span className="qbar">
                  <i style={{ width: `${x.quality}%` }} />
                </span>
                <em>
                  {x.write!.totalMistakes} ош. · {x.write!.firstTry}/{x.write!.strokeCount} сразу · {fmtMs(x.write!.timeMs)}
                </em>
              </li>
            ))}
          </ul>
        </Fold>
      ) : null}

      {trend.length > 1 ? (
        <Fold title="Список кругов" meta={`${trend.length}`}>
          <p className="muted">Тот же ряд, что на графике выше — от старых к новым.</p>
        </Fold>
      ) : null}

      <div className="row-actions">
        <button type="button" className="btn primary" onClick={onAgain}>
          Ещё раз
        </button>
        {missed.length ? (
          <button type="button" className="btn" onClick={onMissed}>
            Только ошибки ({missed.length})
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onSetup}>
          Настройки
        </button>
        <button type="button" className="btn ghost" onClick={onHub}>
          К режимам
        </button>
      </div>
    </div>
  )
}
