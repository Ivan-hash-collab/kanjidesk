import type { FuriMode } from '../types'

const KANJI = /[\u3400-\u9FFF々〆ヶ]/

type Props = {
  text: string
  furi: FuriMode
  /** Whole-word reading (preferred, like a dictionary headword). */
  wordReading?: string
  /** Per-character fallback, usually kun/on from KANJIDIC. */
  charReadings?: Record<string, string>
  onKanji?: (ch: string) => void
  className?: string
}

export function KanjiRun({ text, furi, wordReading, charReadings, onKanji, className }: Props) {
  const inner = [...text].map((ch, i) => {
    if (!KANJI.test(ch)) {
      return (
        <span key={i} className="jp-kana">
          {ch}
        </span>
      )
    }
    const node = onKanji ? (
      <button
        type="button"
        className="jp-link"
        onClick={(e) => {
          e.stopPropagation()
          onKanji(ch)
        }}
      >
        {ch}
      </button>
    ) : (
      <span className="jp">{ch}</span>
    )
    const rt = !wordReading ? charReadings?.[ch] : undefined
    if (!rt) return <span key={i}>{node}</span>
    return (
      <ruby key={i} className={`furi-${furi}`}>
        {node}
        <rt>{rt}</rt>
      </ruby>
    )
  })

  if (wordReading) {
    return (
      <ruby className={`furi-${furi} word-ruby ${className ?? ''}`}>
        <span className="word-ruby-base">{inner}</span>
        <rt>{wordReading}</rt>
      </ruby>
    )
  }

  return <span className={className}>{inner}</span>
}
