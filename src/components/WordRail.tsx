import { useEffect, useMemo, useState } from 'react'
import { meaningLine, uniqueKanji } from '../lib/kanji'
import { findWord, sentencesFor, wordsForKanji, wordsForReading, type LexWord, type Sentence } from '../lib/lexicon'
import { addScanTerms } from '../lib/scan'
import { toRomaji } from '../lib/kana'
import type { FuriMode, KanjiDict } from '../types'
import { DictFilters } from './DictFilters'
import { WordRank } from './FreqTag'
import { KanjiRun } from './KanjiRun'
import { SentList } from './SentList'
import { filterWords, type DictSort, type JlptFilter } from '../lib/dictSearch'
import { effectiveMeanings } from '../lib/wordMeta'
import { PitchAccent } from './PitchAccent'

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
      {words.map((w) => (
        <li key={w.written + w.kana}>
          <button type="button" className="word-row" onClick={() => onOpen(w.written)}>
            <span className="word-row-main">
              <KanjiRun text={w.written} furi={furi} wordReading={w.kana} />
              <PitchAccent kana={w.kana} patterns={w.pitch} compact />
            </span>
            <span>
              {effectiveMeanings(w.written, w.kana, w.meanings)[0] || w.kana || meaningLine(dict[w.written[0]], 1)}{' '}
              <WordRank written={w.written} alts={w.alts} kana={w.kana} dict={dict} common={w.common} />
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
  const [jlpt, setJlpt] = useState<JlptFilter>('all')
  const [sort, setSort] = useState<DictSort>('freq')

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
  const filtered = useMemo(
    () => filterWords(shown, '', dict, jlpt, sort, 120),
    [shown, dict, jlpt, sort],
  )
  const filteredExact = useMemo(
    () => (grouped ? filterWords(grouped.exact, '', dict, jlpt, sort, 60) : []),
    [grouped, dict, jlpt, sort],
  )
  const filteredStem = useMemo(
    () => (grouped ? filterWords(grouped.stem, '', dict, jlpt, sort, 60) : []),
    [grouped, dict, jlpt, sort],
  )

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
        {shown.length ? ` · ${filtered.length} из ${shown.length}` : ''}
      </p>
      <DictFilters jlpt={jlpt} onJlpt={setJlpt} sort={sort} onSort={setSort} kind="words" />
      {peek ? (
        <div className="word-peek">
          <button type="button" className="btn ghost" onClick={() => setPeek(null)}>
            ← к списку
          </button>
          <p className="word-head">
            <KanjiRun text={peek.written} furi={furi} wordReading={peek.kana} />
          </p>
          <p className="muted">
            {peek.kana || '—'}
            {peek.kana ? ` · ${toRomaji(peek.kana)}` : ''}
          </p>
          <PitchAccent kana={peek.kana} patterns={peek.pitch} />
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
                {filteredExact.length ? (
                  <>
                    <p className="kicker">Словарная форма</p>
                    <WordList words={filteredExact} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
                  </>
                ) : null}
                {filteredStem.length ? (
                  <>
                    <p className="kicker">Другие формы и основа</p>
                    <WordList words={filteredStem} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
                  </>
                ) : null}
                {!filteredExact.length && !filteredStem.length ? (
                  <p className="muted">Нет слов с этим JLPT для данной основы.</p>
                ) : null}
              </>
            ) : (
              <p className="muted">Нет вхождений этой основы в текущем списке.</p>
            )
          ) : filtered.length ? (
            <WordList words={filtered} furi={furi} dict={dict} onOpen={(w) => void openWord(w)} />
          ) : (
            <p className="muted">
              {words.length ? 'Нет слов с этим фильтром.' : 'Слова подгрузятся, если есть сеть или локальный корпус.'}
            </p>
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
