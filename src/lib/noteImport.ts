import { uniqueKanji } from './kanji'

export type TablePreview = {
  name: string
  headers: string[]
  rows: string[][]
}

const CJK = /[\u3400-\u9FFF]/

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(';')) return line.split(';').map((s) => s.trim())
  if (line.includes(',')) return splitCsvLine(line)
  return [line.trim()]
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else q = !q
      continue
    }
    if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function asGrid(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  return lines.map(splitLine)
}

function guessKanjiCol(headers: string[], rows: string[][]): number {
  const names = headers.map((h) => h.toLowerCase())
  const idx = names.findIndex((h) => /kanji|漢字|expression|front|問|word|written/.test(h))
  if (idx >= 0) return idx
  let best = 0
  let score = -1
  const cols = Math.max(...rows.map((r) => r.length), headers.length)
  for (let c = 0; c < cols; c++) {
    const n = rows.slice(0, 40).filter((r) => CJK.test(r[c] || '')).length
    if (n > score) {
      score = n
      best = c
    }
  }
  return best
}

function guessNoteCol(headers: string[], kanjiCol: number): number {
  const names = headers.map((h) => h.toLowerCase())
  const idx = names.findIndex((h, i) => i !== kanjiCol && /note|mnemonic|hint|memo|замет|мнемон|back|意味|meaning/.test(h))
  if (idx >= 0) return idx
  return kanjiCol === 0 ? 1 : 0
}

export function notesFromGrid(rows: string[][], kanjiCol: number, noteCol: number, header: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  const start = header ? 1 : 0
  for (const row of rows.slice(start)) {
    const cell = row[kanjiCol] ?? ''
    const note = (row[noteCol] ?? '').trim()
    if (!note) continue
    const chars = uniqueKanji(cell)
    if (chars.length === 1 && cell.trim() === chars[0]) {
      out[chars[0]] = note
      continue
    }
    if (chars.length === 1) out[chars[0]] = note
    else if (chars.length) {
      for (const ch of chars) {
        if (!out[ch]) out[ch] = note
      }
    }
  }
  return out
}

export function charsFromGrid(rows: string[][], kanjiCol: number, header: boolean): string[] {
  const start = header ? 1 : 0
  return uniqueKanji(rows.slice(start).map((r) => r[kanjiCol] ?? '').join(''))
}

export async function previewFile(file: File): Promise<TablePreview[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    return wb.SheetNames.map((n) => {
      const sheet = wb.Sheets[n]
      const rows = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][]).map((r) =>
        r.map((c) => String(c ?? '').trim()),
      )
      const headers = (rows[0] ?? []).map((c, i) => c || `колонка ${i + 1}`)
      return { name: n, headers, rows }
    })
  }
  if (name.endsWith('.db') || name.endsWith('.anki2') || name.endsWith('.sqlite') || name.endsWith('.sqlite3')) {
    return previewSqlite(file)
  }
  const text = await file.text()
  const rows = asGrid(text)
  const headers = (rows[0] ?? []).map((c, i) => c || `колонка ${i + 1}`)
  return [{ name: file.name, headers, rows }]
}

async function previewSqlite(file: File): Promise<TablePreview[]> {
  const initSqlJs = (await import('sql.js')).default
  const wasm = (await import('sql.js/dist/sql-wasm.wasm?url')).default
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    const names = (tables[0]?.values ?? []).map((v: (string | number | null | Uint8Array)[]) => String(v[0]))
  const out: TablePreview[] = []
  for (const t of names) {
    const safe = t.replace(/"/g, '""')
    let res
    try {
      res = db.exec(`SELECT * FROM "${safe}" LIMIT 40`)
    } catch {
      continue
    }
    const headers = res[0]?.columns ?? []
    const rows = (res[0]?.values ?? []).map((row: (string | number | null | Uint8Array)[]) =>
      row.map((c: string | number | null | Uint8Array) => (c == null ? '' : String(c))),
    )
    if (t === 'notes' && headers.includes('flds')) {
      const wide = flattenAnki(headers, rows)
      out.push({ name: `${t} · поля`, headers: wide.headers, rows: wide.rows })
    }
    out.push({ name: t, headers, rows })
  }
  db.close()
  return out
}

function flattenAnki(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  const fi = headers.indexOf('flds')
  if (fi < 0) return { headers, rows }
  const split = rows.map((r) => (r[fi] ?? '').split('\x1f'))
  const n = Math.max(0, ...split.map((p) => p.length))
  const extra = Array.from({ length: n }, (_, i) => `поле ${i + 1}`)
  return {
    headers: extra,
    rows: split.map((p) => extra.map((_, i) => p[i] ?? '')),
  }
}

export function suggestCols(preview: TablePreview): { kanji: number; note: number } {
  const body = preview.rows.slice(1)
  const kanji = guessKanjiCol(preview.headers, body.length ? body : preview.rows)
  return { kanji, note: guessNoteCol(preview.headers, kanji) }
}
