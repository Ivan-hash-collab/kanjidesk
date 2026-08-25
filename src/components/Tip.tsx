import type { ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  className?: string
}

export function Tip({ label, children, className }: Props) {
  return (
    <span className={`tip ${className ?? ''}`}>
      {children}
      <i className="tip-bubble">{label}</i>
    </span>
  )
}
