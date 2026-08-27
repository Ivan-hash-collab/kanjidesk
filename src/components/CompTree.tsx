import { useState } from 'react'
import type { CompNode } from '../lib/compose'

const IDC: Record<string, string> = {
  '⿰': 'слева + справа',
  '⿱': 'сверху + снизу',
  '⿲': 'три в ряд',
  '⿳': 'три столбиком',
  '⿴': 'снаружи',
  '⿵': 'крышка сверху',
  '⿶': 'снизу охватывает',
  '⿷': 'слева охватывает',
  '⿸': 'угол слева-сверху',
  '⿹': 'угол справа-сверху',
  '⿺': 'охватывает снизу-слева',
  '⿻': 'пересечение',
}

function Node({
  node,
  onKanji,
  role,
  openAll,
}: {
  node: CompNode
  onKanji?: (ch: string) => void
  role: 'root' | 'part' | 'leaf'
  openAll: boolean | null
}) {
  const kids = node.kids ?? []
  const isIdc = Boolean(node.idc)
  const [open, setOpen] = useState(openAll ?? true)
  const shown = open
  const label = isIdc
    ? IDC[node.ch] || 'схема'
    : role === 'root'
      ? 'этот знак'
      : kids.length
        ? 'сложная часть'
        : 'простой элемент'
  const glyph = isIdc ? (
    <span className="comp-idc">{node.ch}</span>
  ) : onKanji && node.ch !== '?' ? (
    <button type="button" className="jp-link" onClick={() => onKanji(node.ch)}>
      {node.ch}
    </button>
  ) : (
    <span className="jp">{node.ch}</span>
  )

  return (
    <div className={`comp-node is-${role}`}>
      <div className="comp-head">
        {kids.length ? (
          <button
            type="button"
            className="btn ghost comp-toggle"
            aria-expanded={shown}
            onClick={() => setOpen((v) => !v)}
          >
            {shown ? '▾' : '▸'}
          </button>
        ) : (
          <span className="comp-toggle is-leaf" />
        )}
        {glyph}
        <small>{label}</small>
      </div>
      {kids.length && shown ? (
        <div className="comp-kids">
          {kids.map((kid, i) => (
            <Node
              key={`${kid.ch}-${i}`}
              node={kid}
              onKanji={onKanji}
              role={kid.kids?.length || kid.idc ? 'part' : 'leaf'}
              openAll={openAll}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

type Props = {
  tree: CompNode | null
  onKanji?: (ch: string) => void
}

export function CompTree({ tree, onKanji }: Props) {
  // Changing the mode remounts the whole tree so per-node toggles reset cleanly.
  const [mode, setMode] = useState<'auto' | 'open' | 'closed'>('auto')
  if (!tree) return <p className="muted">Нет открытого разбора для этого знака.</p>
  const openAll = mode === 'auto' ? null : mode === 'open'
  return (
    <div className="comp-wrap">
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={() => setMode('open')}>
          Раскрыть дерево
        </button>
        <button type="button" className="btn ghost" onClick={() => setMode('closed')}>
          Свернуть дерево
        </button>
        {mode !== 'auto' ? (
          <button type="button" className="btn ghost" onClick={() => setMode('auto')}>
            По узлам
          </button>
        ) : null}
      </div>
      <p className="muted">Сложную часть можно свернуть. Клик по знаку — в словарь.</p>
      <Node key={`${mode}-${tree.ch}`} node={tree} onKanji={onKanji} role="root" openAll={openAll} />
    </div>
  )
}
