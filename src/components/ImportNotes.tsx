import { useState } from 'react'
import { charsFromGrid, notesFromGrid, previewFile, previewText, suggestCols, type TablePreview } from '../lib/noteImport'
import { persistKanjiFields } from '../lib/notesRepo'
import { mnemonicOf, noteOf, notifyMeta } from '../lib/storage'

type Props = {
  onClose: () => void
  onImported?: (n: number, chars: string[]) => void
  defaultTarget?: 'note' | 'mnemonic'
  defaultKeep?: boolean
}

export function ImportNotes({ onClose, onImported, defaultTarget = 'note', defaultKeep = false }: Props) {
  const [tables, setTables] = useState<TablePreview[]>([])
  const [ti, setTi] = useState(0)
  const [kanjiCol, setKanjiCol] = useState(0)
  const [noteCol, setNoteCol] = useState(1)
  const [header, setHeader] = useState(true)
  const [keep, setKeep] = useState(defaultKeep)
  const [target, setTarget] = useState<'note' | 'mnemonic'>(defaultTarget)
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const table = tables[ti]

  function applyPreview(list: TablePreview[]) {
    if (!list.length || !list[0]?.rows.length) {
      setMsg('Нет строк с данными')
      setTables([])
      return
    }
    setTables(list)
    setTi(0)
    const s = suggestCols(list[0])
    setKanjiCol(s.kanji)
    setNoteCol(s.note)
    setMsg('')
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setBusy(true)
    setMsg('')
    try {
      applyPreview(await previewFile(f))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось прочитать файл')
    } finally {
      setBusy(false)
    }
  }

  function onPaste() {
    applyPreview(previewText(paste))
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
    const where = target === 'mnemonic' ? 'мнемоники' : 'заметки'
    const warn = keep ? '' : ' Старые тексты в этом поле будут заменены.'
    const verb = keep ? 'Записать в пустые' : 'Перезаписать'
    if (!confirm(`${verb} ${n} знаков в поле «${where}»?${warn}`)) return
    setBusy(true)
    setMsg('')
    try {
      let written = 0
      let skipped = 0
      let agentFail = 0
      for (const [ch, text] of Object.entries(map)) {
        const existing = target === 'mnemonic' ? mnemonicOf(ch) : noteOf(ch)
        if (keep && existing.trim()) {
          skipped += 1
          continue
        }
        const fields = target === 'mnemonic' ? { mnemonic: text } : { notes: text }
        const res = await persistKanjiFields(ch, fields)
        written += 1
        if (!res.ok) agentFail += 1
      }
      notifyMeta()
      const bits = [`сопоставлено ${n}`, `записано ${written}`]
      if (skipped) bits.push(`пропущено ${skipped}`)
      if (agentFail) bits.push(`агент не принял ${agentFail} — тексты всё равно в словаре`)
      setMsg(bits.join(', '))
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
        CSV, Excel, TXT, SQLite/Anki или вставка. Сопоставь столбцы, выбери поле и режим: перезапись или только пустые.
      </p>
      <div className="row-actions wrap">
        <label className="btn">
          Файл
          <input
            type="file"
            hidden
            accept=".csv,.txt,.tsv,.xlsx,.xls,.db,.sqlite,.sqlite3,.anki2"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      </div>
      <textarea
        className="area compact"
        rows={4}
        placeholder={'漢\tсвоя история\n字\tзаметка или мнемоника'}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      <button type="button" className="btn" disabled={!paste.trim() || busy} onClick={onPaste}>
        Разобрать вставку
      </button>
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
          <div className="pref">
            <span>
              <b>Если поле уже заполнено</b>
              <small>перезапись меняет текст у знака; «только пустые» пропускает его</small>
            </span>
            <div className="seg">
              <button type="button" className={!keep ? 'is-on' : ''} onClick={() => setKeep(false)}>
                Перезаписать
              </button>
              <button type="button" className={keep ? 'is-on' : ''} onClick={() => setKeep(true)}>
                Только пустые
              </button>
            </div>
          </div>
          <div className="import-sample">
            {(header ? table.rows.slice(1, 6) : table.rows.slice(0, 5)).map((row, i) => (
              <p key={i}>
                <b className="jp">{row[kanjiCol] || '—'}</b>
                <span>{row[noteCol] || '—'}</span>
              </p>
            ))}
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void apply()}>
            {keep ? 'Импортировать' : 'Перезаписать'}
          </button>
        </>
      ) : null}
      {msg ? <p className="muted">{msg}</p> : null}
    </div>
  )
}
