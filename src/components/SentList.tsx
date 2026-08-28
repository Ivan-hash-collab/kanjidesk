import { useEffect, useMemo, useState } from 'react'
import { tidyEn, type Sentence } from '../lib/lexicon'
import type { FuriMode } from '../types'
import { ScanText } from './ScanText'

type Props = {
  sents: Sentence[]
  extra: string[]
  readings?: Record<string, string>
  furi: FuriMode
  onFuri?: (f: FuriMode) => void
  showGloss: boolean
  mask?: string
  onWord: (written: string) => void
  onKanji?: (ch: string) => void
}

export function SentList({
  sents,
  extra,
  readings,
  furi,
  showGloss,
  mask,
  onWord,
  onKanji,
}: Props) {
  const [en, setEn] = useState(showGloss)
  useEffect(() => setEn(showGloss), [showGloss])
  const map = useMemo(() => readings ?? {}, [readings])
  if (!sents.length) return null
  return (
    <div className="sent-block">
      <div className="sent-tools">
        <p className="kicker">Примеры · наведи · Shift — другой разбор</p>
        <button type="button" className="btn" onClick={() => setEn((v) => !v)}>
          {en ? 'Скрыть перевод' : 'Показать перевод'}
        </button>
      </div>
      <ul className="sent-list">
        {sents.map((s) => (
          <li key={s.ja}>
            <p className="sent-ja">
              <ScanText
                text={s.ja}
                extra={extra}
                readings={map}
                furi={furi}
                mask={mask}
                onWord={onWord}
                onKanji={onKanji}
              />
            </p>
            {en ? <p className="sent-en">{tidyEn(s.en)}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
