const ROOT = `${import.meta.env.BASE_URL}memo-api`.replace(/\/?$/, '')
const STORE = 'kanjidesk.memoIds'

export type SessionKanji = {
  id: number
  session_id: number
  position: number
  kanji: string
  catalog_id: number | null
  analyzed: number
  briefing?: Record<string, unknown> | null
}

export type SessionMessage = {
  id: number
  session_id: number
  chunk_index: number
  skills: string[]
  kanji: string[]
  text_ru: string
  created_at: string
  meta?: { run_id?: string } | null
}

export type MemoSession = {
  id: number
  title: string
  source_text: string
  created_at: string
  kanji: SessionKanji[]
  count: number
  analyzed: number
  messages?: SessionMessage[]
}

export type MemoArchiveRow = {
  id: number
  title: string
  created_at: string
  kanji_count: number
  analyzed_count: number
  message_count?: number
}

export type BatchPlan = {
  skills: string[]
  n_kanji: number
  per_kanji_out: number
  kanji_per_chunk: number
  calls: number
  est_out_total: number
  est_in_total: number
  warning: string
  skipped: string[]
  rewrite_n?: number
  rewrite_calls?: number
  rewrite_est_out?: number
  chunks: { index: number; kanji: string[]; est_out: number; est_in: number }[]
}

export type BatchExtra = {
  skills: string[]
  force?: boolean
  chunk_index?: number
  only?: string[]
  mnemonic_count?: number
  mnemonic_style?: string
  mnemonic_refs?: string
  run_id?: string
  prior_text?: string
  user_prompt?: string
  batch_max_kanji?: number
  batch_max_out_tokens?: number
  skill_len_mode?: string
  skill_len_global?: number
  skill_len_mnemonic?: number
  skill_len_decompose?: number
  skill_len_readings?: number
  skill_len_lookalikes?: number
  skill_len_vocab?: number
  skill_len_etymology?: number
}

type MemoIds = { studyId: number; studySig: string; extras: Record<string, number> }

type Inflight = { key: string; p: Promise<MemoSession> }

let inflight: Inflight | null = null

