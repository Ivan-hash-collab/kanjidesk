import { stampOf } from '../lib/quality'
import type { WriteReport } from '../types'

type Props = {
  quality: number
  write?: WriteReport | null
}

export function GradeStamp({ quality, write }: Props) {
  const s = stampOf(quality)
  const detail = write
    ? `${write.totalMistakes} ош. / ${write.strokeCount || '—'} черт`
    : s.ru
  return (
    <span className={`grade-stamp g-${s.letter}`} title={`${s.ru} · ${quality}`}>
      <b className="jp">{s.ja}</b>
      <small>{s.letter}</small>
      <em>{detail}</em>
    </span>
  )
}
