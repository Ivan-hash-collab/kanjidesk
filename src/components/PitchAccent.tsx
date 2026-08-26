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

function heights(n: number, drop: number): boolean[] {
  return Array.from({ length: n }, (_, i) => {
    if (drop === 0) return i > 0
    if (drop === 1) return i === 0
    if (i === 0) return false
    return i < drop
  })
}

type Props = {
  kana: string
  pattern?: number | null
  patterns?: number[]
  compact?: boolean
}

export function PitchAccent({ kana, pattern, patterns, compact }: Props) {
  const m = morae(kana)
  if (!m.length) return null
  const n = m.length
  const all = (patterns?.length ? patterns : pattern != null && pattern >= 0 ? [pattern] : []).filter(
    (p) => p >= 0,
  )
  const drop = all[0]
  const known = drop != null
  const step = compact ? 16 : 28
  const w = Math.max(compact ? 48 : 120, n * step + (compact ? 10 : 16))
  const h = compact ? 28 : 44
  const ys = compact ? { high: 6, low: 16 } : { high: 10, low: 28 }
  const high = known ? heights(n, drop) : m.map(() => true)
  const pts = m.map((_, i) => ({ x: (compact ? 8 : 14) + i * step, y: high[i] ? ys.high : ys.low }))
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const label =
    !known
      ? 'питч не найден в Kanjium'
      : drop === 0
        ? 'хеибан (0)'
        : `акцент ${all.map((p) => (p === 0 ? '0' : String(p))).join('/')}`
  return (
    <figure className={`pitch-block ${compact ? 'is-compact' : ''} ${known ? '' : 'is-unk'}`}>
      <svg className="pitch-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <polyline points={line} className={`pitch-line ${known ? '' : 'is-unk'}`} fill="none" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={compact ? 2.2 : 3.2} className={`pitch-dot ${known ? '' : 'is-unk'}`} />
            {compact ? null : (
              <text x={p.x} y={h - 2} textAnchor="middle" className="pitch-mora">
                {m[i]}
              </text>
            )}
          </g>
        ))}
      </svg>
      {compact ? null : <figcaption className="muted">{label}</figcaption>}
    </figure>
  )
}
