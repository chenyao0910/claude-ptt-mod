"""產生 README 用的面板示意圖(SVG),排版照 plugins/ptt/hooks/register.tsx。

執行:
  python3 scripts/make-screenshots.py                    # 用內建的假資料
  npx tsx scripts/dump-live.mts Stock > /tmp/live.json
  python3 scripts/make-screenshots.py /tmp/live.json     # 用 PTT 現在的真實資料
"""
import json
import re
import sys
import unicodedata
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'docs' / 'images'

CW, LH, PAD, TOP = 8.4, 20, 18, 46  # 字寬、行高、邊距、標題列高度
FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans Mono CJK TC', monospace"

C = {
    'bg': '#1a1b26', 'fg': '#c0caf5', 'dim': '#6b7089', 'blue': '#7aa2f7', 'bluebg': '#3d59a1',
    'white': '#ffffff', 'yellow': '#e0af68', 'cyan': '#7dcfff', 'green': '#9ece6a', 'red': '#f7768e',
    'magenta': '#bb9af7', 'accent': '#ff9e64', 'frame': '#24283b', 'border': '#3b4261',
}


def cells(s: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in 'WF' else 1 for ch in s)


def seg(text, color='fg', bold=False, bg=None):
    return (text, color, bold, bg)


def gap():
    return seg(' ')


def render(name: str, title: str, lines: list[list[tuple]], cols: int = 92):
    width = PAD * 2 + cols * CW
    height = TOP + PAD + len(lines) * LH + PAD
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">',
        f'<rect width="100%" height="100%" rx="10" fill="{C["bg"]}"/>',
        f'<rect width="100%" height="{TOP - 10}" rx="10" fill="{C["frame"]}"/>',
        f'<rect y="{TOP - 20}" width="100%" height="10" fill="{C["frame"]}"/>',
    ]
    for i, col in enumerate(['#ff5f56', '#ffbd2e', '#27c93f']):
        out.append(f'<circle cx="{20 + i * 20}" cy="{(TOP - 10) / 2}" r="6" fill="{col}"/>')
    out.append(f'<text x="{width / 2:.0f}" y="{(TOP - 10) / 2 + 5}" fill="{C["dim"]}" font-family="{FONT}" font-size="13" text-anchor="middle">{escape(title)}</text>')
    for row, line in enumerate(lines):
        x = PAD
        y = TOP + PAD + row * LH
        for text, color, bold, bg in line:
            w = cells(text) * CW
            if bg:
                out.append(f'<rect x="{x:.1f}" y="{y - 14}" width="{w:.1f}" height="{LH - 2}" fill="{C[bg]}"/>')
            if text.strip():
                weight = ' font-weight="700"' if bold else ''
                out.append(
                    f'<text x="{x:.1f}" y="{y}" fill="{C[color]}" font-family="{FONT}" font-size="14"{weight} '
                    f'textLength="{w:.1f}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">{escape(text)}</text>'
                )
            x += w
    out.append('</svg>')
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text('\n'.join(out), encoding='utf-8')
    print('wrote', OUT / name)


def header(board):
    return [seg(' PTT ', 'white', True, 'bluebg'), gap(), seg('批踢踢實業坊 ›', 'dim'), gap(), seg(board, 'yellow', True)]


def btn(label, kind='secondary'):
    if kind == 'primary':
        return seg(f'[ {label} ]', 'accent', True)
    if kind == 'plain':
        return seg(label, 'fg')
    return seg(f'[ {label} ]', 'fg')


TAG = {'新聞': 'cyan', '標的': 'magenta', '請益': 'green', '情報': 'yellow', '心得': 'blue', '閒聊': 'blue', '公告': 'red'}
NREC = lambda n: 'red' if n == '爆' else 'dim' if n.startswith('X') else 'yellow' if n.isdigit() and int(n) >= 10 else 'green' if n.strip() else 'fg'

BOARDS = ['Stock', 'Gossiping', 'Tech_Job', 'Soft_Job', 'DigiCurrency', 'Lifeismoney']


def board_row(current):
    row = [seg('看板', 'cyan', True), gap()]
    for i, b in enumerate(BOARDS):
        if i:
            row += [gap(), seg('|', 'dim'), gap()]
        row.append(btn(b, 'primary' if b == current else 'plain'))
    return row


