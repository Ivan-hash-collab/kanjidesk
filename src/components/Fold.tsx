import type { ReactNode } from 'react'
import { useState } from 'react'

type Props = {
  title: string
  meta?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Fold({ title, meta, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`fold ${open ? 'is-open' : ''}`}>
      <button type="button" className="fold-head" onClick={() => setOpen((v) => !v)}>
        <span className="fold-caret" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
        <b>{title}</b>
        {meta ? <small>{meta}</small> : null}
      </button>
      {open ? <div className="fold-body">{children}</div> : null}
    </section>
  )
}
