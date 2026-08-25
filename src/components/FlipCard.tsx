import type { ReactNode } from 'react'

type Props = {
  flipped: boolean
  onFlip: () => void
  front: ReactNode
  back: ReactNode
  hint?: string
}

export function FlipCard({ flipped, onFlip, front, back, hint }: Props) {
  return (
    <div className={`flip ${flipped ? 'is-on' : ''}`}>
      <div className="flip-inner">
        <button type="button" className="flip-face flip-front" onClick={onFlip} disabled={flipped}>
          {front}
          {hint ? <small className="flip-hint">{hint}</small> : null}
        </button>
        <div className="flip-face flip-back">{back}</div>
      </div>
    </div>
  )
}
