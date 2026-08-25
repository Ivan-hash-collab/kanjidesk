const YOUON = /[ゃゅょぁぃぅぇぉャュョァィゥェォ]/

export function moraList(kana: string): string[] {
  const s = [...(kana || '')].filter((ch) => /[\u3040-\u30FFー]/.test(ch)).join('')
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    const cur = s[i] ?? ''
    const nxt = s[i + 1] ?? ''
    if (nxt && (YOUON.test(nxt) || nxt === 'ー' || nxt === 'っ' || nxt === 'ッ')) {
      if (nxt === 'っ' || nxt === 'ッ') {
        out.push(cur)
        out.push(nxt)
        i += 1
        continue
      }
      out.push(cur + nxt)
      i += 1
      continue
    }
    out.push(cur)
  }
  return out.filter(Boolean)
}