function apiUrl(path: string): string {
  return `${ROOT}${path.startsWith('/') ? path : `/${path}`}`
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
  if (!(init?.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(apiUrl(path), { ...init, headers })
  if (!res.ok) {
    const raw = await res.text()
    let msg = raw || res.statusText
    try {
      const j = JSON.parse(raw) as { detail?: unknown }
      if (typeof j.detail === 'string') msg = j.detail
    } catch {
      /* keep */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

function loadIds(): MemoIds {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as MemoIds
  } catch {
    /* ignore */
  }
  return { studyId: 0, studySig: '', extras: {} }
}

function saveIds(v: MemoIds) {
  localStorage.setItem(STORE, JSON.stringify(v))
}

export const memoApi = {
  health: () => req<{ status: string }>('/api/health'),
  createSession: (text: string, title?: string) =>
    req<MemoSession>('/api/sessions', { method: 'POST', body: JSON.stringify({ text, title }) }),
  sessions: () => req<{ sessions: MemoArchiveRow[] }>('/api/sessions'),
  session: (id: number) => req<MemoSession>(`/api/sessions/${id}`),
  deleteSession: (id: number) => req<{ ok: boolean; deleted: number; id: number }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  clearSessions: () => req<{ ok: boolean; deleted: number }>('/api/sessions', { method: 'DELETE' }),
  entry: (id: number, kanji: string) =>
    req<{ entry: SessionKanji; catalog: Record<string, unknown> }>(
      `/api/sessions/${id}/kanji/${encodeURIComponent(kanji)}`,
    ),
  skill: (id: number, kanji: string, skill: string, extra?: Record<string, unknown>) =>
    req<Record<string, unknown>>(`/api/sessions/${id}/kanji/${encodeURIComponent(kanji)}/skill/${skill}`, {
      method: 'POST',
      body: JSON.stringify({ extra: { force: true, ...extra } }),
    }),
  chat: (id: number, kanji: string, message: string) =>
    req<{ reply_ru: string; text_ru?: string }>(`/api/sessions/${id}/kanji/${encodeURIComponent(kanji)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  chatRun: (id: number, message: string) =>
    req<{ reply_ru: string; text_ru?: string }>(`/api/sessions/${id}/chat-run`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  deleteRun: (id: number, runId?: string) =>
    req<{ deleted: number; analyzed: number; ok: boolean; run_id?: string | null }>(
      `/api/sessions/${id}/runs/delete`,
      {
        method: 'POST',
        body: JSON.stringify({ run_id: runId || null }),
      },
    ),
  snippet: (text: string, command: string) =>
    req<{ reply_ru: string; text_ru?: string }>('/api/agent/snippet', {
      method: 'POST',
      body: JSON.stringify({ text, command }),
    }),
  batchPlan: (id: number, body: BatchExtra) =>
    req<BatchPlan>(`/api/sessions/${id}/batch/plan`, { method: 'POST', body: JSON.stringify(body) }),
  batchRun: (id: number, body: BatchExtra) =>
    req<{
      done: boolean
      chunk_index: number
      total_chunks: number
      next_chunk: number | null
      kanji: string[]
      text_ru: string
      run_id?: string
      _cached?: boolean
      _error?: string
    }>(`/api/sessions/${id}/batch/run`, { method: 'POST', body: JSON.stringify(body) }),
  notes: (kanji: string, body: { mnemonic?: string; notes?: string }) =>
    req<{ ok: boolean; mnemonic?: string; notes?: string }>(
      `/api/kanji/${encodeURIComponent(kanji)}/notes`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  clearNotes: () => req<{ ok: boolean; deleted: number }>('/api/notes', { method: 'DELETE' }),
  skills: () =>
    req<{ skills: { name: string; description: string; tier: string; llm: boolean }[] }>('/api/agent/skills'),
  prompts: () => req<{ prompts: { id: string; skill: string; name: string; tier: string }[] }>('/api/agent/prompts'),
  usage: () =>
    req<{ usage: { tier: string; model: string; rpd_limit: number; rpd_used: number }[] }>('/api/agent/usage'),
  settings: () => req<{ values: Record<string, string> }>('/api/settings'),
  saveSettings: (values: Record<string, string>) =>
    req<{ values: Record<string, string> }>('/api/settings', { method: 'PUT', body: JSON.stringify({ values }) }),
  geminiKey: () => req<{ configured: boolean; hint: string }>('/api/gemini-key'),
  saveGeminiKey: (key: string) =>
    req<{ configured: boolean; hint: string }>('/api/gemini-key', {
      method: 'PUT',
      body: JSON.stringify({ key }),
    }),
  clearGeminiKey: () =>
    req<{ configured: boolean; hint: string }>('/api/gemini-key', { method: 'DELETE' }),
  tokenize: (text: string) =>
    req<{
      engine: string
      tokens: {
        surface: string
        lemma: string
        reading: string
        pos: string
        begin?: number
        end?: number
        lemmas?: string[]
      }[]
    }>('/api/tokenize', { method: 'POST', body: JSON.stringify({ text }) }),
}

const MEMO_STUBS = new Set([
  'Истории нет — нажмите «Новые истории».',
  'Части знака не разобраны.',
  'Чтений в справочнике нет, либо разбор не заполнил этот блок.',
  'В справочнике нет знаков, похожих по написанию.',
  'Нет данных справочника.',
  'Слов нет.',
])

const MEMO_HEADS = new Set([
  'Как запомнить значение',
  'Как выглядит',
  'Чтения',
  'Не перепутать (похожи по написанию, не по смыслу)',
  'Откуда знак',
  'Слова',
])

export type MemoPart = { text: string; kanji: string[] }

export type MemoRound = {
  id: string
  runId?: string
  parts: MemoPart[]
  text: string
  kanji: string[]
}

export function joinMemoParts(parts: MemoPart[]): string {
  return parts
    .map((p, i) => {
      const body = stripMemoStubs(p.text || '')
      if (!body) return ''
      return i === 0 ? body : `\n\n—— пачка ${i + 1} ——\n\n${body}`
    })
    .filter(Boolean)
    .join('')
}

export function stripMemoStubs(text: string): string {
  return text
    .split(/\n\n————\n\n/)
    .map((card) => {
      const kept: string[] = []
      for (const sec of card.split(/\n\n/)) {
        const lines = sec.split('\n').filter((ln) => !MEMO_STUBS.has(ln.trim()))
        if (!lines.length) continue
        if (lines.length === 1 && MEMO_HEADS.has(lines[0].trim())) continue
        kept.push(lines.join('\n'))
      }
      return kept.join('\n\n').trim()
    })
    .filter(Boolean)
    .join('\n\n————\n\n')
}

function isChatMsg(m: SessionMessage): boolean {
  const s = m.skills || []
  return s.length === 1 && s[0] === 'chat'
}

export function groupMemoRounds(messages: SessionMessage[]): MemoRound[] {
  const bags: SessionMessage[][] = []
  let cur: SessionMessage[] = []
  let curRun: string | undefined
  for (const m of messages) {
    if (isChatMsg(m)) continue
    const rid = m.meta?.run_id
    const startNew = cur.length > 0 && (rid ? rid !== curRun : m.chunk_index === 0)
    if (startNew) {
      bags.push(cur)
      cur = []
    }
    cur.push(m)
    curRun = rid
  }
  if (cur.length) bags.push(cur)
  return bags.map((bag, i) => {
    const parts: MemoPart[] = bag.map((m) => ({
      text: stripMemoStubs(m.text_ru || ''),
      kanji: m.kanji || [],
    }))
    return {
      id: bag.map((m) => String(m.id)).join('-') || String(i),
      runId: bag[0]?.meta?.run_id,
      parts,
      text: joinMemoParts(parts),
      kanji: [...new Set(bag.flatMap((m) => m.kanji || []))],
    }
  })
}

export function countHits(text: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = 0
  while (true) {
    const j = text.indexOf(needle, i)
    if (j < 0) return n
    n += 1
    i = j + needle.length
  }
}

export function readable(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const text = data.text_ru
  if (typeof text === 'string' && text.trim()) return stripMemoStubs(text)
  const reply = data.reply_ru
  if (typeof reply === 'string' && reply.trim()) return stripMemoStubs(reply)
  const bits = [
    data.keyword_ru,
    data.mnemonic_ru,
    data.story_ru,
    data.components_story,
    data.rule_ru,
    data.lookalike_note,
    data.explain_ru,
    data.memory_ru,
    data.tip_ru,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && !MEMO_STUBS.has(x.trim()))
  return stripMemoStubs(bits.join('\n\n'))
}

export async function pingMemo(): Promise<boolean> {
  try {
    await memoApi.health()
    return true
  } catch {
    return false
  }
}

export function memoError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/down|Failed to fetch|NetworkError|502|Load failed/i.test(raw)) {
    return 'Агент не отвечает. Закрой KanjiDesk и открой снова.'
  }
  return raw
}

export function groupsOf<T>(items: T[], size: number): T[][] {
  if (!items.length) return []
  if (size <= 0 || items.length <= size) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function once(key: string, run: () => Promise<MemoSession>): Promise<MemoSession> {
  if (inflight?.key === key) return inflight.p
  const p = run().finally(() => {
    if (inflight?.p === p) inflight = null
  })
  inflight = { key, p }
  return p
}

export async function ensureStudySession(chars: string[], title: string): Promise<MemoSession> {
  const unique = [...new Set(chars.filter(Boolean))]
  if (!unique.length) throw new Error('Нет кандзи для разбора')
  const sig = unique.join('')
  return once(`study:${sig}`, async () => {
    const ids = loadIds()
    if (ids.studyId && ids.studySig === sig) {
      try {
        return await memoApi.session(ids.studyId)
      } catch {
        /* recreate */
      }
    }
    const sess = await memoApi.createSession(unique.join(''), title || 'KanjiDesk')
    saveIds({ ...ids, studyId: sess.id, studySig: sig })
    return sess
  })
}

export function rememberMemoSession(id: number, chars: string[]) {
  const unique = [...new Set(chars.filter(Boolean))]
  saveIds({ ...loadIds(), studyId: id, studySig: unique.join('') })
}

export function forgetMemoSession(id: number) {
  const ids = loadIds()
  const extras = Object.fromEntries(Object.entries(ids.extras).filter(([, v]) => v !== id))
  saveIds({
    extras,
    studyId: ids.studyId === id ? 0 : ids.studyId,
    studySig: ids.studyId === id ? '' : ids.studySig,
  })
}

export function forgetMemoSessions() {
  localStorage.removeItem(STORE)
}

export async function sessionForKanji(
  kanji: string,
  studyChars: string[],
  title: string,
): Promise<MemoSession> {
  if (!kanji) throw new Error('Нет знака')
  if (studyChars.includes(kanji)) return ensureStudySession(studyChars, title)
  return once(`extra:${kanji}`, async () => {
    const ids = loadIds()
    const extraId = ids.extras[kanji]
    if (extraId) {
      try {
        const sess = await memoApi.session(extraId)
        if (sess.kanji.some((k) => k.kanji === kanji)) return sess
      } catch {
        /* recreate */
      }
    }
    const sess = await memoApi.createSession(kanji, kanji)
    saveIds({ ...ids, extras: { ...ids.extras, [kanji]: sess.id } })
    return sess
  })
}
