import { type FormEvent, useEffect, useState } from 'react'
import { Fold } from './Fold'
import { GeminiKeyField } from './GeminiKeyField'
import { memoApi, memoError } from '../lib/memo'
import { ALL_SKILLS, MNEMONIC_REFS } from '../lib/skills'

const LEN = [
  [1, 'кратко'],
  [2, 'обычно'],
  [3, 'подробно'],
  [4, 'максимум'],
] as const

function listVal(s: string | undefined): string[] {
  return (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function n(v: string | undefined, d: number) {
  const x = Number(v)
  return Number.isFinite(x) && x >= 1 ? x : d
}

type Props = {
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  disabled?: boolean
}

export function MemoSettings({ values, onChange, disabled }: Props) {
  const [usage, setUsage] = useState<{ tier: string; model: string; rpd_limit: number; rpd_used: number }[]>([])
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void memoApi
      .usage()
      .then((r) => setUsage(r.usage))
      .catch(() => undefined)
  }, [])

  function set(key: string, value: string) {
    onChange({ ...values, [key]: value })
    setSaved('')
  }

  const refs = listVal(values.mnemonic_refs)
  const per = (values.skill_len_mode || 'global') === 'per'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const r = await memoApi.saveSettings(values)
      onChange(r.values)
      setSaved('Сохранено — следующий разбор возьмёт эти настройки')
    } catch (ex) {
      setErr(memoError(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Fold title="Настройки мнемоник">
      <p className="muted">
        Подробность меняет размер пачки и бюджет на знак сразу, даже до сохранения. Сохранение нужно, чтобы те же
        настройки пережили перезапуск.
      </p>
      <GeminiKeyField />
      <form className="fold-form memo-set" onSubmit={(e) => void onSubmit(e)}>
        <fieldset className="set-sec">
          <legend>Подробность разбора</legend>
          <div className="seg wrap">
            <button
              type="button"
              className={!per ? 'is-on' : ''}
              disabled={disabled || busy}
              onClick={() => set('skill_len_mode', 'global')}
            >
              Общая
            </button>
            <button
              type="button"
              className={per ? 'is-on' : ''}
              disabled={disabled || busy}
              onClick={() => set('skill_len_mode', 'per')}
            >
              По аспектам
            </button>
          </div>
          {!per ? (
            <label className="range">
              <span>Общая длина</span>
              <select
                className="field"
                value={String(n(values.skill_len_global, 2))}
                disabled={disabled || busy}
                onChange={(e) => set('skill_len_global', e.target.value)}
              >
                {LEN.map(([v, lab]) => (
                  <option key={v} value={v}>
                    {lab}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            ALL_SKILLS.map((s) => (
              <label key={s.id} className="range">
                <span>{s.label}</span>
                <select
                  className="field"
                  value={String(n(values[`skill_len_${s.id}`], n(values.skill_len_global, 2)))}
                  disabled={disabled || busy}
                  onChange={(e) => set(`skill_len_${s.id}`, e.target.value)}
                >
                  {LEN.map(([v, lab]) => (
                    <option key={v} value={v}>
                      {lab}
                    </option>
                  ))}
                </select>
              </label>
            ))
          )}
        </fieldset>
        <fieldset className="set-sec">
          <legend>Доп. промпт</legend>
          <textarea
            className="area compact"
            rows={3}
            value={values.user_prompt || ''}
            disabled={disabled || busy}
            onChange={(e) => set('user_prompt', e.target.value)}
            placeholder="например: больше про древо радикалов, без воды"
          />
        </fieldset>
        <fieldset className="set-sec">
          <legend>Модель и ориентиры</legend>
          <label className="range">
            <span>Язык</span>
            <input
              className="field"
              value={values.mnemonic_locale || ''}
              disabled={disabled || busy}
              onChange={(e) => set('mnemonic_locale', e.target.value)}
            />
          </label>
          <label className="range">
            <span>Модель</span>
            <select
              className="field"
              value={values.gemini_tier || 'auto'}
              disabled={disabled || busy}
              onChange={(e) => set('gemini_tier', e.target.value)}
            >
              <option value="auto">авто</option>
              <option value="workhorse">быстрее</option>
              <option value="quality">тщательнее</option>
            </select>
          </label>
          <div className="memo-checks">
            {MNEMONIC_REFS.map((r) => (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={refs.includes(r.id)}
                  disabled={disabled || busy}
                  onChange={() => {
                    const next = refs.includes(r.id) ? refs.filter((x) => x !== r.id) : [...refs, r.id]
                    set('mnemonic_refs', next.join(','))
                  }}
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row-actions">
          <button type="submit" className="btn" disabled={disabled || busy}>
            Сохранить
          </button>
          {saved ? <span className="muted">{saved}</span> : null}
        </div>
        {err ? <p className="status-bad">{err}</p> : null}
      </form>
      {usage.length ? (
        <ul className="memo-usage">
          {usage.map((u) => (
            <li key={u.model}>
              {u.tier} · {u.model}
              <span>
                {u.rpd_used} / {u.rpd_limit}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Fold>
  )
}
