// 用 plugin 本身的解析程式抓 PTT 現在的資料,給 make-screenshots.py 畫圖用
// 執行:npx tsx scripts/dump-live.mts Stock > /tmp/ptt-live.json
import { parseArticle, parseIndex } from '../plugins/ptt/hooks/parse.ts'

const board = process.argv[2] ?? 'Stock'
const get = async (path: string) =>
  (await fetch(`https://www.ptt.cc${path}`, { headers: { Cookie: 'over18=1' } })).text()

const index = parseIndex(await get(`/bbs/${board}/index.html`))
// 最新一頁可能只有幾篇,往前補到至少 12 篇
while (index.posts.length < 12 && index.prevPage) {
  const older = parseIndex(await get(index.prevPage))
  index.posts.push(...older.posts)
  index.prevPage = older.prevPage
}
// 文章圖挑一篇推文數適中的,畫面比較好看
const pick = index.posts.find(p => Number(p.nrec) >= 5 && Number(p.nrec) < 40) ?? index.posts[0]
const article = pick ? parseArticle(pick.url, await get(pick.url)) : null
console.log(JSON.stringify({ board: index.boardName || board, posts: index.posts, article }, null, 2))
