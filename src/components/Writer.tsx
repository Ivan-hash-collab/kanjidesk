import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import HanziWriter from 'hanzi-writer'
import { strokeParams, writeQuality } from '../lib/quality'
import { loadStrokes } from '../lib/strokes'
import type { Settings, WriteReport } from '../types'

type Mode = 'write' | 'practice' | 'animate' | 'review'

export type WriterHandle = {
  hint: () => void
}

type Live = {
  mistakes: number
  backwards: number
  stroke: number
  hinted: number
}

type Props = {
  char: string
  mode: Mode
  settings: Settings
  variant?: 'board' | 'preview'
  onComplete?: (report: WriteReport) => void
  onLive?: (live: Live) => void
  onSkip?: () => void
  snapshot?: string
  stamp?: ReactNode
}

function boxSize(el: HTMLElement): number {
  const w = el.clientWidth
  const h = el.clientHeight
  const n = w && h ? Math.min(w, h) : w || h || 64
  return Math.max(64, Math.floor(n))
}

function pen(settings: Settings, size: number) {
  const n = Math.min(24, Math.max(4, settings.penWidth || 12))
  const drawingWidth = Math.max(10, Math.round(n * (size / 150)))
  return {
    drawingWidth,
    strokeWidth: drawingWidth + 3,
    outlineWidth: Math.max(5, Math.round(drawingWidth * 0.9)),
  }
}

