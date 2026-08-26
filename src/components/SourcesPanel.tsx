import { useEffect, useState } from 'react'
import { loadGzJson, loadJson } from '../lib/gzipJson'
import type { KanjiDict } from '../types'

type Row = {
  side: 'кандзи' | 'слова'
  name: string
  role: string
  n: string
  on: boolean
}

type Props = {
  dict: KanjiDict
}

export function SourcesPanel({ dict }: Props) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let live = true
    const kanjiN = Object.keys(dict).length
    const jlptN = Object.values(dict).filter((x) => x.jlpt).length
    void Promise.all([
      loadJson<unknown[]>('./data/freq-words.json')
        .then((x) => x.length)
        .catch(() => 0),
      loadJson<unknown[]>('./data/freq-kanji.json')
        .then((x) => x.length)
        .catch(() => 0),
      loadGzJson<Record<string, unknown>>('./data/sents-kanji.json.gz')
        .then((x) => Object.keys(x).length)
        .catch(() => 0),
      loadGzJson<Record<string, unknown>>('./data/words-by-kanji.json.gz')
        .then((x) => Object.keys(x).length)
        .catch(() => 0),
      loadJson<unknown>('./data/trees.json')
        .then(() => true)
        .catch(() => false),
      loadGzJson<Record<string, unknown>>('./data/pitch.json.gz')
        .then((x) => Object.keys(x).length)
        .catch(() => 0),
    ]).then(([words, kfreq, sents, jm, trees, pitch]) => {
      if (!live) return
      setRows([
        {
          side: 'кандзи',
          name: 'KANJIDIC (EDRDG)',
          role: 'значения, он/кун, JLPT, школьный год, газетная частота → тег «кандзи #N»',
          n: `${kanjiN} знаков · JLPT ${jlptN} · без JLPT ${kanjiN - jlptN}`,
          on: kanjiN > 0,
        },
        {
          side: 'кандзи',
          name: 'KANJIDIC frequency',
          role: 'тот же газетный ранг для списков «частые кандзи»',
          n: kfreq ? `${kfreq} с рангом` : 'нет файла',
          on: kfreq > 0,
        },
        {
          side: 'кандзи',
          name: 'AnimCJK / KanjiVG',
          role: 'порядок штрихов в прописи',
          n: 'локальный пакет штрихов',
          on: true,
        },
        {
          side: 'кандзи',
          name: 'KRADFILE + IDS',
          role: 'радикалы и дерево знака',
          n: trees ? 'деревья установлены' : 'нет файла',
          on: Boolean(trees),
        },
        {
          side: 'слова',
          name: 'Kanjium pitch',
          role: 'диаграмма питча (хеибан / атамадака / накадака)',
          n: pitch ? `${pitch} ключей` : 'нет файла',
          on: Boolean(pitch),
        },
        {
          side: 'слова',
          name: 'JMdict English (полный)',
          role: 'написания, кана, английские глоссы — не common-only',
          n: jm ? `${jm} знаков с лексикой` : 'сеть: kanjiapi.dev',
          on: jm > 0,
        },
        {
          side: 'слова',
          name: 'JMdict via kanjiapi.dev',
          role: 'добор слов, если локального индекса мало',
          n: 'по сети, кэш в сессии',
          on: true,
        },
        {
          side: 'слова',
          name: 'OpenSubtitles 2016',
          role: 'частота словоформ → тег «слово #N»',
          n: words ? `${words} словоформ` : 'нет файла',
          on: words > 0,
        },
        {
          side: 'слова',
          name: 'Tanaka corpus + Tatoeba',
          role: 'примеры предложений с переводом',
          n: sents ? `${sents} кандзи с фразами` : 'нет файла',
          on: sents > 0,
        },
      ])
    })
    return () => {
      live = false
    }
  }, [dict])

  return (
    <div className="source-block">
      <p className="setup-label">Словари</p>
      <p className="muted">
        Теги частоты и JLPT берутся только из установленных корпусов ниже. Это открытые данные, не база
        Kanji Study.
      </p>
      <ul className="source-rows">
        {rows.map((r) => (
          <li key={r.name} className={r.on ? 'is-on' : 'is-off'}>
            <b>{r.side}</b>
            <div>
              <strong>{r.name}</strong>
              <span>{r.role}</span>
              <small>{r.on ? `установлен · ${r.n}` : `не найден · ${r.n}`}</small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
