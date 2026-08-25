import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CompTree } from '../components/CompTree'
import { Fold } from '../components/Fold'
import { KanjiPad } from '../components/KanjiPad'
import { FreqTag, WordRank } from '../components/FreqTag'
import { KanjiRun } from '../components/KanjiRun'
import { PitchAccent } from '../components/PitchAccent'
import { ReadPills } from '../components/ReadPills'
import { Tip } from '../components/Tip'
import { SentList } from '../components/SentList'
import { compositionOf, type CompNode } from '../lib/compose'
import { freqLabel, freqOfKanji, freqOfWord } from '../lib/freq'
import { gradeLabel, infoOf, jlptLabel, meaningLine, searchDict, uniqueKanji } from '../lib/kanji'
import { findWord, sentencesFor, wordsForKanji, type LexWord, type Sentence } from '../lib/lexicon'
import { addScanTerms } from '../lib/scan'
import { speakJa } from '../lib/speech'
import type { FuriMode, KanjiDict } from '../types'

type Frame = { kind: 'kanji'; ch: string } | { kind: 'word'; written: string }

export type DictApi = {
  back: () => boolean
  reset: () => void
}

type Props = {
  dict: KanjiDict
  speech: boolean
  furi: FuriMode
  showGloss?: boolean
  focus?: string
  focusWord?: string
  focusQuery?: string
  onStudy: (chars: string[], name?: string) => void
  sessionChars?: string[]
  sessionTitle?: string
  onDepth?: (n: number) => void
}

