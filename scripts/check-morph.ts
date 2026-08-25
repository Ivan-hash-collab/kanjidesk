import { deinflect, lookupAt } from '../src/lib/morph.ts'

const bag = new Set([
  'かかる',
  '掛かる',
  '浸かる',
  '浸る',
  '見る',
  '食べる',
  '行く',
  '効く',
  '長い',
  '時間',
  '少女',
  '水',
  'は',
  'に',
  'まで',
])

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name)
  console.log('ok', name)
}

const d1 = deinflect('かかった')
check('かかった→かかる', d1.includes('かかる'))
const d2 = deinflect('浸かった')
check('浸かった→浸かる', d2.includes('浸かる'))
const d3 = deinflect('見ていました')
check('見ていました→見る', d3.includes('見る'))
const d4 = deinflect('食べていました')
check('食べていました→食べる', d4.includes('食べる'))
const d5 = deinflect('効かなかった')
check('効かなかった→効く', d5.includes('効く'))
const d6 = deinflect('行きました')
check('行きました→行く', d6.includes('行く'))

const t1 = '時間がかかった。'
const i1 = t1.indexOf('かかった')
const h1 = lookupAt(t1, i1, bag)
check('no かかっ', !h1.some((h) => h.surface === 'かかっ' || h.surface === 'かか'))
check('かかった lemma', h1[0]?.surface === 'かかった' && h1[0]?.lemma === 'かかる')

const t2 = '少女はひざまで水に浸かった。'
const i2 = t2.indexOf('浸')
const h2 = lookupAt(t2, i2, bag)
check('no 浸か stem', !h2.some((h) => h.surface === '浸か' || h.surface === '浸かっ'))
check('浸かった lemma', h2.some((h) => h.surface === '浸かった' && h.lemma === '浸かる'))
check('浸 kanji', h2.some((h) => h.kind === 'kanji' && h.surface === '浸'))

console.log('all passed')