export const Writer = forwardRef<WriterHandle, Props>(function Writer(
  { char, mode, settings, variant = 'board', onComplete, onLive, onSkip, snapshot, stamp },
  ref,
) {
  const rice = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const completeRef = useRef(onComplete)
  const liveRef = useRef(onLive)
  const statsRef = useRef({ totalMistakes: 0, backwards: 0, hintedStrokes: 0, stroke: 0 })
  completeRef.current = onComplete
  liveRef.current = onLive
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    hint() {
      const s = statsRef.current
      s.hintedStrokes += 1
      liveRef.current?.({ mistakes: s.totalMistakes, backwards: s.backwards, stroke: s.stroke, hinted: s.hintedStrokes })
      try {
        writerRef.current?.skipQuizStroke()
      } catch {
        /* ignore */
      }
    },
  }))

  useEffect(() => {
    const box = rice.current
    const el = host.current
    if (!box || !el || !char) return
    let cancelled = false
    let writer: HanziWriter | null = null
    setError(false)
    setReady(false)
    el.innerHTML = ''

    const size = boxSize(box)
    let lastSize = size
    const p = strokeParams(settings)
    const ink = pen(settings, size)
    const t0 = Date.now()
    let totalMistakes = 0
    let backwards = 0
    let hintedStrokes = 0
    let strokeCount = 0
    let firstTry = 0
    const hintedOnce = new Set<number>()
    statsRef.current = { totalMistakes: 0, backwards: 0, hintedStrokes: 0, stroke: 0 }

    function bump(live: Live) {
      liveRef.current?.(live)
    }
    function syncStats() {
      statsRef.current = { totalMistakes, backwards, hintedStrokes, stroke: strokeCount }
    }

    if (mode === 'review' && snapshot) {
      el.innerHTML = snapshot
      setReady(true)
      return () => {
        cancelled = true
        el.innerHTML = ''
      }
    }

    writer = HanziWriter.create(el, char, {
      width: size,
      height: size,
      padding: Math.max(8, Math.round(size * 0.05)),
      strokeColor: settings.dark ? '#f0e6d6' : '#1c1612',
      outlineColor: settings.dark ? '#3a332b' : '#e4d5b8',
      drawingColor: '#b23a2f',
      highlightColor: '#b23a2f',
      radicalColor: '#8b2e1f',
      showCharacter: mode === 'animate' || mode === 'review',
      showOutline: mode === 'practice' || mode === 'animate' || mode === 'review' || settings.showOutline,
      strokeAnimationSpeed: settings.hypermode ? 1.7 : 1.3,
      delayBetweenStrokes: settings.hypermode ? 40 : 100,
      drawingWidth: ink.drawingWidth,
      strokeWidth: ink.strokeWidth,
      outlineWidth: ink.outlineWidth,
      drawingFadeDuration: 160,
      charDataLoader: (c, onLoad, onErr) => {
        loadStrokes(c).then(onLoad).catch(onErr)
      },
      onLoadCharDataSuccess: () => {
        if (!cancelled) setReady(true)
      },
      onLoadCharDataError: () => {
        if (!cancelled) setError(true)
      },
    })
    writerRef.current = writer

    if (mode === 'animate') {
      void writer.animateCharacter()
    } else if (mode === 'review') {
      try {
        writer.showCharacter()
      } catch {
        /* already shown */
      }
    } else {
      void writer.quiz({
        leniency: p.leniency,
        averageDistanceThreshold: p.distThreshold,
        showHintAfterMisses: p.hintAfter,
        markStrokeCorrectAfterMisses: p.skipAfter,
        acceptBackwardsStrokes: settings.acceptBackwards,
        highlightOnComplete: true,
        onMistake: (d) => {
          totalMistakes += 1
          if (d.isBackwards) backwards += 1
          if (p.hintAfter !== false && d.mistakesOnStroke >= p.hintAfter && !hintedOnce.has(d.strokeNum)) {
            hintedOnce.add(d.strokeNum)
            hintedStrokes += 1
          }
          syncStats()
          bump({ mistakes: totalMistakes, backwards, stroke: d.strokeNum + 1, hinted: hintedStrokes })
        },
        onCorrectStroke: (d) => {
          strokeCount += 1
          if (d.mistakesOnStroke === 0) firstTry += 1
          if (d.isBackwards) backwards += 1
          syncStats()
          bump({ mistakes: totalMistakes, backwards, stroke: d.strokeNum + 1, hinted: hintedStrokes })
        },
        onComplete: (summary) => {
          const raw = {
            totalMistakes: summary.totalMistakes,
            backwards,
            hintedStrokes,
            strokeCount: Math.max(strokeCount, 1),
            firstTry,
            timeMs: Date.now() - t0,
          }
          const quality = writeQuality(raw)
          window.setTimeout(() => {
            if (cancelled) return
            try {
              writer?.showCharacter()
            } catch {
              /* ignore */
            }
            el.querySelectorAll('path').forEach((p) => {
              const stroke = p.getAttribute('stroke') || ''
              const clip = p.getAttribute('clip-path')
              if (!clip && stroke.startsWith('rgba')) p.remove()
            })
            completeRef.current?.({
              char,
              ...raw,
              quality,
              svg: el.innerHTML,
            })
          }, 380)
        },
      })
    }

    bump({ mistakes: 0, backwards: 0, stroke: 0, hinted: 0 })

    const ro = new ResizeObserver(() => {
      if (cancelled || !writer) return
      const next = boxSize(box)
      if (Math.abs(next - lastSize) < 3) return
      lastSize = next
      try {
        writer.updateDimensions({ width: next, height: next })
      } catch {
        /* ignore */
      }
    })
    ro.observe(box)

    return () => {
      cancelled = true
      ro.disconnect()
      try {
        writer?.cancelQuiz()
      } catch {
        /* ignore */
      }
      if (writerRef.current === writer) writerRef.current = null
      el.innerHTML = ''
    }
  }, [
    char,
    mode,
    snapshot,
    settings.dark,
    settings.hintAfter,
    settings.strictness,
    settings.acceptBackwards,
    settings.skipAfterMisses,
    settings.showOutline,
    settings.hypermode,
    settings.penWidth,
  ])

  return (
    <div ref={rice} className={`rice ${variant} ${variant === 'board' ? 'grid4' : ''} ${error ? 'is-error' : ''} ${mode === 'review' ? 'is-review' : ''}`}>
      <div ref={host} className="writer-host" />
      {stamp}
      {!ready && !error ? <div className="writer-wait">штрихи…</div> : null}
      {error ? (
        <div className="writer-fallback">
          <span className="writer-fallback-char">{char}</span>
          <p>Нет схемы штрихов для {char}. Пропусти этот кандзи и иди дальше.</p>
          {onSkip && mode !== 'review' ? (
            <button type="button" className="btn primary" onClick={onSkip}>
              Пропустить кандзи
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
