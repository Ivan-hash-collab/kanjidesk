import { memo, useCallback, useRef, useState } from 'react'
import { GradeStamp } from './GradeStamp'
import { MemoWriter } from './MemoWriter'
import type { WriterHandle } from './Writer'
import type { Settings, WriteReport } from '../types'

type Live = { mistakes: number; backwards: number; stroke: number; hinted: number }

function Hud({ live }: { live: Live }) {
  return (
    <p className="live-hud">
      <span>черта <b>{live.stroke || '—'}</b></span>
      <span>ошибки <b>{live.mistakes}</b></span>
      <span>назад <b>{live.backwards}</b></span>
      <span>подсказки <b>{live.hinted}</b></span>
    </p>
  )
}

const HudMem = memo(Hud)

type WriteBoardProps = {
  char: string
  index: number
  total: number
  infoStrokes: number | null
  locked: boolean
  retry: number
  qs: Settings
  drawOutline: boolean
  revealed: boolean
  confirmSkip: boolean
  writeDone: boolean
  lockedQuality?: number
  lockedWrite?: WriteReport
  snapshot?: string
  readPills: React.ReactNode
  meaning: string
  showReadPills: boolean
  onReveal: () => void
  onFinish: (rep: WriteReport) => void
  onSkip: () => void
  onNext: () => void
  onRetry: () => void
  onCancelSkip: () => void
}

export const WriteBoard = memo(function WriteBoard({
  char,
  index,
  total,
  infoStrokes,
  locked,
  retry,
  qs,
  drawOutline,
  revealed,
  confirmSkip,
  writeDone,
  lockedQuality,
  lockedWrite,
  snapshot,
  readPills,
  meaning,
  showReadPills,
  onReveal,
  onFinish,
  onSkip,
  onNext,
  onRetry,
  onCancelSkip,
}: WriteBoardProps) {
  const [live, setLive] = useState<Live>({ mistakes: 0, backwards: 0, stroke: 0, hinted: 0 })
  const writerRef = useRef<WriterHandle>(null)

  const bump = useCallback((next: Live) => setLive(next), [])
  const finish = useCallback(
    (rep: WriteReport) => {
      setLive({ mistakes: rep.totalMistakes, backwards: rep.backwards, stroke: rep.strokeCount, hinted: rep.hintedStrokes })
      onFinish(rep)
    },
    [onFinish],
  )

  return (
    <div className="write-run">
      <div className="write-prompt">
        <div className="flash-meta">
          <span>кандзи {index + 1} / {total || 1}</span>
          <span>{live.stroke ? `${live.stroke} черта` : `${infoStrokes ?? '—'} черт`}</span>
        </div>
        {qs.hideAnswers && !revealed ? (
          <button type="button" className="btn" onClick={onReveal}>Показать чтения</button>
        ) : showReadPills ? (
          <>
            {readPills}
            <p className="flash-mean">{meaning}</p>
          </>
        ) : null}
      </div>
      <MemoWriter
        ref={writerRef}
        key={`${index}-${locked ? 'lock' : retry}`}
        char={char}
        mode={locked ? 'review' : ((drawOutline || qs.showOutline) ? 'practice' : 'write')}
        settings={qs}
        variant="board"
        snapshot={snapshot}
        stamp={locked ? <GradeStamp quality={lockedQuality ?? 0} write={lockedWrite} /> : null}
        onComplete={locked ? undefined : finish}
        onLive={locked ? undefined : bump}
        onSkip={locked ? undefined : onSkip}
      />
      <HudMem live={live} />
      <div className="row-actions">
        {locked ? (
          <>
            <p className="muted">Этот знак уже оценён — переписать нельзя.</p>
            <button type="button" className="btn primary" onClick={onNext}>Дальше</button>
          </>
        ) : confirmSkip ? (
          <>
            <button type="button" className="btn bad" onClick={onSkip}>Да, пропустить</button>
            <button type="button" className="btn" onClick={onCancelSkip}>Писать дальше</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => writerRef.current?.hint()}>Подсказать черту</button>
            <button type="button" className="btn" onClick={onRetry}>Ещё раз</button>
            <button type="button" className="btn skip-btn" onClick={onSkip} title="Пропустить этот кандзи и взять следующий">Пропустить кандзи</button>
            {writeDone && !qs.autoNext ? (
              <button type="button" className="btn primary" onClick={onNext}>Дальше</button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
})
