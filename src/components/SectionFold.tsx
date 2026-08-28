import { type ReactNode, useState } from 'react'

type Props = {
  title: string
  meta?: string
  defaultOpen?: boolean
  /** Label for the "show all" tool (e.g. "все вхождения"). Optional. */
  moreLabel?: string
  /** When set, shows a toggle to expand every item in this section. */
  onShowAll?: () => void
  children: ReactNode
}

export function SectionFold({ title, meta, defaultOpen = false, moreLabel, onShowAll, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`section-fold ${open ? 'is-open' : ''}`}>
      <header className="section-fold-head">
        <button type="button" className="fold-head" onClick={() => setOpen((v) => !v)}>
          <span className="fold-caret" aria-hidden>
            {open ? '▼' : '▶'}
          </span>
          <b>{title}</b>
          {meta ? <small>{meta}</small> : null}
        </button>
        {moreLabel && onShowAll ? (
          <button type="button" className="btn ghost section-more" onClick={onShowAll}>
            {moreLabel}
          </button>
        ) : null}
      </header>
      {open ? <div className="section-fold-body">{children}</div> : null}
    </section>
  )
}
