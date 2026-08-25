export function glossKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.;,!?]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function mergeGlosses(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    if (!list) continue
    for (const raw of list) {
      const t = raw.replace(/\s+/g, ' ').trim()
      if (!t) continue
      const k = glossKey(t)
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
  }
  return out
}
