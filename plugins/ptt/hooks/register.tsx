import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Article, Mode, Post } from '../types'
import { parseArticle, parseIndex } from './parse'

const PANE = 'ptt'
const TITLE = 'PTT'
const HOST = 'https://www.ptt.cc'
// 面板一次最多畫約 10 萬字元,長文和爆文要截斷
const MAX_BODY = 6000
const MAX_PUSHES = 150
const MAX_POSTS = 200
const DEFAULT_BOARDS = ['Stock', 'Gossiping', 'Tech_Job', 'Soft_Job', 'DigiCurrency', 'Lifeismoney']
// 看板清單存在 $.store,關掉 Claude Code 再開還在
const STORE_BOARDS = 'boards'

const board = atom({ plugin: 'ptt', key: 'board' } as const, 'Stock')
const boards = atom({ plugin: 'ptt', key: 'boards' } as const, DEFAULT_BOARDS)
const editing = atom({ plugin: 'ptt', key: 'editing' } as const, false)
const posts = atom({ plugin: 'ptt', key: 'posts' } as const, [] as Post[])
const prevPage = atom({ plugin: 'ptt', key: 'prevPage' } as const, '')
const article = atom({ plugin: 'ptt', key: 'article' } as const, null as Article | null)
const mode = atom({ plugin: 'ptt', key: 'mode' } as const, 'list' as Mode)
const lastMode = atom({ plugin: 'ptt', key: 'lastMode' } as const, 'list' as Mode)
const status = atom({ plugin: 'ptt', key: 'status' } as const, '')

async function get($: Engine, path: string): Promise<string | undefined> {
  const res = await $.http.fetch(HOST + path, { headers: { Cookie: 'over18=1' } })
  if (!res.ok) {
    await update($, status, () => `讀取失敗 (HTTP ${res.status})`)
    return undefined
  }
  return res.text
}

async function loadBoard($: Engine, name: string, page?: string) {
  await update($, status, () => '讀取中…')
  const html = await get($, page ?? `/bbs/${name}/index.html`)
  if (html === undefined) return
  const parsed = parseIndex(html)
  await update($, board, () => parsed.boardName || name)
  // 翻舊頁時接在後面,方便一路往下滑
  await update($, posts, list => (page ? [...list, ...parsed.posts] : parsed.posts).slice(0, MAX_POSTS))
  await update($, prevPage, () => parsed.prevPage)
  await update($, mode, () => 'list')
  await update($, status, () => '')
}

async function openArticle($: Engine, url: string) {
  await update($, status, () => '讀取中…')
  const html = await get($, url)
  if (html === undefined) return
  await update($, article, () => parseArticle(url, html))
  await update($, mode, () => 'article')
  await update($, status, () => '')
}

async function toggleBoss($: Engine) {
  const now = await read($, mode)
  if (now === 'boss') {
    const back = await read($, lastMode)
    await update($, mode, () => back)
  } else {
    await update($, lastMode, () => now)
    await update($, mode, () => 'boss')
  }
}

const sameBoard = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

async function saveBoards($: Engine, list: string[]) {
  await update($, boards, () => list)
  await $.store.set(STORE_BOARDS, list)
}

// 回傳給使用者看的結果訊息
async function addBoard($: Engine, raw: string): Promise<string> {
  const name = raw.trim()
  const list = await read($, boards)
  let msg: string
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    msg = '看板名稱只能有英文、數字、底線和減號,例如 NBA、C_Chat'
  } else if (list.some(b => sameBoard(b, name))) {
    msg = `已經有 ${list.find(b => sameBoard(b, name))} 了`
  } else {
    const res = await $.http.fetch(`${HOST}/bbs/${name}/index.html`, { headers: { Cookie: 'over18=1' } })
    if (res.status === 404) {
      msg = `PTT 上找不到 ${name} 這個看板`
    } else if (!res.ok) {
      msg = `確認看板時連線失敗 (HTTP ${res.status}),稍後再試`
    } else {
      const canonical = parseIndex(res.text).boardName || name
      await saveBoards($, [...list, canonical])
      msg = `已新增 ${canonical}`
    }
  }
  await update($, status, () => msg)
  return msg
}

async function removeBoard($: Engine, raw: string): Promise<string> {
  const list = await read($, boards)
  const target = list.find(b => sameBoard(b, raw.trim()))
  const msg = target ? `已移除 ${target}` : `清單裡沒有 ${raw.trim()}`
  if (target) await saveBoards($, list.filter(b => b !== target))
  await update($, status, () => msg)
  return msg
}

async function resetBoards($: Engine) {
  await saveBoards($, DEFAULT_BOARDS)
  await update($, status, () => '已恢復預設看板')
}

function nrecColor(n: string): string | undefined {
  if (n === '爆') return 'red'
  if (n.startsWith('X')) return 'gray'
  const v = Number(n)
  if (v >= 10) return 'yellow'
  if (v > 0) return 'green'
  return undefined
}

