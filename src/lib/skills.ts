export type SkillId = 'mnemonic' | 'decompose' | 'readings' | 'lookalikes' | 'vocab' | 'etymology'

export const SKILL_GROUPS: {
  id: string
  title: string
  hint: string
  skills: { id: SkillId; label: string; hint: string }[]
}[] = [
  {
    id: 'remember',
    title: 'Как запомнить',
    hint: 'смысл знака и его чтения — разными приёмами',
    skills: [
      { id: 'mnemonic', label: 'История на значение', hint: 'картинка из формы → смысл. Не про чтения.' },
      { id: 'readings', label: 'Чтения', hint: 'он / кун и отдельный крючок на звук' },
    ],
  },
  {
    id: 'shape',
    title: 'Как выглядит',
    hint: 'из каких черт собран и с какими знаками его путают глазами',
    skills: [
      { id: 'decompose', label: 'Части знака', hint: 'разбор по форме' },
      { id: 'lookalikes', label: 'Не перепутать', hint: 'похожие по написанию. Всегда пишем, чем отличаются.' },
    ],
  },
  {
    id: 'use',
    title: 'По желанию',
    hint: 'для запоминания знака не обязательно',
    skills: [
      { id: 'vocab', label: 'Слова', hint: '2–4 слова с этим знаком' },
      { id: 'etymology', label: 'Откуда знак', hint: 'пиктограф, сложение или фонетик' },
    ],
  },
]

export const ALL_SKILLS = SKILL_GROUPS.flatMap((g) => g.skills)

export const SKILL_LABELS: Record<SkillId, string> = Object.fromEntries(
  ALL_SKILLS.map((s) => [s.id, s.label]),
) as Record<SkillId, string>

export const MNEMONIC_STYLES = [
  { id: 'visual-story', label: 'Визуальная история' },
  { id: 'wanikani-radicals', label: 'В духе WaniKani (радикалы-персонажи)' },
  { id: 'koohii-story', label: 'В духе Kanji Koohii (связный сюжет)' },
  { id: 'heisig-keyword', label: 'Heisig / RTK (keyword — закон)' },
  { id: 'phonetic', label: 'Фонетический крючок на чтение' },
  { id: 'short', label: 'Коротко, 1–2 фразы' },
] as const

export const MNEMONIC_REFS: { id: string; label: string }[] = [
  { id: 'wanikani', label: 'WaniKani' },
  { id: 'koohii', label: 'Kanji Koohii' },
  { id: 'heisig', label: 'Heisig RTK' },
  { id: 'kklc', label: 'KKLC keyword' },
  { id: 'phonetic_series', label: 'Фонетический ряд (kanjium)' },
]

export const DEFAULT_SKILLS: SkillId[] = ['mnemonic', 'decompose', 'readings', 'lookalikes']

export const MEMO_TOPICS: { id: SkillId; label: string; empty: string; cta: string }[] = [
  { id: 'mnemonic', label: 'История', empty: 'Истории для этого знака ещё нет.', cta: 'Придумать' },
  { id: 'decompose', label: 'Части', empty: 'Разбора формы ещё нет.', cta: 'Разобрать' },
  { id: 'readings', label: 'Чтения', empty: 'Крючка на чтения ещё нет.', cta: 'Объяснить' },
  { id: 'lookalikes', label: 'Похожие', empty: 'Сравнения с похожими знаками ещё нет.', cta: 'Сравнить' },
]