export const DictionaryView = forwardRef<DictApi, Props>(function DictionaryView(
  {
  dict,
  speech,
  furi,
  showGloss = true,
  focus,
  focusWord,
  focusQuery,
  onStudy,
  onDepth,
}: Props,
  ref,
) {
  const [q, setQ] = useState(focusQuery || focusWord || focus || '')
  const [kanji, setKanji] = useState(focus || '')
  const [word, setWord] = useState<LexWord | null>(null)
  const [words, setWords] = useState<LexWord[]>([])
  const [sents, setSents] = useState<Sentence[]>([])
  const [busy, setBusy] = useState('')
  const [tree, setTree] = useState<{ raw: string; parts: string[]; tree: CompNode | null; rads: string[] } | null>(null)
  const [kFreq, setKFreq] = useState('')
  const [kRank, setKRank] = useState<number | null>(null)
  const [wFreq, setWFreq] = useState('')
  const [wRank, setWRank] = useState<number | null>(null)
  const [wKind, setWKind] = useState<'word' | 'kanji'>('word')
  const [stack, setStack] = useState<Frame[]>([])
  const skipPush = useRef(false)
  const req = useRef(0)
  const [missing, setMissing] = useState('')

  const hits = useMemo(() => searchDict(dict, q), [dict, q])
  const info = infoOf(dict, kanji)
  const readings = useMemo(() => {
    const m: Record<string, string> = {}
    for (const w of words) {
      if (w.kana) m[w.written] = w.kana
    }
    if (word?.kana) m[word.written] = word.kana
    return m
  }, [words, word])

  useEffect(() => {
    onDepth?.(stack.length)
  }, [stack.length, onDepth])

  function pushFrame(f: Frame) {
    if (skipPush.current) {
      skipPush.current = false
      return
    }
    setStack((s) => {
      const last = s[s.length - 1]
      if (last?.kind === 'kanji' && f.kind === 'kanji' && last.ch === f.ch) return s
      if (last?.kind === 'word' && f.kind === 'word' && last.written === f.written) return s
      return [...s, f]
    })
  }

  function applyFrame(f: Frame | undefined) {
    if (!f) return
    skipPush.current = true
    if (f.kind === 'kanji') void openKanji(f.ch)
    else void openWritten(f.written)
  }

  useImperativeHandle(ref, () => ({
    back() {
      if (stack.length <= 1) return false
      const next = stack.slice(0, -1)
      setStack(next)
      applyFrame(next[next.length - 1])
      return true
    },
    reset() {
      setStack([])
    },
  }))

  useEffect(() => {
    setStack([])
    if (focusQuery) {
      setQ(focusQuery)
      const chars = uniqueKanji(focusQuery)
      if (chars.length === 1 && focusQuery === chars[0]) void openKanji(chars[0])
      else void openWritten(focusQuery)
      return
    }
    if (focusWord) {
      setQ(focusWord)
      void openWritten(focusWord)
      return
    }
    if (focus) {
      setQ(focus)
      void openKanji(focus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, focusWord, focusQuery])

  useEffect(() => {
    if (!kanji) {
      setTree(null)
      setKFreq('')
      setKRank(null)
      return
    }
    void compositionOf(kanji).then(setTree)
    const fromDict = infoOf(dict, kanji)?.freq ?? null
    setKRank(fromDict)
    void freqOfKanji(kanji, fromDict).then((r) => {
      setKRank(r)
      setKFreq(r ? freqLabel(r) : '')
    })
  }, [kanji])

  useEffect(() => {
    if (!word) {
      setWFreq('')
      setWRank(null)
      setWKind('word')
      return
    }
    void freqOfWord(word.written, [...(word.alts ?? []), word.kana]).then((f) => {
      setWRank(f?.r ?? null)
      setWKind(f?.kind ?? 'word')
      setWFreq(f?.n != null ? `${f.n.toLocaleString('ru-RU')} в корпусе` : '')
    })
  }, [word])

  async function openKanji(ch: string) {
    const token = ++req.current
    setKanji(ch)
    setWord(null)
    setMissing('')
    pushFrame({ kind: 'kanji', ch })
    setBusy('слова…')
    const [w, s] = await Promise.all([wordsForKanji(ch), sentencesFor(ch)])
    if (token !== req.current) return
    setWords(w)
    setSents(s)
    addScanTerms(w.flatMap((x) => [x.written, x.kana, ...(x.alts ?? [])]))
    setBusy('')
  }

  async function openWritten(written: string) {
    const token = ++req.current
    setBusy('слово…')
    setMissing('')
    const found = await findWord(written)
    if (token !== req.current) return
    if (found) {
      setWord(found)
      pushFrame({ kind: 'word', written: found.written })
      const chars = uniqueKanji(found.written)
      if (chars[0]) setKanji(chars[0])
      const [s, w] = await Promise.all([
        sentencesFor(found.written),
        chars[0] ? wordsForKanji(chars[0]) : Promise.resolve([] as LexWord[]),
      ])
      if (token !== req.current) return
      setSents(s)
      if (chars[0]) setWords(w)
    } else if (written.length === 1) {
      await openKanji(written)
      return
    } else {
      setWord(null)
      setKanji(uniqueKanji(written)[0] || '')
      setSents([])
      setWords([])
      setMissing(written)
      pushFrame({ kind: 'word', written })
    }
    setBusy('')
  }

  async function openWord(w: LexWord) {
    setWord(w)
    pushFrame({ kind: 'word', written: w.written })
    setSents(await sentencesFor(w.written))
  }

  function submitSearch() {
    const t = q.trim()
    if (!t) return
    const chars = uniqueKanji(t)
    if (chars.length === 1 && t === chars[0]) void openKanji(chars[0])
    else if (chars.length || /[\u3040-\u30FFー]/.test(t)) void openWritten(t)
    else if (hits[0]) void openKanji(hits[0])
  }

  return (
    <div className="panel page dict-view">
      <header className="panel-head tight">
        <div>
          <p className="kicker">Словарь</p>
          <h2>Кандзи и слова</h2>
        </div>
      </header>

      <form
        className="dict-search"
        onSubmit={(e) => {
          e.preventDefault()
          submitSearch()
        }}
      >
        <input
          className="field"
          placeholder="霧 · きり · fog · 猶予"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn primary">
          Найти
        </button>
      </form>
      {busy ? <p className="muted">{busy}</p> : null}

      <div className="dict-layout">
        <div className="dict-hits">
          {hits.map((ch) => (
            <button
              key={ch}
              type="button"
              className={ch === kanji && !word ? 'is-on' : ''}
              onClick={() => void openKanji(ch)}
            >
              <b className="jp">{ch}</b>
              <span>
                {meaningLine(dict[ch], 2)} <FreqTag rank={dict[ch].freq} kind="kanji" jlpt={dict[ch].jlpt} />
              </span>
            </button>
          ))}
        </div>

        {missing ? (
          <article className="dict-card">
            <p className="empty">
              Слово «{missing}» не найдено. Не собираю карточку из значений отдельных кандзи.
            </p>
          </article>
        ) : null}
        {word ? (
          <article className="dict-card word-card">
            <button type="button" className="btn ghost" onClick={() => {
              if (stack.length > 1) {
                const next = stack.slice(0, -1)
                setStack(next)
                applyFrame(next[next.length - 1])
              } else {
                setWord(null)
              }
            }}>
              ← назад
            </button>
            <p className="word-head">
              <KanjiRun text={word.written} furi={furi} wordReading={word.kana} />
              <FreqTag rank={wRank} kind={wKind} jlpt={infoOf(dict, uniqueKanji(word.written)[0] || '')?.jlpt} />
            </p>
            <p className="muted">{word.kana}{wFreq ? ` · корпус: ${wFreq}` : ''}</p>
            <PitchAccent kana={word.kana} />
            <p className="muted">Слово целиком. Отдельный знак — чип «Кандзи в слове», не клик по иероглифу в заголовке.</p>
            {word.meanings.length ? (
              <ol className="gloss-list">
                {word.meanings.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                {uniqueKanji(word.written)
                  .map((ch) => meaningLine(dict[ch], 2))
                  .filter((s) => s && s !== 'нет в словаре')
                  .join(' · ') || 'Нет глоссы в открытых данных — смотри примеры ниже.'}
              </p>
            )}
            <p className="kicker">Кандзи в слове</p>
            <div className="kanji-chips">
              {uniqueKanji(word.written).map((ch) => (
                <button key={ch} type="button" className="chip" onClick={() => void openKanji(ch)}>
                  <span className="jp">{ch}</span>
                  <small>{meaningLine(dict[ch], 1)}</small>
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => speakJa(word.kana || word.written, speech)}>
                Слушать
              </button>
              <Tip label="Пропишет каждое кандзи слова по очереди, не только первое. Кану пропускаем.">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onStudy(uniqueKanji(word.written), word.written)}
                >
                  Прописать все кандзи
                </button>
              </Tip>
            </div>
            <SentList
              sents={sents}
              extra={words.map((w) => w.written)}
              readings={readings}
              furi={furi}
              showGloss={showGloss}
              onWord={(w) => void openWritten(w)}
              onKanji={(ch) => void openKanji(ch)}
            />
          </article>
        ) : info ? (
          <article className="dict-card">
            <div className="dict-hero">
              <span className="dict-glyph jp">{kanji}</span>
              <div>
                <p className="flash-mean">
                  {info.meanings.join(' · ')} <FreqTag rank={kRank ?? info.freq} kind="kanji" jlpt={info.jlpt} />
                </p>
                <ReadPills
                  info={info}
                  onReading={(r) => {
                    const t = r.replace(/[.\-]/g, '')
                    setQ(t)
                    const hit = searchDict(dict, t)[0]
                    if (hit) void openKanji(hit)
                  }}
                />
                <div className="row-actions">
                  <button type="button" className="btn" onClick={() => speakJa(kanji, speech)}>
                    Слушать
                  </button>
                  <button type="button" className="btn primary" onClick={() => onStudy([kanji], kanji)}>
                    Прописать
                  </button>
                </div>
              </div>
            </div>
            <dl>
              <dt>Он</dt>
              <dd>{info.on.join(' · ') || '—'}</dd>
              <dt>Кун</dt>
              <dd>{info.kun.join(' · ') || '—'}</dd>
              <dt>Черты</dt>
              <dd>{info.strokes ?? '—'}</dd>
              <dt>JLPT</dt>
              <dd>{jlptLabel(info.jlpt) || '—'}</dd>
              <dt>Класс</dt>
              <dd>{gradeLabel(info.grade) || '—'}</dd>
              <dt>Частота</dt>
              <dd>{kFreq || '—'}</dd>
            </dl>
            <p className="kicker">Состав знака</p>
            <CompTree tree={tree?.tree ?? null} onKanji={(ch) => void openKanji(ch)} />
            <Fold title="Мнемоника и заметка" meta="свои поля, не агент">
              <KanjiPad char={kanji} />
            </Fold>
            {!tree?.tree && tree?.rads?.length ? (
              <p className="muted">
                Нет дерева IDS — только плоский KRADFILE, без вложенности: {tree.rads.join(' ')}
              </p>
            ) : null}
            <p className="kicker">Слова с этим знаком</p>
            {words.length ? (
              <ul className="word-rows">
                {words.slice(0, 24).map((w) => (
                  <li key={w.written + w.kana}>
                    <button type="button" className="word-row" onClick={() => void openWord(w)}>
                      <KanjiRun text={w.written} furi={furi} wordReading={w.kana} />
                      <span>
                        {w.meanings[0] || w.kana}{' '}
                        <WordRank written={w.written} alts={w.alts} kana={w.kana} dict={dict} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Нет сети или слов для этого знака. Используется открытый JMdict (kanjiapi.dev), не база Kanji Study.</p>
            )}
            <SentList
              sents={sents}
              extra={words.map((w) => w.written)}
              readings={readings}
              furi={furi}
              showGloss={showGloss}
              onWord={(w) => void openWritten(w)}
              onKanji={(ch) => void openKanji(ch)}
            />
          </article>
        ) : (
          <p className="empty">Введи кандзи, слово, кун/он или английское значение.</p>
        )}
      </div>
    </div>
  )
})
