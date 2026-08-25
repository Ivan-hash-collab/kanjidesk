import { useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { ImportNotes } from '../components/ImportNotes'
import { MemoWorkbench, useMemoSession } from '../components/MemoWorkbench'
import { memoApi, pingMemo, rememberMemoSession, type MemoArchiveRow } from '../lib/memo'
import type { KanjiDict } from '../types'

type Props = {
  chars: string[]
  title: string
  dict: KanjiDict
  opened: boolean
  onOpenSet: () => void
  onCloseSet: () => void
  onGoLists: () => void
  onOpenKanji?: (ch: string) => void
  onLoadChars: (chars: string[], name: string) => void
}

export function MnemonicsView({
  chars,
  title,
  dict,
  opened,
  onOpenSet,
  onCloseSet,
  onGoLists,
  onOpenKanji,
  onLoadChars,
}: Props) {
  const [ok, setOk] = useState<boolean | null>(null)
  const [imp, setImp] = useState(false)
  const [archive, setArchive] = useState<MemoArchiveRow[]>([])
  const { sess, err, busy, reload } = useMemoSession(ok && opened && chars.length ? chars : [], title)

  useEffect(() => {
    void pingMemo().then(setOk)
  }, [])

  useEffect(() => {
    if (!ok) return
    void memoApi
      .sessions()
      .then((r) => setArchive(r.sessions || []))
      .catch(() => undefined)
  }, [ok, opened, sess?.id])

  if (!opened) {
    return (
      <div className="panel hub-panel page memo-hub">
        <header className="panel-head tight">
          <div>
            <p className="kicker">Набор целиком</p>
            <h2>Мнемоники</h2>
          </div>
        </header>
        <p className="lede">
          Сначала список: с Главной, подсписок из Списков, или свой файл с историями. Агент разбирает все знаки сразу —
          не по одному.
        </p>
        {ok === false ? (
          <p className="status-bad">Агент не запущен. Открой KanjiDesk через launch.py.</p>
        ) : null}
        <div className="mode-list">
          <button type="button" className="mode-row is-plain" disabled={!chars.length} onClick={onOpenSet}>
            <span className="mode-copy">
              <b>Текущая сессия</b>
              <small>{chars.length ? `${chars.length} знаков · ${title}` : 'Сначала загрузи набор на Главной'}</small>
            </span>
          </button>
          <button type="button" className="mode-row is-plain" onClick={onGoLists}>
            <span className="mode-copy">
              <b>Списки и подсписки</b>
              <small>JLPT, школа, свои папки — в предпросмотре кнопка «Мнемоники»</small>
            </span>
          </button>
          <button type="button" className="mode-row is-plain" onClick={() => setImp(true)}>
            <span className="mode-copy">
              <b>Свой файл</b>
              <small>CSV / Excel / TXT / Anki — сопоставление столбцов перед импортом мнемоник</small>
            </span>
          </button>
        </div>
        {archive.length ? (
          <section className="setup-sec">
            <p className="setup-label">Архив сессий</p>
            <ul className="archive-list">
              {archive.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="mode-row is-plain"
                    onClick={() => {
                      void memoApi.session(row.id).then((s) => {
                        const found = s.kanji.map((k) => k.kanji)
                        rememberMemoSession(s.id, found)
                        onLoadChars(found, s.title)
                      })
                    }}
                  >
                    <span className="mode-copy">
                      <b>{row.title}</b>
                      <small>
                        {row.kanji_count} знаков · разобрано {row.analyzed_count ?? 0} · сообщений {row.message_count ?? 0}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {imp ? (
          <Dialog open onClose={() => setImp(false)} labelledBy="import-notes-title">
            <ImportNotes
              defaultTarget="mnemonic"
              onClose={() => setImp(false)}
              onImported={(_n, found) => {
                if (found.length) {
                  setImp(false)
                  onLoadChars(found, 'Импорт')
                }
              }}
            />
          </Dialog>
        ) : null}
      </div>
    )
  }

  return (
    <div className="panel page memo-page">
      <header className="panel-head tight">
        <div>
          <p className="kicker">{title}</p>
          <h2>Мнемоники</h2>
        </div>
      </header>
      {ok === false ? (
        <div className="card">
          <p>Агент не запущен.</p>
          <p className="muted">Закрой окно и открой KanjiDesk через launch.py.</p>
          <button type="button" className="btn primary" onClick={() => void pingMemo().then(setOk)}>
            Проверить снова
          </button>
        </div>
      ) : null}
      {ok === null ? <p className="muted">Открываю…</p> : null}
      {busy && !sess ? <p className="muted">Готовлю набор…</p> : null}
      {err ? <p className="status-bad">{err}</p> : null}
      {ok && sess ? (
        <MemoWorkbench
          sid={sess.id}
          sess={sess}
          dict={dict}
          onReload={reload}
          onOpenKanji={onOpenKanji}
          onChangeSet={onCloseSet}
        />
      ) : null}
    </div>
  )
}
