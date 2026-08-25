const ICONS: Record<string, string> = {
  browse: 'M4 6h16M4 12h16M4 18h10',
  practice: 'M7 4h10v16H7z M10 8h4',
  judge: 'M12 3v18M5 8h14M8 8l-3 6h6 M16 8l-3 6h6',
  drill: 'M13 3 5 14h7l-1 7 8-11h-7z',
  draw: 'M4 20l3.2-1.1L19 7.1 16.9 5 5.1 16.8 4 20z M14.6 7.3l2.1 2.1',
  mcq: 'M5 7h14M5 12h10M5 17h14 M18 10l2 2 4-4',
  selfcheck: 'M9 11l3 3 7-8 M5 19h14',
  read: 'M4 5h7v14H4z M13 5h7v14h-7z',
}

export function ModeIcon({ id }: { id: string }) {
  const d = ICONS[id] || ICONS.browse
  return (
    <svg className="mode-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
