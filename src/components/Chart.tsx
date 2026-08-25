type Props = {
  points: number[]
  labels?: string[]
  max?: number
  title?: string
}

export function LineChart({ points, labels, max = 100, title }: Props) {
  const w = 360
  const h = 140
  const pad = { l: 28, r: 8, t: 12, b: 22 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const n = Math.max(points.length, 2)
  const xy = points.map((y, i) => {
    const x = pad.l + (i * innerW) / (n - 1)
    const py = pad.t + innerH - (Math.max(0, Math.min(max, y)) / max) * innerH
    return { x, y: py, v: y }
  })
  const line = xy.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `${pad.l},${pad.t + innerH} ${line} ${xy[xy.length - 1]?.x ?? pad.l},${pad.t + innerH}`
  return (
    <figure className="chart-block">
      {title ? <figcaption>{title}</figcaption> : null}
      <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
        {[0, 50, 100].map((tick) => {
          const y = pad.t + innerH - (tick / max) * innerH
          return (
            <g key={tick}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} className="chart-grid" />
              <text x={pad.l - 6} y={y + 3} className="chart-tick">
                {tick}
              </text>
            </g>
          )
        })}
        <polygon points={area} className="chart-fill" />
        <polyline points={line} className="chart-line" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.2" className="chart-dot">
            <title>{`${labels?.[i] ?? i + 1}: ${p.v}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

export function BarChart({
  bars,
  title,
}: {
  bars: { key: string; n: number; tone: string }[]
  title?: string
}) {
  const max = Math.max(1, ...bars.map((b) => b.n))
  return (
    <figure className="chart-block">
      {title ? <figcaption>{title}</figcaption> : null}
      <div className="bar-chart">
        {bars.map((b) => (
          <div key={b.key} className="bar-col">
            <span className="bar-n">{b.n}</span>
            <i className={`bar-fill ${b.tone}`} style={{ height: `${(b.n / max) * 88 + 6}px` }} />
            <b>{b.key}</b>
          </div>
        ))}
      </div>
    </figure>
  )
}