def boxed(rows, inner, color):
    """把幾列內容包進圓角框,右邊框依實際字寬對齊。"""
    out = [[seg('╭' + '─' * (inner + 2) + '╮', color)]]
    for r in rows:
        used = sum(cells(t) for t, *_ in r)
        out.append([seg('│ ', color), *r, seg(' ' * (inner - used)), seg(' │', color)])
    out.append([seg('╰' + '─' * (inner + 2) + '╯', color)])
    return out


def post(nrec, tag, title, author, date, re=False):
    row = [seg(nrec.rjust(2), NREC(nrec), True), gap()]
    if re:
        row += [seg('Re:', 'dim'), gap()]
    row += [seg(f'[{tag}]', TAG.get(tag, 'fg')), gap(), seg(title), gap(), seg(author, 'cyan'), gap(), seg(date, 'dim')]
    return row


def clip(text, max_cells):
    out = ''
    for ch in text:
        if cells(out + ch) > max_cells - 1:
            return out + '…'
        out += ch
    return out


def split_title(title):
    m = re.match(r'^((?:Re|Fw|R|轉):\s*)?\[([^\]]{1,6})\]\s*(.*)$', title, re.I)
    if not m:
        return '', '', title
    return (m.group(1) or '').strip(), m.group(2), m.group(3) or title


def post_row(p):
    prefix, tag, rest = split_title(p['title'])
    nrec = p['nrec']
    row = [seg(nrec.rjust(2), NREC(nrec), True), gap()]
    if prefix:
        row += [seg(prefix, 'dim'), gap()]
    if tag:
        row += [seg(f'[{tag}]', TAG.get(tag, 'fg')), gap()]
    used = sum(cells(t) for t, *_ in row) + cells(p['author']) + cells(p['date']) + 2
    row += [seg(clip(rest, 88 - used)), gap(), seg(p['author'], 'cyan'), gap(), seg(p['date'], 'dim')]
    return row


FAKE = {
    'board': 'Stock',
    'posts': [
        {'nrec': '爆', 'title': '[標的] 2330 台積電 多 法說會前布局', 'author': 'alice0921', 'date': '10/06'},
        {'nrec': '46', 'title': '[請益] 超商股退場時機', 'author': 'snowcat', 'date': '10/06'},
        {'nrec': '12', 'title': '[新聞] 外資連三買 台股站上新高', 'author': 'newsbot88', 'date': '10/06'},
        {'nrec': '5', 'title': '[情報] 2026/10/06 注意處置股清單', 'author': 'lazyleo', 'date': '10/06'},
        {'nrec': '3', 'title': 'Re: [心得] 當沖一年的血淚心得', 'author': 'daytrader', 'date': '10/05'},
        {'nrec': 'X2', 'title': '[閒聊] 空頭的東風來了', 'author': 'bearbear', 'date': '10/05'},
        {'nrec': '28', 'title': '[標的] 0050 正二 一輩子多', 'author': 'longonly', 'date': '10/05'},
        {'nrec': '9', 'title': '[請益] 理論正確但績效不好怎麼調適', 'author': 'newbie42', 'date': '10/05'},
    ],
    'article': {
        'title': '[標的] 2330 台積電 多 法說會前布局', 'author': 'alice0921 (愛麗絲)', 'time': 'Tue Oct  6 09:00:00 2026',
        'body': '1. 標的:2330 台積電\n2. 分類:多\n3. 分析/正文:法說會前通常有一波預期行情,先小量布局。\n4. 進退場機制:跌破季線停損。',
        'pushes': [
            {'tag': '推', 'user': 'carol', 'text': '跟一個', 'time': '10/06 09:01'},
            {'tag': '推', 'user': 'daytrader', 'text': '季線停損很合理', 'time': '10/06 09:03'},
            {'tag': '噓', 'user': 'bearbear', 'text': '反指標出現了', 'time': '10/06 09:04'},
            {'tag': '→', 'user': 'newbie42', 'text': '請問法說會是哪天', 'time': '10/06 09:06'},
            {'tag': '推', 'user': 'longonly', 'text': '長抱不看盤', 'time': '10/06 09:10'},
        ],
    },
}

