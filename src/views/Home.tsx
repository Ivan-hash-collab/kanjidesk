import { useMemo, useState } from 'react'
import { LineChart } from '../components/Chart'
import { uniqueKanji } from '../lib/kanji'
import { summarize } from '../lib/quality'
import { dailyStudySeries } from '../lib/statsCharts'
import { loadHistory, localDayKey } from '../lib/storage'
import type { AnkiSessionFile, SessionReport, Stats } from '../types'

type Props = {
  stats: Stats
  last: string[]
  onStart: (chars: string[], title: string) => void
  onMemo: (chars: string[], title: string) => void
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fmtDay(key: string): string {
  const [, m, d] = key.split('-')
  return `${d}.${m}`
}

export function HomeView({ stats, last, onStart, onMemo }: Props) {
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState('')
  const [days, setDays] = useState(28)
  const [tab, setTab] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const hist = useMemo(() => loadHistory(), [stats.writesTotal, last.join('')])

  const heat = useMemo(() => {
    const map = new Map<string, SessionReport[]>()
    for (const h of hist) {
      const k = localDayKey(h.at)
      const bag = map.get(k) ?? []
      bag.push(h)
      map.set(k, bag)
    }
    const out: { key: string; n: number; items: SessionReport[] }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      const items = map.get(key) ?? []
      out.push({ key, n: items.length, items })
    }
    return out
  }, [hist, days])

  const charts = useMemo(() => dailyStudySeries(hist, days), [hist, days])
  const quality = charts.quality
  const volume = charts.volume

  const dayInfo = picked ? heat.find((d) => d.key === picked) : null

  function startFrom(text: string, title: string) {
    const chars = uniqueKanji(text)
    if (!chars.length) {
      setMsg('Кандзи не найдены')
      return
    }
    setMsg('')
    onStart(chars, title)
  }

  async function fromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setPaste(text)
      startFrom(text, 'Буфер')
    } catch {
      setMsg('Нет доступа к буферу — вставь вручную')
    }
  }

  async function fromAnki() {
    try {
      const res = await fetch(`./session.json?t=${Date.now()}`)
      if (!res.ok) throw new Error('no file')
      const data = (await res.json()) as AnkiSessionFile | string[]
      const chars = Array.isArray(data) ? data : data.kanji ?? []
      if (!chars.length) throw new Error('empty')
      setPaste(chars.join(''))
      onStart(chars, 'Anki · сегодня')
    } catch {
      setMsg('session.json пуст. Выгрузи сегодняшние кандзи из Anki в буфер или вставь набор ниже.')
    }
  }

  return (
    <div className="panel home dash page">
      <div className="dash-streak">
        <div>
          <b>{stats.streak}д</b>
          <span>серия</span>
        </div>
        <div>
          <b>{stats.writtenToday.length}</b>
          <span>сегодня</span>
        </div>
        <div>
          <b>{stats.writesTotal}</b>
          <span>прописей</span>
        </div>
      </div>

      <div className="dash-tools">
        <div className="seg">
          {([7, 14, 28, 90] as const).map((n) => (
            <button key={n} type="button" className={days === n ? 'is-on' : ''} onClick={() => setDays(n)}>
              {n} дн.
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className="btn ghost" onClick={() => setTab((t) => (t ? 0 : 1))} aria-label="Другой график">
            ‹
          </button>
          <button type="button" className={tab === 0 ? 'is-on' : ''} onClick={() => setTab(0)}>
            Качество
          </button>
          <button type="button" className={tab === 1 ? 'is-on' : ''} onClick={() => setTab(1)}>
            Объём кругов
          </button>
          <button type="button" className="btn ghost" onClick={() => setTab((t) => (t ? 0 : 1))} aria-label="Другой график">
            ›
          </button>
        </div>
      </div>

      <div
        className="dash-charts"
        onPointerDown={(e) => {
          const x = e.clientX
          const up = (ev: PointerEvent) => {
            const dx = ev.clientX - x
            if (dx > 40) setTab(0)
            if (dx < -40) setTab(1)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointerup', up)
        }}
      >
        {tab === 0 ? (
          quality.length > 1 ? (
            <LineChart title={`Качество кругов · ${days} дн.`} points={quality} />
          ) : (
            <p className="muted">Пока мало кругов, чтобы показать качество.</p>
          )
        ) : volume.length > 1 ? (
          <LineChart title={`Знаков за круг · ${days} дн.`} points={volume} max={Math.max(10, ...volume)} />
        ) : (
          <p className="muted">Пока мало кругов, чтобы показать объём.</p>
        )}
      </div>

      <div className="dash-heat" style={{ gridTemplateColumns: `repeat(${Math.min(days, 14)}, 1fr)` }}>
        {heat.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`heat-dot ${d.n ? (d.n > 2 ? 'is-hot' : 'is-on') : ''} ${picked === d.key ? 'is-pick' : ''}`}
            title={`${fmtDay(d.key)}: ${d.n ? `${d.n} кругов` : 'тихо'}`}
            onClick={() => setPicked(d.key === picked ? null : d.key)}
          />
        ))}
      </div>
      {dayInfo ? (
        <div className="dash-day">
          <p>
            <b>{fmtDay(dayInfo.key)}</b>
            {dayInfo.n ? ` · ${dayInfo.n} кругов` : ' · в этот день кругов не было'}
          </p>
          {dayInfo.items.map((h, i) => {
            const s = summarize(h.items)
            return (
              <p key={`${h.at}-${i}`} className="muted">
                {h.mode} · {h.title} · {h.items.length} знаков · качество {s.quality}
              </p>
            )
          })}
        </div>
      ) : (
        <p className="muted">Нажми день — что было в кругах.</p>
      )}

      <section className="dash-card">
        <div className="dash-guide">
          <span className="dash-mark">墨</span>
          <p>
            {last.length
              ? `В сессии ${last.length} кандзи. Пропись здесь, интервалы — в Anki.`
              : 'Загрузи сегодняшние кандзи из Anki или вставь набор.'}
          </p>
        </div>
        <div className="dash-go">
          <button type="button" className="btn primary dash-start" onClick={() => (last.length ? onStart(last, 'Последняя сессия') : void fromAnki())}>
            {last.length ? `Открыть сессию (${last.length})` : 'Загрузить из Anki'}
          </button>
          {last.length ? (
            <>
              <button type="button" className="btn" onClick={() => onStart(last, 'Продолжить')}>
                Учёба
              </button>
              <button type="button" className="btn" onClick={() => onMemo(last, 'Продолжить')}>
                Мнемоники
              </button>
            </>
          ) : null}
        </div>
      </section>

      <section className="dash-card tight">
        <h3>Вставить набор</h3>
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void fromClipboard()}>
            Буфер
          </button>
          <button type="button" className="btn" onClick={() => void fromAnki()}>
            Файл Anki
          </button>
        </div>
        <textarea
          className="area compact"
          rows={2}
          placeholder="Кандзи…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="row-actions">
          <button type="button" className="btn primary" onClick={() => startFrom(paste, 'Вставка')}>
            В учёбу
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const chars = uniqueKanji(paste)
              if (!chars.length) {
                setMsg('Кандзи не найдены')
                return
              }
              setMsg('')
              onMemo(chars, 'Вставка')
            }}
          >
            В мнемоники
          </button>
        </div>
        {msg ? <p className="status-bad">{msg}</p> : null}
      </section>
    </div>
  )
}
