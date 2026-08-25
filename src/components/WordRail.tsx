import { useEffect, useMemo, useState } from 'react'
import { meaningLine, uniqueKanji } from '../lib/kanji'
import { findWord, sentencesFor, wordsForKanji, wordsForReading, type LexWord, type Sentence } from '../lib/lexicon'
import { addScanTerms } from '../lib/scan'
import type { FuriMode, KanjiDict } from '../types'
import { WordRank } from './FreqTag'
import { KanjiRun } from './KanjiRun'
import { SentList } from './SentList'

type Props = {
  char: string
  dict: KanjiDict
  furi: FuriMode
  onFuri?: (f: FuriMode) => void
  showGloss?: boolean
  reading?: string
  onKanji?: (ch: string) => void
}

function WordList({
  words,
  furi,
  dict,
  onOpen,
}: {
  words: LexWord[]
  furi: FuriMode
  dict: KanjiDict
  onOpen: (written: string) => void
}) {
  if (!words.length) return null
  return (
    <ul className="word-rows compact">
      {words.slice(0, 12).map((w) => (
        <li key={w.written + w.kana}>
          <button type="button" className="word-row" onClick={() => onOpen(w.written)}>
            <KanjiRun text={w.written} furi={furi} wordReading={w.kana} />
            <span>
              {w.meanings[0] || w.kana || meaningLine(dict[w.written[0]], 1)}{' '}
              <WordRank written={w.written} alts={w.alts} kana={w.kana} dict={dict} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function WordRail({ char, dict, furi, showGloss = true, reading, onKanji }: Props) {
  const [words, setWords] = useState<LexWord[]>([])
  const [sents, setSents] = useState<Sentence[]>([])
  const [peek, setPeek] = useState<LexWord | null>(null)

  useEffect(() => {
    let live = true
    setPeek(null)
    void Promise.all([wordsForKanji(char), sentencesFor(char)]).then(([w, s]) => {
      if (!live) return
      setWords(w)
      setSents(s.slice(0, 3))
      addScanTerms(w.flatMap((x) => [x.written, x.kana, ...(x.alts ?? [])]))
    })
    return () => {
      live = false
    }
  }, [char])

  const grouped = useMemo(() => {
    if (!reading) return null
    return wordsForReading(words, char, reading, dict)
  }, [words, reading, char, dict])

  const shown = grouped ? [...grouped.exact, ...grouped.stem] : words

  const writings = useMemo(
    () => [...new Set(shown.flatMap((w) => [w.written, ...(w.alts ?? [])]))],
    [shown],
  )
  const readings = useMemo(() => {
    const m: Record<string, string> = {}
    for (const w of shown) {
      if (w.kana) m[w.written] = w.kana
    }
    return m
  }, [shown])

  async function openWord(written: string) {
    const found =
      shown.find((w) => w.written === written) ||
      words.find((w) => w.written === written || w.alts?.includes(written)) ||
      (await findWord(written))
    setPeek(found ?? { written, kana: '', meanings: [], common: false })
  }

  if (!char) return null
  return (
    <aside className="word-rail">
      <p className="kicker">
        {reading ? `Слова с чтением ${reading}` : `Слова с ${char}`}
      </p>
      {peek ? (
        <div className="word-peek">
          <button type="button" className="btn ghost" onClick={() => setPeek(null)}>
            ← к списку
          </button>
          <p className="word-head">
            <KanjiRun text={peek.written} furi={furi} wordReading={peek.kana} />
          </p>
          <p className="muted">{peek.kana || '—'}</p>
          {peek.meanings.length ? (
            <ol className="gloss-list">
              {peek.meanings.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              {uniqueKanji(peek.written)
                .map((ch) => meaningLine(dict[ch], 2))
                .filter((s) => s && s !== 'нет в словаре')
                .join(' · ') || 'Нет глоссы в открытых данных.'}
            </p>
          )}
          <p className="kicker">Кандзи в слове — нажми знак</p>
          <div className="kanji-chips">
            {uniqueKanji(peek.written).map((ch) => (
              <button key={ch} type="button" className="chip" onClick={() => onKanji?.(ch)}>
                <span className="jp">{ch}</span>
                <small>{meaningLine(dict[ch], 1)}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {grouped ? (
            grouped.exact.length || grouped.stem.length ? (
              <>
                {grouped.exact.length ? (
                  <>
                    <p className="kicker">Словарная форма</p>
                    <WordList words={grouped.exact} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
                  </>
                ) : null}
                {grouped.stem.length ? (
                  <>
                    <p className="kicker">Другие формы и основа</p>
                    <WordList words={grouped.stem} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
                  </>
                ) : null}
              </>
            ) : (
              <p className="muted">Нет вхождений этой основы в текущем списке.</p>
            )
          ) : shown.length ? (
            <WordList words={shown} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
          ) : (
            <p className="muted">Слова подгрузятся, если есть сеть или локальный корпус.</p>
          )}
          <SentList
            sents={sents}
            extra={writings}
            readings={readings}
            furi={furi}
            onFuri={undefined}
            showGloss={showGloss}
            onWord={(w) => void openWord(w)}
            onKanji={onKanji}
          />
        </>
      )}
    </aside>
  )
}