// 標題拆成「Re: / Fw:」、分類標籤、其餘文字,標籤依分類上色
function splitTitle(title: string): { prefix: string; tag: string; rest: string } {
  const m = title.match(/^((?:Re|Fw|R|轉):\s*)?\[([^\]]{1,6})\]\s*(.*)$/i)
  if (!m) return { prefix: '', tag: '', rest: title }
  return { prefix: (m[1] ?? '').trim(), tag: m[2] ?? '', rest: m[3] || title }
}

const TAG_COLORS: Record<string, string> = {
  新聞: 'cyan',
  標的: 'magenta',
  請益: 'green',
  問卦: 'green',
  情報: 'yellow',
  心得: 'blue',
  閒聊: 'blueBright',
  討論: 'blueBright',
  爆卦: 'red',
  公告: 'red',
  分享: 'yellowBright',
}
const tagColor = (tag: string) => TAG_COLORS[tag.trim()] ?? 'white'

function statusColor(msg: string): string {
  if (msg.startsWith('讀取中')) return 'yellow'
  if (msg.startsWith('已')) return 'green'
  return 'red'
}

const pushColor = (tag: string) => (tag.startsWith('推') ? 'green' : tag.startsWith('噓') ? 'red' : undefined)

// 老闆鍵畫面:看起來很忙的假 log
const FAKE_LOG = [
  '[info]  webpack 5.98.0 compiled successfully in 2384 ms',
  '[info]  ✓ 412 modules transformed.',
  '[debug] resolving dependency graph for @internal/payment-gateway',
  '[info]  running migration 20261006_add_index_on_orders ... ok',
  '[warn]  deprecated: Buffer() is deprecated, use Buffer.from()',
  '[info]  PASS  src/services/__tests__/ledger.test.ts (3.214 s)',
  '[info]  PASS  src/services/__tests__/settlement.test.ts (2.871 s)',
  '[debug] cache hit ratio 0.93 (hits=18231, misses=1374)',
  '[info]  Tests: 128 passed, 128 total',
  '[info]  watching for file changes...',
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ptt',
      description: '在面板裡滑 PTT。/ptt 看板名 直接開;/ptt add 看板名、/ptt remove 看板名 管理看板',
    })
    const saved = await $.store.get(STORE_BOARDS)
    if (Array.isArray(saved) && saved.every(b => typeof b === 'string')) await update($, boards, () => saved as string[])
    return next(e)
  })

  on('command.run', { command: 'ptt' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    if (verb === 'add' || verb === 'remove' || verb === 'rm') {
      if (arg === '') return { text: `用法:/ptt ${verb} 看板名稱` }
      return { text: verb === 'add' ? await addBoard($, arg) : await removeBoard($, arg) }
    }
    const name = verb || (await read($, board))
    await $.ui.open({ id: PANE, title: TITLE })
    await loadBoard($, name)
    const shown = await read($, board)
    return { text: `PTT 面板已開啟:${shown} 板。面板取得焦點後(ctrl+x tab):b 老闆鍵、r 重新整理、n 載入更舊、h 回列表、e 管理看板。` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = ui
    const m = await read($, mode)
    const msg = await read($, status)

    if (m === 'boss') {
      return (
        <Box flexDirection="column">
          {FAKE_LOG.map(line => (
            <Text dimColor={line.startsWith('[debug]')} color={line.startsWith('[warn]') ? 'yellow' : undefined}>
              {line}
            </Text>
          ))}
          <Button key="boss" plain dimColor hotkey="b" label="_" onPress={() => void toggleBoss($)} />
        </Box>
      )
    }

    const name = await read($, board)
    const list = await read($, boards)
    const isEditing = await read($, editing)
    const width = Math.max(20, Math.min(e.props.bodyColumns, 100))
    const divider = <Text color="blue" dimColor>{'─'.repeat(width)}</Text>

    const header = (
      <Box key="header" flexDirection="row" columnGap={1}>
        <Text backgroundColor="blue" color="white" bold>{' PTT '}</Text>
        <Text dimColor>批踢踢實業坊 ›</Text>
        <Text color="yellow" bold>{m === 'article' ? `${name} › 文章` : name}</Text>
      </Box>
    )

    const statusLine = msg !== '' && <Text color={statusColor(msg)}>{msg}</Text>

    if (m === 'article') {
      const a = await read($, article)
      if (a) {
        const good = a.pushes.filter(p => p.tag.startsWith('推')).length
        const bad = a.pushes.filter(p => p.tag.startsWith('噓')).length
        const body = a.body.length > MAX_BODY ? `${a.body.slice(0, MAX_BODY)}\n…(內文太長,後面省略)` : a.body
        const shown = a.pushes.slice(-MAX_PUSHES)
        const t = splitTitle(a.title)
        return (
          <Box flexDirection="column" gap={1}>
            {header}
            <Box key="nav" flexDirection="row" columnGap={1}>
              <Button key="back" hotkey="h" variant="primary" label="← 回列表" onPress={() => void update($, mode, () => 'list')} />
              <Button key="boss" hotkey="b" variant="secondary" label="老闆鍵" onPress={() => void toggleBoss($)} />
            </Box>
            <Box key="head" flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
              <Box key="title-row" flexDirection="row" columnGap={1}>
                {t.prefix !== '' && <Text dimColor>{t.prefix}</Text>}
                {t.tag !== '' && <Text color={tagColor(t.tag)} bold>{`[${t.tag}]`}</Text>}
                <Text bold>{t.rest}</Text>
              </Box>
              <Box key="meta-row" flexDirection="row" columnGap={1}>
                <Text dimColor>作者</Text>
                <Text color="cyan">{a.author}</Text>
                <Text dimColor>{`· ${a.time}`}</Text>
              </Box>
            </Box>
            <Text wrap="wrap">{body}</Text>
            {divider}
            <Box key="score" flexDirection="row" columnGap={1}>
              <Text color="green" bold>{`推 ${good}`}</Text>
              <Text color="red" bold>{`噓 ${bad}`}</Text>
              <Text dimColor>{`共 ${a.pushes.length} 則${shown.length < a.pushes.length ? `(只顯示最後 ${shown.length} 則)` : ''}`}</Text>
            </Box>
            <Box key="pushes" flexDirection="column">
              {shown.map((p, i) => (
                <Box key={`push${i}`} flexDirection="row" columnGap={1}>
                  <Text color={pushColor(p.tag)} bold>{p.tag}</Text>
                  <Text color="yellow">{p.user}</Text>
                  <Text wrap="wrap">{p.text}</Text>
                  <Text dimColor>{p.time}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )
      }
    }

    // 看板一列、操作一列,中間用線分開
    const boardRow = (
      <Box key="boards" flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text color="cyan" bold>看板</Text>
        {list.flatMap((b, i) => [
          ...(i > 0 ? [<Text dimColor>|</Text>] : []),
          <Button
            key={`board-${b}`}
            variant={b === name ? 'primary' : undefined}
            plain={b === name ? undefined : true}
            label={b}
            onPress={() => void loadBoard($, b)}
          />,
        ])}
      </Box>
    )
    const actionRow = (
      <Box key="actions" flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text color="magenta" bold>操作</Text>
        <Button key="refresh" hotkey="r" variant="secondary" label="重新整理" onPress={() => void loadBoard($, name)} />
        <Button key="edit" hotkey="e" variant={isEditing ? 'primary' : 'secondary'} label={isEditing ? '完成' : '管理看板'} onPress={() => void update($, editing, v => !v)} />
        <Button key="boss" hotkey="b" variant="secondary" label="老闆鍵" onPress={() => void toggleBoss($)} />
      </Box>
    )

    const manage = isEditing && (
      <Box key="manage" flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>管理看板</Text>
        {list.length === 0 && <Text dimColor>清單是空的,新增一個看板吧</Text>}
        {list.map(b => (
          <Box key={`row-${b}`} flexDirection="row" columnGap={1}>
            <Text color="yellow">{b}</Text>
            <Button key={`remove-${b}`} plain label="✕ 移除" hover={{ color: 'red', bold: true }} onPress={() => void removeBoard($, b)} />
          </Box>
        ))}
        {'Input' in ui ? (
          <ui.Input key="add-board" label="新增看板" placeholder="輸入看板英文名稱,例如 NBA,按 Enter" onSubmit={(v: string) => void addBoard($, v)} />
        ) : (
          <Text dimColor>新增看板:輸入 /ptt add 看板名稱</Text>
        )}
        <Button key="reset" plain dimColor label="恢復預設看板" onPress={() => void resetBoards($)} />
      </Box>
    )

    const items = await read($, posts)
    const older = await read($, prevPage)
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Box key="controls" flexDirection="column">
          {boardRow}
          {divider}
          {actionRow}
        </Box>
        {manage}
        {statusLine}
        <Box key="list" flexDirection="column">
          {items.length === 0 && msg === '' && <Markdown key="empty" text="_還沒載入,按上面的看板或「重新整理」_" />}
          {items.map(p => {
            const t = splitTitle(p.title)
            return (
              <Box key={p.url} flexDirection="row" columnGap={1}>
                <Text color={nrecColor(p.nrec)} bold>{p.nrec.padStart(2, ' ') || '  '}</Text>
                {t.prefix !== '' && <Text dimColor>{t.prefix}</Text>}
                {t.tag !== '' && <Text color={tagColor(t.tag)}>{`[${t.tag}]`}</Text>}
                <Button key={`open-${p.url}`} plain label={t.rest} hover={{ color: 'cyan', bold: true }} onPress={() => void openArticle($, p.url)} />
                <Text color="cyan" dimColor wrap="truncate">{p.author}</Text>
                <Text dimColor>{p.date}</Text>
              </Box>
            )
          })}
        </Box>
        {older !== '' && <Button key="older" hotkey="n" variant="secondary" label="載入更舊的文章" onPress={() => void loadBoard($, name, older)} />}
      </Box>
    )
  })
}
