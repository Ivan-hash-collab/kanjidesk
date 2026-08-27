import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CompTree } from '../components/CompTree'
import { Dialog } from '../components/Dialog'
import { DictFilters } from '../components/DictFilters'
import { Fold } from '../components/Fold'
import { ImportNotes } from '../components/ImportNotes'
import { KanjiPad } from '../components/KanjiPad'
import { FreqTag, WordRank } from '../components/FreqTag'
import { KanjiRun } from '../components/KanjiRun'
import { PitchAccent } from '../components/PitchAccent'
import { ReadPills } from '../components/ReadPills'
import { SimilarKanji } from '../components/SimilarKanji'
import { Tip } from '../components/Tip'
import { SentList } from '../components/SentList'
import { compositionOf, type CompNode } from '../lib/compose'
import { freqLabel, freqOfKanji, freqOfWord, preloadFreq } from '../lib/freq'
import { gradeLabel, infoOf, jlptLabel, meaningLine, uniqueKanji } from '../lib/kanji'
import { allLocalWords, findWord, sentencesFor, wordsForKanji, type LexWord, type Sentence } from '../lib/lexicon'
import { filterWords, parseDictQuery, searchKanji, wordJlpt, type DictKind, type DictSort, type JlptFilter } from '../lib/dictSearch'
import { toRomaji } from '../lib/kana'
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
  const [imp, setImp] = useState(false)
  const [kind, setKind] = useState<DictKind>('kanji')
  const [jlpt, setJlpt] = useState<JlptFilter>('all')
  const [sort, setSort] = useState<DictSort>('freq')
  const [wordHits, setWordHits] = useState<LexWord[]>([])
  const [lexReady, setLexReady] = useState(false)
  const [romaSearch, setRomaSearch] = useState(true)
  const parsed = useMemo(() => parseDictQuery(q), [q])
  const scoreOpts = useMemo(
    () => ({ noRomaji: !romaSearch || parsed.noRomaji, meaningOnly: parsed.meaningOnly, readingOnly: parsed.readingOnly }),
    [romaSearch, parsed.noRomaji, parsed.meaningOnly, parsed.readingOnly],
  )

  const hits = useMemo(
    () => searchKanji(dict, q, jlpt, sort, 240, scoreOpts),
    [dict, q, jlpt, sort, scoreOpts],
  )
  const related = useMemo(() => filterWords(words, '', dict, jlpt, sort, 200), [words, dict, jlpt, sort])
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
    void Promise.all([allLocalWords(), preloadFreq()]).then(() => setLexReady(true))
  }, [])

  useEffect(() => {
    onDepth?.(stack.length)
  }, [stack.length, onDepth])

  useEffect(() => {
    if (kind !== 'words') return
    let live = true
    const query = parsed.text
    const chars = uniqueKanji(query)
    const delay = query.length ? 80 : 0
    const t = window.setTimeout(() => {
      void (async () => {
        const source =
          chars.length === 1 && query === chars[0]
            ? await wordsForKanji(chars[0])
            : await allLocalWords()
        if (!live) return
        setWordHits(filterWords(source, q, dict, jlpt, sort, 80, scoreOpts))
      })()
    }, delay)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [kind, q, parsed.text, jlpt, sort, dict, scoreOpts])

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
      setWKind('word')
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
    const t = parsed.text.trim() || q.trim()
    if (!t && !parsed.commonOnly && parsed.jlpt == null) return
    if (kind === 'words') {
      if (wordHits[0]) void openWritten(wordHits[0].written)
      else if (t) void openWritten(t)
      return
    }
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
        <button type="button" className="btn" onClick={() => setImp(true)}>
          Импорт полей
        </button>
      </header>
      {imp ? (
        <Dialog open onClose={() => setImp(false)} labelledBy="import-notes-title">
          <ImportNotes
            defaultTarget="mnemonic"
            defaultKeep={false}
            onClose={() => setImp(false)}
          />
        </Dialog>
      ) : null}

      <form
        className="dict-search"
        onSubmit={(e) => {
          e.preventDefault()
          submitSearch()
        }}
      >
        <input
          className="field"
          placeholder="霧 · mizu · fog · -roma · en:lewd · #n5"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn primary">
          Найти
        </button>
      </form>
      <p className="dict-hint muted">
        Команды: <code>-roma</code> не искать чтение по ромадзи · <code>en:lewd</code> только значение ·{' '}
        <code>kana:みず</code> только чтение · <code>#n5</code> · <code>#common</code>
      </p>
      <DictFilters
        kind={kind}
        onKind={(next) => {
          setKind(next)
          if (next === 'words' && sort === 'strokes') setSort('freq')
          if (next === 'kanji' && sort === 'len') setSort('freq')
        }}
        jlpt={jlpt}
        onJlpt={setJlpt}
        sort={sort}
        onSort={setSort}
        roma={romaSearch}
        onRoma={setRomaSearch}
      />
      <p className="dict-meta muted">
        {kind === 'kanji'
          ? `${hits.length} знаков`
          : lexReady || wordHits.length
            ? `${wordHits.length} слов`
            : 'загружаю словарь слов…'}
        {parsed.text ? ` · по запросу «${parsed.text}»` : q.trim() ? '' : ' · каталог'}
        {!romaSearch || parsed.noRomaji ? ' · без ромадзи' : ''}
        {parsed.commonOnly ? ' · частотные' : ''}
        {parsed.jlpt ? ` · N${parsed.jlpt}` : ''}
      </p>
      {busy ? <p className="muted">{busy}</p> : null}

      <div className="dict-layout">
        <div className={`dict-hits ${kind === 'words' ? 'is-words' : ''}`}>
          {kind === 'words'
            ? wordHits.map((w) => (
                <button
                  key={`${w.written}|${w.kana}`}
                  type="button"
                  className={word?.written === w.written ? 'is-on' : ''}
                  onClick={() => void openWritten(w.written)}
                >
                  <b className="jp">{w.written}</b>
                  <span>
                    {[w.kana, w.meanings[0], w.alts?.length ? w.alts.slice(0, 2).join('、') : '']
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    <WordRank written={w.written} alts={w.alts} kana={w.kana} dict={dict} common={w.common} />
                  </span>
                </button>
              ))
            : hits.map((ch) => (
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
          {kind === 'kanji' && !hits.length ? (
            <p className="muted">Нет кандзи с этим фильтром. Сними JLPT или введи чтение / значение.</p>
          ) : null}
          {kind === 'words' && lexReady && !wordHits.length ? (
            <p className="muted">
              {q.trim()
                ? `Нет слов по запросу «${q.trim()}». Ищи английское значение целиком, чтение каной или ромадзи (mizu, sui).`
                : 'Нет слов. Переключись на кандзи или ослабь JLPT.'}
            </p>
          ) : null}
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
              <FreqTag rank={wRank} kind={wKind} jlpt={wordJlpt(word.written, dict)} common={word.common} />
            </p>
            <p className="muted">
              {word.kana}
              {word.kana ? ` · ${toRomaji(word.kana)}` : ''}
              {wFreq ? ` · корпус: ${wFreq}` : ''}
            </p>
            <PitchAccent kana={word.kana} patterns={word.pitch} />
            {word.alts?.length ? (
              <p className="muted">
                Другие написания: {word.alts.join('、')}
              </p>
            ) : null}
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
                    const hit = searchKanji(dict, t, 'all', 'freq', 8)[0]
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
            <SimilarKanji char={kanji} dict={dict} onKanji={(ch) => void openKanji(ch)} />
            <Fold title="Мнемоника и заметка" meta="свои поля, не агент">
              <KanjiPad char={kanji} />
            </Fold>
            {!tree?.tree && tree?.rads?.length ? (
              <p className="muted">Состав без дерева IDS — плоский список радикалов: {tree.rads.join(' ')}</p>
            ) : null}
            <p className="kicker">Слова с этим знаком{words.length ? ` · ${related.length} из ${words.length}` : ''}</p>
            <DictFilters jlpt={jlpt} onJlpt={setJlpt} sort={sort} onSort={setSort} kind="words" />
            {related.length ? (
              <ul className="word-rows">
                {related.map((w) => (
                  <li key={w.written + w.kana}>
                    <button type="button" className="word-row" onClick={() => void openWord(w)}>
                      <span className="word-row-main">
                        <KanjiRun text={w.written} furi={furi} wordReading={w.kana} />
                        <PitchAccent kana={w.kana} patterns={w.pitch} compact />
                      </span>
                      <span>
                        {w.meanings[0] || w.kana}{' '}
                        <WordRank written={w.written} alts={w.alts} kana={w.kana} dict={dict} common={w.common} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                {words.length
                  ? 'Нет слов с этим JLPT. Выбери «все» или другой уровень.'
                  : 'Нет сети или слов для этого знака. Используется открытый JMdict (kanjiapi.dev), не база Kanji Study.'}
              </p>
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
        ) : kind === 'words' && wordHits.length ? (
          <p className="muted">Выбери слово слева.</p>
        ) : (
          <p className="empty">Введи кандзи, слово, кун/он или английское значение — или выбери уровень JLPT слева.</p>
        )}
      </div>
    </div>
  )
})
