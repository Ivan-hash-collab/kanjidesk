function morae(kana: string): string[] {
  const s = [...kana]
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCharCode(c - 0x60)
      return ch
    })
    .join('')
    .replace(/[.\-\s']/g, '')
  const out: string[] = []
  const small = 'ゃゅょぁぃぅぇぉャュョァィゥェォ'
  for (let i = 0; i < s.length; i++) {
    const n = s[i + 1] ?? ''
    if (n && (small.includes(n) || n === 'ー' || n === 'っ' || n === 'ッ')) {
      out.push(s[i] + n)
      i += 1
    } else {
      out.push(s[i] ?? '')
    }
  }
  return out.filter(Boolean)
}

type Props = {
  kana: string
  /** NHK-style drop after this mora (1-based). 0 = heiban. */
  pattern?: number | null
}

export function PitchAccent({ kana, pattern }: Props) {
  const m = morae(kana)
  if (!m.length) return null
  const n = m.length
  const drop = pattern == null || pattern < 0 ? null : pattern
  const w = Math.max(120, n * 28 + 16)
  const h = 44
  const ys = { high: 10, low: 28 }
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const x = 14 + i * 28
    let high = true
    if (drop == null) high = true
    else if (drop === 0) high = i > 0
    else high = i < drop && i > 0 ? true : i === 0 ? drop !== 1 : false
    if (drop === 1) high = i === 0
    pts.push({ x, y: high ? ys.high : ys.low })
  }
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <figure className="pitch-block">
      <svg className="pitch-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="питч">
        <polyline points={line} className="pitch-line" fill="none" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.2" className="pitch-dot" />
            <text x={p.x} y={h - 2} textAnchor="middle" className="pitch-mora">
              {m[i]}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="muted">
        {drop == null
          ? 'моры слова · точный питч в открытых данных не размечен'
          : drop === 0
            ? 'хеибан (0)'
            : `акцент на море ${drop}`}
      </figcaption>
    </figure>
  )
}
