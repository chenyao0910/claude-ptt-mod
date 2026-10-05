export type Post = { url: string; title: string; nrec: string; author: string; date: string }
export type Push = { tag: string; user: string; text: string; time: string }
export type Article = { url: string; title: string; author: string; time: string; body: string; pushes: Push[] }
export type Mode = 'list' | 'article' | 'boss'

declare module 'claude-code' {
  interface PluginState {
    ptt: {
      board: string
      boards: string[]
      editing: boolean
      posts: Post[]
      prevPage: string
      article: Article | null
      mode: Mode
      lastMode: Mode
      status: string
    }
  }
}
