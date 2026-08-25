type Part = { s: string; w?: string }

function split(text: string, words: string[]): Part[] {
  const dict = [...new Set(words.filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length)
  const parts: Part[] = []
  let i = 0
  while (i < text.length) {
    let hit = ''
    for (const w of dict) {
      if (text.startsWith(w, i)) {
        hit = w
        break
      }
    }
    if (hit) {
      parts.push({ s: hit, w: hit })
      i += hit.length
    } else {
      parts.push({ s: text[i] ?? '' })
      i += 1
    }
  }
  return parts
}

type Props = {
  text: string
  words: string[]
  active?: string
  onWord: (written: string) => void
}

export function WordRun({ text, words, active, onWord }: Props) {
  const parts = split(text, words)
  return (
    <span className="word-run">
      {parts.map((p, i) =>
        p.w ? (
          <button
            key={`${p.w}-${i}`}
            type="button"
            className={`jp-link word-hit ${active === p.w ? 'is-on' : ''}`}
            onClick={() => onWord(p.w!)}
          >
            {p.s}
          </button>
        ) : (
          <span key={`${p.s}-${i}`} className="jp">
            {p.s}
          </span>
        ),
      )}
    </span>
  )
}
