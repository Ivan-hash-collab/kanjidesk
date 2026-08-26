import { useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { Fold } from '../components/Fold'
import { ImportNotes } from '../components/ImportNotes'
import { ListPreview } from '../components/ListPreview'
import { Tip } from '../components/Tip'
import { gradeBadge, gradeLabel, jlptLabel, listByGrade, listByJlpt, listNoJlpt, uniqueKanji } from '../lib/kanji'
import { loadLists, saveLists } from '../lib/storage'
import type { CustomList, KanjiDict } from '../types'

type Props = {
  dict: KanjiDict
  session?: string[]
  sessionTitle?: string
  onOpen: (chars: string[], name: string) => void
  onMemo: (chars: string[], name: string) => void
}

const JLPT_NAME: Record<number, string> = {
  5: 'Beginner',
  4: 'Basic',
  3: 'Intermediate',
  2: 'Advanced',
  1: 'Expert',
}

type Preview = { chars: string[]; name: string }
type Menu = { x: number; y: number } | null
type Confirm = { id: string; name: string; kind: 'folder' | 'list' } | null

function descendants(id: string, all: CustomList[]): string[] {
  const kids = all.filter((x) => x.parentId === id)
  return [id, ...kids.flatMap((k) => descendants(k.id, all))]
}

function nid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function sameChars(a: string[], b: string[]): boolean {
  if (!a.length || a.length !== b.length) return false
  const set = new Set(a)
  return b.every((ch) => set.has(ch))
}

export function ListsView({ dict, session = [], sessionTitle = '', onOpen, onMemo: openMemo }: Props) {
  const [lists, setLists] = useState<CustomList[]>(() => loadLists())
  const [cwd, setCwd] = useState<string | null>(null)
  const [chunk, setChunk] = useState(20)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dropId, setDropId] = useState<string | 'root' | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [create, setCreate] = useState<'folder' | 'list' | null>(null)
  const [name, setName] = useState('')
  const [paste, setPaste] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const jlpt = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((n) => ({
        n,
        chars: listByJlpt(dict, n),
      })),
    [dict],
  )
  const grades = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 8].map((g) => ({
        g,
        chars: listByGrade(dict, g),
      })),
    [dict],
  )
  const joyoNoJlpt = useMemo(() => listNoJlpt(dict, 'joyo'), [dict])
  const jinmei = useMemo(() => listNoJlpt(dict, 'jinmei'), [dict])

  const byId = useMemo(() => Object.fromEntries(lists.map((x) => [x.id, x])), [lists])
  const trail: CustomList[] = []
  let walk = cwd
  while (walk) {
    const n = byId[walk]
    if (!n) break
    trail.unshift(n)
    walk = n.parentId
  }
  const here = lists.filter((x) => x.parentId === cwd)

  function persist(next: CustomList[]) {
    setLists(next)
    saveLists(next)
  }

  function addFolder() {
    const n = name.trim() || 'Папка'
    persist([{ id: nid(), name: n, kind: 'folder', parentId: cwd, chars: [] }, ...lists])
    setName('')
    setCreate(null)
  }

  function addList() {
    const chars = uniqueKanji(paste)
    if (!chars.length) return
    persist([
      {
        id: nid(),
        name: name.trim() || `Список ${lists.filter((x) => x.kind === 'list').length + 1}`,
        kind: 'list',
        parentId: cwd,
        chars,
      },
      ...lists,
    ])
    setName('')
    setPaste('')
    setCreate(null)
  }

  function removeNode(id: string) {
    const drop = new Set(descendants(id, lists))
    persist(lists.filter((x) => !drop.has(x.id)))
    if (cwd && drop.has(cwd)) setCwd(null)
    setConfirm(null)
  }

  function moveList(id: string, folderId: string | null) {
    if (folderId && descendants(id, lists).includes(folderId)) return
    persist(lists.map((x) => (x.id === id ? { ...x, parentId: folderId } : x)))
  }

  function saveSession() {
    if (!session.length) return
    const exists = lists.find((x) => x.kind === 'list' && sameChars(x.chars, session))
    if (exists) {
      setSavedMsg(`Уже в списках: «${exists.name}»`)
      return
    }
    persist([
      {
        id: nid(),
        name: sessionTitle.trim() || `Сессия ${lists.filter((x) => x.kind === 'list').length + 1}`,
        kind: 'list',
        parentId: cwd,
        chars: session,
      },
      ...lists,
    ])
    setSavedMsg('Сохранено в свои списки')
  }

  function onListDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.setData('text/kanjidesk-list', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onFolderDragOver(e: DragEvent, id: string | 'root') {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropId(id)
  }

  function onDropFolder(e: DragEvent, folderId: string | null) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/kanjidesk-list') || e.dataTransfer.getData('text/plain')
    setDropId(null)
    if (!id) return
    moveList(id, folderId)
  }

  function openMenu(e: MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="panel page lists-page" onClick={() => setMenu(null)}>
      <header className="panel-head tight">
        <div>
          <p className="kicker">Списки</p>
          <h2>Наборы кандзи</h2>
        </div>
        <button type="button" className="btn" onClick={() => setNotesOpen(true)}>
          Импорт заметок
        </button>
      </header>
      <p className="muted">
        JLPT и школьные годы — из KANJIDIC. В Японии 6 лет начальной (小1–小6) и 3 года средней (中1–中3); старшая
        高1–高3 — это 10–12 годы, но 常用 закрывают к концу средней. KANJIDIC не делит среднюю по годам: значок «中»
        = оставшиеся 常用 (grade 8), не «8 класс».
      </p>

      {session.length ? (
        <section className="session-now">
          <div>
            <p className="kicker">Сейчас в работе</p>
            <h3>{sessionTitle || 'Текущая сессия'}</h3>
            <p className="muted">{session.length} кандзи · этот набор открыт в учёбе и мнемониках</p>
            <p className="jp session-preview">
              {session.slice(0, 24).join(' ')}
              {session.length > 24 ? ' …' : ''}
            </p>
          </div>
          <div className="row-actions wrap">
            <button
              type="button"
              className="btn"
              onClick={() => setPreview({ chars: session, name: sessionTitle || 'Сессия' })}
            >
              Просмотр
            </button>
            <button type="button" className="btn primary study-btn" onClick={() => onOpen(session, sessionTitle || 'Сессия')}>
              Учёба
            </button>
            <button type="button" className="btn" onClick={() => openMemo(session, sessionTitle || 'Сессия')}>
              Мнемоники
            </button>
            <button type="button" className="btn" onClick={saveSession}>
              В свои списки
            </button>
          </div>
          {savedMsg ? <p className="muted">{savedMsg}</p> : null}
        </section>
      ) : (
        <p className="muted">Нет текущей сессии. Открой список из раздела ниже — он появится здесь.</p>
      )}

      {preview ? (
        <ListPreview
          chars={preview.chars}
          name={preview.name}
          chunk={chunk}
          onChunk={setChunk}
          onStudy={(chars, n) => {
            setPreview(null)
            onOpen(chars, n)
          }}
          onMemo={(chars, n) => {
            setPreview(null)
            openMemo(chars, n)
          }}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {notesOpen ? (
        <div className="preview-back" onClick={() => setNotesOpen(false)} role="presentation">
          <div className="preview-pane" onClick={(e) => e.stopPropagation()}>
            <ImportNotes defaultKeep={false} onClose={() => setNotesOpen(false)} />
          </div>
        </div>
      ) : null}

      {menu ? (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setCreate('folder')
              setMenu(null)
            }}
          >
            Создать папку
          </button>
          <button
            type="button"
            onClick={() => {
              setCreate('list')
              setMenu(null)
            }}
          >
            Импорт кандзи
          </button>
        </div>
      ) : null}

      <Fold title="Свои папки и списки" meta={lists.length ? `${lists.length}` : 'пусто'} defaultOpen>
        <div className="list-toolbar">
          <nav className="crumbs">
            <button type="button" className={!cwd ? 'is-on' : ''} onClick={() => setCwd(null)}>
              Корень
            </button>
            {trail.map((n) => (
              <button key={n.id} type="button" className={cwd === n.id ? 'is-on' : ''} onClick={() => setCwd(n.id)}>
                {n.name}
              </button>
            ))}
          </nav>
          <Tip label="Папка в текущем каталоге">
            <button type="button" className="icon-btn" title="Создать папку" onClick={() => setCreate('folder')}>
              📁+
            </button>
          </Tip>
          <Tip label="Список кандзи в текущем каталоге">
            <button type="button" className="icon-btn" title="Импорт кандзи" onClick={() => setCreate('list')}>
              ☰+
            </button>
          </Tip>
        </div>
        <p className="muted">ПКМ по пустому месту — создать папку или импортировать кандзи сюда. Список можно перетащить на папку.</p>
        <div
          className={`drop-root ${dropId === 'root' && !cwd ? 'is-drop' : ''}`}
          onContextMenu={openMenu}
          onDragOver={(e) => onFolderDragOver(e, 'root')}
          onDragLeave={() => setDropId((cur) => (cur === 'root' ? null : cur))}
          onDrop={(e) => onDropFolder(e, cwd)}
        >
          {here.length ? 'Отпусти список, чтобы положить в эту папку' : 'Пусто. ПКМ или кнопки сверху.'}
        </div>
        {create ? (
          <div className="fold-form">
            <input
              className="field"
              placeholder={create === 'folder' ? 'Имя папки' : 'Название списка'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {create === 'list' ? (
              <textarea
                className="area compact"
                rows={3}
                placeholder="Вставь кандзи"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            ) : null}
            {create === 'list' && paste ? (
              <p className="muted">{uniqueKanji(paste).length} уникальных знаков</p>
            ) : null}
            <div className="row-actions">
              <button type="button" className="btn primary" onClick={create === 'folder' ? addFolder : addList}>
                Создать
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCreate(null)
                  setName('')
                  setPaste('')
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : null}
        {confirm ? (
          <div className="confirm-strip">
            <p>
              Удалить {confirm.kind === 'folder' ? 'папку' : 'список'} «{confirm.name}»
              {confirm.kind === 'folder' ? ' и всё внутри' : ''}?
            </p>
            <button type="button" className="btn bad" onClick={() => removeNode(confirm.id)}>
              Удалить
            </button>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              Отмена
            </button>
          </div>
        ) : null}
        <ul className="set-rows">
          {here.map((l) =>
            l.kind === 'folder' ? (
              <li
                key={l.id}
                className={`is-folder ${dropId === l.id ? 'is-drop' : ''}`}
                onDragOver={(e) => onFolderDragOver(e, l.id)}
                onDragLeave={() => setDropId((cur) => (cur === l.id ? null : cur))}
                onDrop={(e) => onDropFolder(e, l.id)}
              >
                <b className="set-badge">📁</b>
                <div>
                  <strong>{l.name}</strong>
                  <span>{lists.filter((x) => x.parentId === l.id).length} внутри</span>
                </div>
                <button type="button" className="btn" onClick={() => setCwd(l.id)}>
                  Открыть
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConfirm({ id: l.id, name: l.name, kind: 'folder' })}
                >
                  ×
                </button>
              </li>
            ) : (
              <li
                key={l.id}
                className={`is-list ${sameChars(l.chars, session) ? 'is-session' : ''}`}
                draggable
                onDragStart={(e) => onListDragStart(e, l.id)}
              >
                <b className="set-glyph jp">{l.chars[0] || '漢'}</b>
                <div>
                  <strong>{l.name}</strong>
                  <span>
                    {l.chars.length} кандзи{sameChars(l.chars, session) ? ' · сейчас в сессии' : ''}
                  </span>
                </div>
                <button type="button" className="btn" onClick={() => setPreview({ chars: l.chars, name: l.name })}>
                  Просмотр
                </button>
                <button type="button" className="btn primary study-btn" onClick={() => onOpen(l.chars, l.name)}>
                  Учёба
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConfirm({ id: l.id, name: l.name, kind: 'list' })}
                >
                  ×
                </button>
              </li>
            ),
          )}
        </ul>
      </Fold>

      <Fold title="JLPT" meta="KANJIDIC · N5–N1">
        <ul className="set-rows">
          {jlpt.map((row) => (
            <li key={row.n} className={sameChars(row.chars, session) ? 'is-session' : ''}>
              <b className="set-badge">{jlptLabel(row.n)}</b>
              <div>
                <strong>
                  {JLPT_NAME[row.n]} · {jlptLabel(row.n)}
                </strong>
                <span>{row.chars.length} кандзи</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setPreview({ chars: row.chars, name: `${JLPT_NAME[row.n]} · ${jlptLabel(row.n)}` })}
              >
                Просмотр
              </button>
              <button
                type="button"
                className="btn primary study-btn"
                onClick={() => onOpen(row.chars, `${JLPT_NAME[row.n]} · ${jlptLabel(row.n)}`)}
              >
                Учёба
              </button>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="Школьные годы" meta="KANJIDIC grade">
        <p className="muted">
          小1–小6 — начальная школа. «中» — оставшиеся 常用 в средней школе, одним блоком. Отдельных списков 高1–高3 в
          KANJIDIC нет.
        </p>
        <ul className="set-rows">
          {grades.map((row) => (
            <li key={row.g} className={sameChars(row.chars, session) ? 'is-session' : ''}>
              <b className="set-badge school">{gradeBadge(row.g)}</b>
              <div>
                <strong>{gradeLabel(row.g)}</strong>
                <span>{row.chars.length} кандзи</span>
              </div>
              <button type="button" className="btn" onClick={() => setPreview({ chars: row.chars, name: gradeLabel(row.g) })}>
                Просмотр
              </button>
              <button type="button" className="btn primary study-btn" onClick={() => onOpen(row.chars, gradeLabel(row.g))}>
                Учёба
              </button>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="常用 без JLPT и имена" meta="KANJIDIC">
        <ul className="set-rows">
          {(
            [
              ['常用 без JLPT', joyoNoJlpt],
              ['Имена · 人名', jinmei],
            ] as const
          ).map(([label, chars]) => (
            <li key={label} className={sameChars(chars, session) ? 'is-session' : ''}>
              <b className="set-badge">漢</b>
              <div>
                <strong>{label}</strong>
                <span>{chars.length} кандзи</span>
              </div>
              <button type="button" className="btn" onClick={() => setPreview({ chars, name: label })}>
                Просмотр
              </button>
              <button type="button" className="btn primary study-btn" onClick={() => onOpen(chars, label)}>
                Учёба
              </button>
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  )
}
