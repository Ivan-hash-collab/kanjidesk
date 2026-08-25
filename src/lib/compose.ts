import { loadJson } from './gzipJson'

export type CompNode = {
  ch: string
  idc?: boolean
  mark?: string
  kids?: CompNode[]
}

type TreeRow = {
  raw: string
  parts: string[]
  tree: CompNode | null
}

let trees: Record<string, TreeRow> | null = null
let rads: Record<string, string[]> | null = null
let loading: Promise<void> | null = null

async function ensure() {
  if (trees && rads) return
  if (!loading) {
    loading = Promise.all([
      loadJson<Record<string, TreeRow>>('./data/trees.json').catch(() => ({})),
      loadJson<Record<string, string[]>>('./data/radicals.json').catch(() => ({})),
    ]).then(([t, r]) => {
      trees = t
      rads = r
    })
  }
  await loading
}

function collectGlyphs(node: CompNode, into: Set<string>) {
  if (!node.idc && node.ch && node.ch !== '?') into.add(node.ch)
  for (const k of node.kids ?? []) collectGlyphs(k, into)
}

/** Drop parts that already sit inside a sibling (音 contains 立+日). */
function pruneContained(kids: CompNode[]): CompNode[] {
  const nested = new Set<string>()
  for (const k of kids) {
    for (const c of k.kids ?? []) collectGlyphs(c, nested)
  }
  return kids.filter((k) => k.idc || !nested.has(k.ch))
}

function expandNode(node: CompNode, depth: number, seen: Set<string>): CompNode {
  if (depth > 5) return node
  if (node.kids?.length) {
    const kids = pruneContained(node.kids.map((k) => expandNode(k, depth + 1, seen)))
    return { ...node, kids }
  }
  if (node.idc || node.ch === '?' || seen.has(node.ch)) return node
  const inner = trees?.[node.ch]?.tree
  if (!inner?.kids?.length) return node
  const next = new Set(seen)
  next.add(node.ch)
  const kids = pruneContained(inner.kids.map((k) => expandNode(k, depth + 1, next)))
  return { ...node, kids }
}

export async function compositionOf(ch: string): Promise<{
  raw: string
  parts: string[]
  tree: CompNode | null
  rads: string[]
}> {
  await ensure()
  const row = trees?.[ch]
  const base = row?.tree ?? null
  const tree = base ? expandNode(base, 0, new Set([ch])) : null
  return {
    raw: row?.raw ?? '',
    parts: row?.parts ?? [],
    tree,
    rads: rads?.[ch] ?? [],
  }
}
