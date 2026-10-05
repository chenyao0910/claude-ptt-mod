import type { Article, Post, Push } from '../types'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lsaquo: '‹', rsaquo: '›' }

export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10))
    return ENTITIES[code] ?? m
  })
}

const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, ''))

export function parseIndex(html: string): { posts: Post[]; prevPage: string; boardName: string } {
  // 置底公告在 r-list-sep 之後,略過
  const listPart = html.split('<div class="r-list-sep"></div>')[0] ?? html
  const posts: Post[] = []
  for (const chunk of listPart.split('<div class="r-ent">').slice(1)) {
    const link = chunk.match(/<a href="(\/bbs\/[^"]+\.html)">([\s\S]*?)<\/a>/)
    if (!link) continue // 已刪除的文章沒有連結
    posts.push({
      url: link[1] ?? '',
      title: stripTags(link[2] ?? '').trim(),
      nrec: stripTags(chunk.match(/<div class="nrec">([\s\S]*?)<\/div>/)?.[1] ?? '').trim(),
      author: (chunk.match(/<div class="author">([^<]*)/)?.[1] ?? '').trim(),
      date: (chunk.match(/<div class="date">([^<]*)/)?.[1] ?? '').trim(),
    })
  }
  const prevPage = html.match(/href="([^"]+)">&lsaquo; 上頁/)?.[1] ?? ''
  // 看板的正式名稱(大小寫以 PTT 為準)
  const boardName = html.match(/<a class="board" href="\/bbs\/([^/]+)\/index\.html">/)?.[1] ?? ''
  return { posts: posts.reverse(), prevPage, boardName }
}

// 有些看板(例如八卦板)推文會附 IP,面板只顯示日期時間
export function pushTime(raw: string): string {
  return raw.match(/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?\s*$/)?.[0].trim() ?? raw
}

export function parseArticle(url: string, html: string): Article {
  const start = html.indexOf('<div id="main-content"')
  const main = start >= 0 ? html.slice(start) : html
  const meta = [...main.matchAll(/<span class="article-meta-value">([^<]*)<\/span>/g)].map(m => decode(m[1] ?? ''))
  const firstPush = main.indexOf('<div class="push">')
  const bodyHtml = (firstPush >= 0 ? main.slice(0, firstPush) : main)
    .replace(/<div class="article-metaline(?:-right)?">[\s\S]*?<\/div>/g, '')
    .replace(/<div id="main-content"[^>]*>/, '')
  const body = stripTags(bodyHtml).replace(/\n{3,}/g, '\n\n').trim()
  const pushes: Push[] = [...main.matchAll(/<div class="push">([\s\S]*?)<\/div>/g)].map(m => {
    const p = m[1] ?? ''
    const span = (cls: string) => stripTags(p.match(new RegExp(`<span[^>]*${cls}[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '').trim()
    return { tag: span('push-tag'), user: span('push-userid'), text: span('push-content').replace(/^:\s*/, ''), time: pushTime(span('push-ipdatetime')) }
  })
  return {
    url,
    author: meta[0] ?? '',
    title: meta[2] ?? meta[1] ?? '',
    time: meta[3] ?? '',
    body,
    pushes,
  }
}
