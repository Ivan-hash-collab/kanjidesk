import type { FuriMode } from '../types'

const RUBY_RE = /([\u3400-\u9FFF々〆ヶ]+)\u005b([^\]]+)\u005d/g
const KANJI = /[\u3400-\u9FFF々〆ヶ]/

export function RubyText({
  text,
  highlight,
  furi = 'on',
  onKanji,
}: {
  text: string
  highlight?: Set<string>
  furi?: FuriMode
  onKanji?: (ch: string) => void
}) {
  const parts: Array<{ k?: string; f?: string; t?: string }> = []
  let last = 0
  const re = new RegExp(RUBY_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index) })
    parts.push({ k: m[1], f: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ t: text.slice(last) })

  return (
    <div className={`ruby-block furi-${furi}`}>
      {parts.map((p, i) => {
        if (p.t !== undefined) {
          return (
            <span key={i} className="ruby-plain">
              {p.t}
            </span>
          )
        }
        const marked = highlight && [...(p.k ?? '')].some((c) => highlight.has(c))
        return (
          <ruby key={i} className={`furi-${furi}${marked ? ' is-session' : ''}`}>
            {[...(p.k ?? '')].map((ch, j) =>
              KANJI.test(ch) && onKanji ? (
                <button key={j} type="button" className="jp-link" onClick={() => onKanji(ch)}>
                  {ch}
                </button>
              ) : (
                <span key={j}>{ch}</span>
              ),
            )}
            <rt>{p.f}</rt>
          </ruby>
        )
      })}
    </div>
  )
}
