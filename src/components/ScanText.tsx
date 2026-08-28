import { useEffect, useMemo, useState } from 'react'
import { enrichScanForText, ensureScanTerms, greedyMask, greedySeg, lookupHits, squashJa } from '../lib/scan'
import type { MorphHit } from '../lib/morph'
import type { FuriMode } from '../types'

const CJK = /[\u3400-\u9FFF々]/

type Props = {
  text: string
  extra?: string[]
  readings?: Record<string, string>
  furi?: FuriMode
  active?: string
  mask?: string
  onWord: (written: string) => void
  onKanji?: (ch: string) => void
}

export function ScanText({ text, extra = [], readings, furi = 'off', active, mask, onWord, onKanji }: Props) {
  const [ready, setReady] = useState(false)
  const [pos, setPos] = useState(-1)
  const [alt, setAlt] = useState(0)
  const ja = useMemo(() => squashJa(text), [text])

  useEffect(() => {
    let live = true
    void Promise.all([ensureScanTerms(), enrichScanForText(ja)]).then(() => {
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [ja])

  const hits = useMemo(
    () => (pos < 0 ? [] : lookupHits(ja, pos, extra)),
    [ja, pos, extra, ready],
  )
  const pick = hits.length ? hits[alt % hits.length] : null
  const linked = useMemo(() => greedyMask(ja, extra), [ja, extra, ready])
  const segs = useMemo(() => greedySeg(ja, extra), [ja, extra, ready])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Shift' || e.repeat || pos < 0 || hits.length < 2) return
      setAlt((a) => a + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pos, hits.length])

  function choose(h: MorphHit | string | null) {
    if (!h) return
    if (typeof h === 'string') {
      if (h.length === 1 && CJK.test(h) && onKanji) onKanji(h)
      else if (h.length > 1 || CJK.test(h)) onWord(h)
      setPos(-1)
      setAlt(0)
      return
    }
    if (h.kind === 'kanji' && onKanji) onKanji(h.surface)
    else onWord(h.lemma || h.surface)
    setPos(-1)
    setAlt(0)
  }

  function chNode(i: number, ch: string) {
    const on = Boolean(pick && i >= pos && i < pos + pick.surface.length)
    return (
      <span
        key={`${i}-${ch}`}
        className={`scan-ch ${linked[i] ? 'is-link' : ''} ${on ? 'is-on' : ''} ${CJK.test(ch) ? 'jp' : ''}`}
        onMouseEnter={(e) => {
          // Не сбрасывать выделение, когда тянем текст мышью — иначе копирование рвётся.
          if (e.buttons > 0) return
          setPos(i)
          setAlt(0)
        }}
        onClick={(e) => {
          e.preventDefault()
          if (e.shiftKey && hits.length > 1) {
            setAlt((a) => a + 1)
            return
          }
          const atHits = lookupHits(ja, i, extra)
          const current = pick && i >= pos && i < pos + pick.surface.length ? pick : atHits[0]
          choose(current ?? { surface: ch, lemma: ch, kind: CJK.test(ch) ? 'kanji' : 'word', score: 0 })
        }}
      >
        {mask?.includes(ch) && !on ? <span className="mask-tile">＿</span> : ch}
      </span>
    )
  }

  return (
    <span
      className="scan-wrap"
      onMouseLeave={() => {
        setPos(-1)
        setAlt(0)
      }}
    >
      <span className="scan-run">
        {segs.map((seg) => {
          const inner = [...seg.s].map((ch, j) => chNode(seg.start + j, ch))
          const kana = readings?.[seg.s] || readings?.[seg.lemma]
          if (kana && furi !== 'off') {
            return (
              <ruby key={seg.start} className={`furi-${furi} word-ruby`}>
                <span className="word-ruby-base">{inner}</span>
                <rt>{kana}</rt>
              </ruby>
            )
          }
          return <span key={seg.start}>{inner}</span>
        })}
      </span>
      {pos >= 0 && (hits.length > 1 || (pick && pick.kind === 'word' && pick.lemma !== pick.surface)) ? (
        <span className="scan-pop" role="listbox">
          <small>с этой позиции · Shift — другой разбор</small>
          {hits.map((h, n) => (
            <button
              key={`${h.kind}-${h.surface}-${h.lemma}-${n}`}
              type="button"
              className={`scan-opt ${h === pick ? 'is-on' : ''} ${active === h.lemma || active === h.surface ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(h)}
            >
              <b className="jp">{h.surface}</b>
              <em>
                {h.kind === 'kanji'
                  ? 'кандзи'
                  : h.lemma && h.lemma !== h.surface
                    ? `${h.lemma} · слово`
                    : 'слово'}
              </em>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
