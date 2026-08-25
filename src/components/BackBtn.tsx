type Props = {
  onClick: () => void
  label?: string
}

export function BackBtn({ onClick, label = 'Назад' }: Props) {
  return (
    <button type="button" className="btn back-btn" onClick={onClick} title={label}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path
          d="M15.5 5.5 8.5 12l7 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  )
}
