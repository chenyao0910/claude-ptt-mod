import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

const INDEX = `
<a class="btn wide" href="/bbs/Stock/index99.html">&lsaquo; 上頁</a>
<div class="r-ent"><div class="nrec"><span class="hl f1">爆</span></div><div class="title">
<a href="/bbs/Stock/M.1.A.AAA.html">[標的] 台積電 多 &amp; 噴</a></div><div class="meta">
<div class="author">alice</div><div class="date">10/06</div></div></div>
<div class="r-ent"><div class="nrec"></div><div class="title">(本文已被刪除) [bob]</div></div>
<div class="r-list-sep"></div>
<div class="r-ent"><div class="title"><a href="/bbs/Stock/M.9.A.ZZZ.html">[公告] 置底</a></div></div>`

const ARTICLE = `<div id="main-content" class="bbs-screen bbs-content"><div class="article-metaline"><span class="article-meta-tag">作者</span><span class="article-meta-value">alice (愛麗絲)</span></div><div class="article-metaline-right"><span class="article-meta-tag">看板</span><span class="article-meta-value">Stock</span></div><div class="article-metaline"><span class="article-meta-tag">標題</span><span class="article-meta-value">[標的] 台積電 多</span></div><div class="article-metaline"><span class="article-meta-tag">時間</span><span class="article-meta-value">Tue Oct  6 09:00:00 2026</span></div>
all in 台積電
--
<div class="push"><span class="hl push-tag">推 </span><span class="f3 hl push-userid">carol</span><span class="f3 push-content">: 跟</span><span class="push-ipdatetime"> 10/06 09:01
</span></div><div class="push"><span class="f1 hl push-tag">噓 </span><span class="f3 hl push-userid">dave</span><span class="f3 push-content">: 反指標</span><span class="push-ipdatetime"> 10/06 09:02
</span></div></div>`

// PTT 上存在的看板,key 為小寫,value 為正式名稱
const KNOWN: Record<string, string> = { stock: 'Stock', nba: 'NBA', gossiping: 'Gossiping' }
const RUN = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } } as const

// 記憶體裡的 $.store,測試可以直接看存了什麼
function fakeStore(on: On, initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial }
  on('store.get', async (_$, e) => ({ value: data[e.key] }))
  on('store.set', async (_$, e) => {
    data[e.key] = e.value
    return { value: undefined }
  })
  return data
}

function fakePtt(on: On) {
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('http.fetch', async (_$, e) => {
    const m = e.url.match(/\/bbs\/([^/]+)\/index\.html$/)
    if (!m) return { value: { status: 200, ok: true, headers: {}, text: ARTICLE } }
    const canonical = KNOWN[(m[1] ?? '').toLowerCase()]
    if (!canonical) return { value: { status: 404, ok: false, headers: {}, text: '' } }
    const text = `<a class="board" href="/bbs/${canonical}/index.html"><span class="board-label">看板 </span>${canonical}</a>${INDEX}`
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
}

const PROPS = { title: 'PTT', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/ptt 開面板、點文章、老闆鍵 (${surface})`, async ($, on) => {
    const fetched: string[] = []
    on('ui.open', async () => ({ value: { isPlaced: true } }))
    on('http.fetch', async (_$, e) => {
      fetched.push(e.url)
      const text = e.url.endsWith('index.html') ? INDEX : ARTICLE
      return { value: { status: 200, ok: true, headers: {}, text } }
    })

    const result = await $.command.run({ command: 'ptt', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } })
    expect(result.text).toContain('Stock')
    expect(fetched).toEqual(['https://www.ptt.cc/bbs/Stock/index.html'])

    const pane = await $.ui.mount({ plugin: 'ptt', surface, component: 'Pane', props: PROPS, requestId: 'ptt' })
    // 已刪除和置底公告不列出
    expect(await pane.find({ key: 'open-/bbs/Stock/M.9.A.ZZZ.html' })).toBeUndefined()
    expect(await pane.find({ key: 'older' })).toBeDefined()

    await pane.press({ key: 'open-/bbs/Stock/M.1.A.AAA.html' })
    expect(await pane.find({ type: 'Text', text: '[標的] 台積電 多' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /all in 台積電/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /推 1 · 噓 1/ })).toBeDefined()

    await pane.press({ key: 'boss' })
    expect(await pane.find({ type: 'Text', text: /webpack/ })).toBeDefined()
    await pane.press({ key: 'boss' })
    expect(await pane.find({ type: 'Text', text: /all in 台積電/ })).toBeDefined()

    await pane.press({ key: 'back' })
    expect(await pane.find({ key: 'toolbar' })).toBeDefined()
  })
}

test('/ptt add、remove 管理看板並存進 store', async ($, on) => {
  const store = fakeStore(on)
  fakePtt(on)
  const run = async (args: string) => (await $.command.run({ ...RUN, command: 'ptt', args })).text

  expect(await run('add nba')).toBe('已新增 NBA')
  expect(await run('add NBA')).toBe('已經有 NBA 了')
  expect(await run('add NoSuchBoard')).toBe('PTT 上找不到 NoSuchBoard 這個看板')
  expect(await run('add a/b')).toContain('只能有英文')
  expect(await run('add')).toContain('用法')
  expect(store.boards).toContain('NBA')

  expect(await run('remove nba')).toBe('已移除 NBA')
  expect(await run('remove nba')).toBe('清單裡沒有 nba')
  expect(store.boards).not.toContain('NBA')
})

test('啟動時讀回上次存的看板', async ($, on) => {
  fakeStore(on, { boards: ['NBA', 'Gossiping'] })
  fakePtt(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, command: 'ptt', args: 'nba' })
  const pane = await $.ui.mount({ plugin: 'ptt', surface: 'terminal', component: 'Pane', props: PROPS, requestId: 'ptt' })
  expect(await pane.find({ key: 'board-NBA' })).toBeDefined()
  expect(await pane.find({ key: 'board-Stock' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`面板裡新增、移除看板 (${surface})`, async ($, on) => {
    const store = fakeStore(on)
    fakePtt(on)
    await $.command.run({ ...RUN, command: 'ptt' })
    const pane = await $.ui.mount({ plugin: 'ptt', surface, component: 'Pane', props: PROPS, requestId: 'ptt' })

    await pane.press({ key: 'edit' })
    await pane.input({ key: 'add-board', text: 'nba' })
    expect(await pane.find({ key: 'board-NBA' })).toBeDefined()

    await pane.press({ key: 'remove-Stock' })
    expect(await pane.find({ key: 'board-Stock' })).toBeUndefined()
    expect(store.boards).toEqual(['Gossiping', 'Tech_Job', 'Soft_Job', 'DigiCurrency', 'Lifeismoney', 'NBA'])

    await pane.press({ key: 'reset' })
    expect(await pane.find({ key: 'board-Stock' })).toBeDefined()
    expect(await pane.find({ key: 'board-NBA' })).toBeUndefined()
  })
}
