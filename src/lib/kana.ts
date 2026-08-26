/** Hepburn (modified) + kunrei aliases. Longest tokens first. */
const ROMA_TO_HIRA: [string, string][] = [
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'], ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['shi', 'し'], ['chi', 'ち'], ['tsu', 'つ'], ['fu', 'ふ'],
  ['si', 'し'], ['ti', 'ち'], ['tu', 'つ'], ['hu', 'ふ'], ['zi', 'じ'], ['di', 'ぢ'], ['du', 'づ'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['sa', 'さ'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['za', 'ざ'], ['ji', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['ta', 'た'], ['te', 'て'], ['to', 'と'],
  ['da', 'だ'], ['de', 'で'], ['do', 'ど'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
  ['ha', 'は'], ['hi', 'ひ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
  ['wa', 'わ'], ['wo', 'を'], ['nn', 'ん'],
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
]

const HIRA_TO_ROMA: [string, string][] = [
  ['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'],
  ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo'],
  ['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'],
  ['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo'],
  ['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'],
  ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo'],
  ['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'],
  ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'],
  ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo'],
  ['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'],
  ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo'],
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['ゐ', 'wi'], ['ゑ', 'we'], ['を', 'wo'], ['ん', 'n'],
  ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'u'], ['ぇ', 'e'], ['ぉ', 'o'],
  ['ゃ', 'ya'], ['ゅ', 'yu'], ['ょ', 'yo'], ['ゎ', 'wa'], ['ゔ', 'vu'],
]

const DOUBLE_ROMA: Record<string, string> = {
  ch: 't',
  sh: 's',
  ts: 't',
}

export function kataToHira(text: string): string {
  return [...(text || '')]
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (c === 0x30f4) return 'ゔ'
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCharCode(c - 0x60)
      return ch
    })
    .join('')
}

export function normalizeRomaji(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ā/g, 'aa')
    .replace(/ī/g, 'ii')
    .replace(/ū/g, 'uu')
    .replace(/ē/g, 'ee')
    .replace(/ō/g, 'ou')
    .replace(/['’.\-\s]/g, '')
}

export function looksLikeRomaji(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 40) return false
  if (/[ぁ-んァ-ン]/.test(t)) return false
  if (!/^[a-zA-ZāīūēōĀĪŪĒŌ''’.+\-\s]+$/.test(t)) return false
  if (!/[aeiouāīūēō]/i.test(t)) return false
  return romajiToHira(t).length > 0
}

export function romajiToHira(text: string): string {
  let s = normalizeRomaji(text)
  if (!s) return ''
  let out = ''
  while (s) {
    if (s[0] === 'n' && (s[1] === 'n' || !s[1] || !'aiueoyn'.includes(s[1]))) {
      out += 'ん'
      s = s[1] === 'n' ? s.slice(2) : s.slice(1)
      continue
    }
    if (s.length >= 2 && s[0] === s[1] && !'aeioun'.includes(s[0] ?? '')) {
      out += 'っ'
      s = s.slice(1)
      continue
    }
    let hit = false
    for (const [roma, hira] of ROMA_TO_HIRA) {
      if (s.startsWith(roma)) {
        out += hira
        s = s.slice(roma.length)
        hit = true
        break
      }
    }
    if (!hit) return ''
  }
  return out
}

export function queryKana(text: string): string {
  const t = text.trim()
  if (!t) return ''
  if (/[ぁ-んァ-ン]/.test(t) || /[\u3400-\u9fff]/.test(t)) return kataToHira(t).replace(/[.\-\s]/g, '')
  if (looksLikeRomaji(t)) return romajiToHira(t)
  return ''
}

export function queryRoma(text: string): string {
  const t = text.trim()
  if (!t) return ''
  if (looksLikeRomaji(t)) return normalizeRomaji(t)
  if (/[ぁ-んァ-ン]/.test(t)) return toRomaji(t)
  return ''
}

export function toRomaji(text: string): string {
  const s = kataToHira(text || '').replace(/[.\-\s]/g, '')
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i] ?? ''
    if (ch === 'っ' || ch === 'ッ') {
      const rest = toRomaji(s.slice(i + 1))
      if (rest) {
        const head = rest.slice(0, 2)
        const doubled = DOUBLE_ROMA[head] || rest[0] || 't'
        out += doubled + rest
        return out
      }
      out += 't'
      i += 1
      continue
    }
    if (ch === 'ー' || ch === 'ｰ') {
      const prev = out.match(/[aeiou]$/)?.[0]
      if (prev) out += prev
      i += 1
      continue
    }
    let hit = false
    for (const [hira, roma] of HIRA_TO_ROMA) {
      if (s.startsWith(hira, i)) {
        if (out.endsWith('n') && 'aiueoy'.includes(roma[0] ?? '')) out += "'"
        out += roma
        i += hira.length
        hit = true
        break
      }
    }
    if (!hit) {
      out += ch
      i += 1
    }
  }
  return out
}
