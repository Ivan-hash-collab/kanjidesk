import { useState } from 'react'
import { charsFromGrid, notesFromGrid, previewFile, suggestCols, type TablePreview } from '../lib/noteImport'
import { persistKanjiFields } from '../lib/notesRepo'
import { mnemonicOf, noteOf } from '../lib/storage'

type Props = {
  onClose: () => void
  onImported?: (n: number, chars: string[]) => void
  defaultTarget?: 'note' | 'mnemonic'
}

export function ImportNotes({ onClose, onImported, defaultTarget = 'note' }: Props) {
  const [tables, setTables] = useState<TablePreview[]>([])
  const [ti, setTi] = useState(0)
  const [kanjiCol, setKanjiCol] = useState(0)
  const [noteCol, setNoteCol] = useState(1)
  const [header, setHeader] = useState(true)
  const [keep, setKeep] = useState(true)
  const [target, setTarget] = useState<'note' | 'mnemonic'>(defaultTarget)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const table = tables[ti]

  async function onFile(f: File | undefined) {
    if (!f) return
    setBusy(true)
    setMsg('')
    try {
      const list = await previewFile(f)
      if (!list.length || !list[0]?.rows.length) {
        setMsg('В файле нет строк')
        setTables([])
        return
      }
      setTables(list)
      setTi(0)
      const s = suggestCols(list[0])
      setKanjiCol(s.kanji)
      setNoteCol(s.note)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось прочитать файл')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!table) return
    const map = notesFromGrid(table.rows, kanjiCol, noteCol, header)
    const chars = charsFromGrid(table.rows, kanjiCol, header)
    const n = Object.keys(map).length
    if (!n) {
      setMsg('Нет строк с кандзи и текстом в выбранных столбцах')
      return
    }
    if (!confirm(`Записать ${n} знаков в ${target === 'mnemonic' ? 'мнемоники' : 'заметки'}?`)) return
    setBusy(true)
    setMsg('')
    try {
      let written = 0
      let failed = 0
      for (const [ch, text] of Object.entries(map)) {
        if (keep && target === 'mnemonic' && mnemonicOf(ch)) continue
        if (keep && target === 'note' && noteOf(ch)) continue
        const fields = target === 'mnemonic' ? { mnemonic: text } : { notes: text }
        const res = await persistKanjiFields(ch, fields)
        if (res.ok) written += 1
        else failed += 1
      }
      setMsg(`Сопоставлено ${n}, записано ${written}${failed ? `, ошибок ${failed}` : ''}`)
      onImported?.(written, chars)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="import-notes">
      <header className="panel-head tight">
        <div>
          <p className="kicker">Поля файла</p>
          <h3 id="import-notes-title">Импорт мнемоник и заметок</h3>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <p className="muted">
        CSV, Excel, TXT или SQLite/Anki. Сначала сопоставь столбцы: кандзи и текст. Куда писать — мнемоника знака
        или свободная заметка.
      </p>
      <label className="btn">
        Файл
        <input
          type="file"
          hidden
          accept=".csv,.txt,.tsv,.xlsx,.xls,.db,.sqlite,.sqlite3,.anki2"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {busy ? <p className="muted">читаю…</p> : null}
      {tables.length > 1 ? (
        <label className="pref">
          <span>
            <b>Лист / таблица</b>
          </span>
          <select
            value={ti}
            onChange={(e) => {
              const i = Number(e.target.value)
              setTi(i)
              const s = suggestCols(tables[i]!)
              setKanjiCol(s.kanji)
              setNoteCol(s.note)
            }}
          >
            {tables.map((t, i) => (
              <option key={t.name + i} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {table ? (
        <>
          <label className="pref">
            <span>
              <b>Столбец кандзи</b>
            </span>
            <select value={kanjiCol} onChange={(e) => setKanjiCol(Number(e.target.value))}>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {i + 1}. {h}
                </option>
              ))}
            </select>
          </label>
          <label className="pref">
            <span>
              <b>Столбец текста</b>
            </span>
            <select value={noteCol} onChange={(e) => setNoteCol(Number(e.target.value))}>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {i + 1}. {h}
                </option>
              ))}
            </select>
          </label>
          <label className="pref">
            <span>
              <b>Куда писать</b>
              <small>мнемоника — «как запомнить»; заметка — свободное поле</small>
            </span>
            <select value={target} onChange={(e) => setTarget(e.target.value as 'note' | 'mnemonic')}>
              <option value="mnemonic">индивидуальная мнемоника</option>
              <option value="note">заметка</option>
            </select>
          </label>
          <label className="pref">
            <span>
              <b>Первая строка — заголовок</b>
            </span>
            <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
          </label>
          <label className="pref">
            <span>
              <b>Не затирать старые</b>
            </span>
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          </label>
          <div className="import-sample">
            {(header ? table.rows.slice(1, 6) : table.rows.slice(0, 5)).map((row, i) => (
              <p key={i}>
                <b className="jp">{row[kanjiCol] || '—'}</b>
                <span>{row[noteCol] || '—'}</span>
              </p>
            ))}
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void apply()}>
            Импортировать
          </button>
        </>
      ) : null}
      {msg ? <p className="muted">{msg}</p> : null}
    </div>
  )
}