data = json.load(open(sys.argv[1], encoding='utf-8')) if len(sys.argv) > 1 else FAKE
board = data['board']

# 1. 文章列表
render('ptt-list.svg', 'Claude Code — PTT', [
    header(board),
    [],
    board_row(board),
    [seg('─' * 88, 'border')],
    [seg('操作', 'magenta', True), gap(), btn('重新整理'), gap(), btn('管理看板'), gap(), btn('老闆鍵')],
    [],
    *[post_row(p) for p in data['posts'][:12]],
    [],
    [btn('載入更舊的文章')],
])

# 2. 文章內頁:內文只放前幾行,簽名檔和發信站(含 IP)不放
a = data['article']
body = a['body'].split('\n--\n')[0]
body_lines = [l for l in body.split('\n') if l.strip()][:9]
good = sum(p['tag'].startswith('推') for p in a['pushes'])
bad = sum(p['tag'].startswith('噓') for p in a['pushes'])
prefix, tag, rest = split_title(a['title'])
title_row = ([seg(prefix, 'dim'), gap()] if prefix else []) + ([seg(f'[{tag}]', TAG.get(tag, 'fg'), True), gap()] if tag else []) + [seg(rest, 'fg', True)]
PUSH = {'推': 'green', '噓': 'red'}
render('ptt-article.svg', 'Claude Code — PTT', [
    header(f'{board} › 文章'),
    [],
    [btn('← 回列表', 'primary'), gap(), btn('老闆鍵')],
    [],
    *boxed([
        title_row,
        [seg('作者', 'dim'), gap(), seg(a['author'], 'cyan'), gap(), seg(f"· {a['time']}", 'dim')],
    ], max(58, sum(cells(t) for t, *_ in title_row) + 2), 'blue'),
    [],
    *[[seg(clip(l, 88))] for l in body_lines],
    [seg('─' * 88, 'border')],
    [seg(f'推 {good}', 'green', True), gap(), seg(f'噓 {bad}', 'red', True), gap(), seg(f"共 {len(a['pushes'])} 則", 'dim')],
    *[[seg(p['tag'], PUSH.get(p['tag'], 'fg'), True), gap(), seg(p['user'], 'yellow'), gap(),
       seg(clip(p['text'], 88 - cells(p['user']) - 16)), gap(), seg(p['time'], 'dim')] for p in a['pushes'][:6]],
])

# 3. 老闆鍵
LOG = [
    ('[info]  webpack 5.98.0 compiled successfully in 2384 ms', 'fg'),
    ('[info]  ✓ 412 modules transformed.', 'fg'),
    ('[debug] resolving dependency graph for @internal/payment-gateway', 'dim'),
    ('[info]  running migration 20261006_add_index_on_orders ... ok', 'fg'),
    ('[warn]  deprecated: Buffer() is deprecated, use Buffer.from()', 'yellow'),
    ('[info]  PASS  src/services/__tests__/ledger.test.ts (3.214 s)', 'fg'),
    ('[info]  PASS  src/services/__tests__/settlement.test.ts (2.871 s)', 'fg'),
    ('[debug] cache hit ratio 0.93 (hits=18231, misses=1374)', 'dim'),
    ('[info]  Tests: 128 passed, 128 total', 'fg'),
    ('[info]  watching for file changes...', 'fg'),
    ('_', 'dim'),
]
render('ptt-boss.svg', 'Claude Code — PTT', [[seg(t, c)] for t, c in LOG], cols=72)

# 4. 管理看板
render('ptt-manage.svg', 'Claude Code — PTT', [
    header(board),
    [],
    board_row(board),
    [seg('─' * 88, 'border')],
    [seg('操作', 'magenta', True), gap(), btn('重新整理'), gap(), btn('完成', 'primary'), gap(), btn('老闆鍵')],
    [],
    *boxed([
        [seg('管理看板', 'cyan', True)],
        *[[seg(b, 'yellow'), gap(), seg('✕ 移除')] for b in BOARDS],
        [seg('新增看板', 'fg', True), gap(), seg('NBA▏')],
        [seg('恢復預設看板', 'dim')],
    ], 44, 'cyan'),
    [],
    [seg('已新增 NBA', 'green')],
])
