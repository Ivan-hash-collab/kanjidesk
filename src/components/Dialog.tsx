import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Layer = { id: string; z: number }

const stack: Layer[] = []

function acquire(id: string): number {
  const existing = stack.find((l) => l.id === id)
  if (existing) return existing.z
  const z = 100 + stack.length * 12
  stack.push({ id, z })
  return z
}

function release(id: string) {
  const i = stack.findIndex((l) => l.id === id)
  if (i >= 0) stack.splice(i, 1)
}

function isTop(id: string): boolean {
  return stack[stack.length - 1]?.id === id
}

type Props = {
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
  labelledBy?: string
  className?: string
}

export function Dialog({ open, onClose, children, wide, labelledBy, className }: Props) {
  const reactId = useId()
  const id = `dlg-${reactId}`
  const zRef = useRef<number | null>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  if (open && zRef.current == null) zRef.current = acquire(id)

  useLayoutEffect(() => {
    if (!open) return undefined
    prevFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      release(id)
      zRef.current = null
      document.body.style.overflow = stack.length ? 'hidden' : prevOverflow
      prevFocus.current?.focus?.()
    }
  }, [open, id])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTop(id)) {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, id])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="dialog-back"
      style={{ zIndex: zRef.current ?? 100 }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && isTop(id)) onCloseRef.current()
      }}
    >
      <div
        className={`dialog-pane ${wide ? 'is-wide' : ''} ${className || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
