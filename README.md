# claude-ptt-mod

在 [Claude Code](https://claude.com/claude-code) 的面板裡滑 PTT。等 Claude 跑任務的空檔順便看一下盤後閒聊,老闆經過就按一個鍵切成假 log。

## 功能

- 看板文章列表:推文數上色(爆 / 10+ / 一般 / X),一路往前載入更舊的文章
- 文章閱讀:內文、推 / 噓統計、推文列表
- 自訂看板:新增、移除、恢復預設,關掉 Claude Code 再開還在
- 老闆鍵:一鍵把面板換成一堆看起來很忙的編譯和測試 log
- 免登入,八卦版的「已滿 18 歲」確認自動處理

## 需求

- Claude Code **2.1.289 以上**(需要支援 plugin function hooks 和面板)

## 安裝

```sh
claude plugin marketplace add chenyao0910/claude-ptt-mod
claude plugin install ptt@claude-ptt-mod
```

更新:

```sh
claude plugin update ptt@claude-ptt-mod
```

## 使用

| 指令 | 作用 |
| --- | --- |
| `/ptt` | 打開面板,顯示上次看的看板 |
| `/ptt Gossiping` | 直接開某個看板 |
| `/ptt add NBA` | 新增看板(名稱不分大小寫,會自動修正成 PTT 上的正式名稱) |
| `/ptt remove NBA` | 移除看板 |

面板裡也可以按「管理看板」新增、移除或恢復預設。

### 快捷鍵

先按 `ctrl+x` 再按 `tab` 讓面板取得焦點:

| 鍵 | 作用 |
| --- | --- |
| `b` | 老闆鍵(再按一次切回來) |
| `r` | 重新整理 |
| `n` | 載入更舊的文章 |
| `h` | 從文章回到列表 |
| `e` | 管理看板 |

老闆鍵畫面最下面那個灰色的 `_` 也可以點來切回來。

## 限制

- 只能看,不能推文或發文
- 面板一次能畫的字數有限:內文超過 6000 字會截斷,推文只顯示最後 150 則
- 資料來自 PTT 網頁版 `www.ptt.cc`,只在你打開看板或文章時才抓。PTT 改版的話解析可能會壞,歡迎開 issue

## 開發

```sh
claude plugin validate plugins/ptt
claude plugin test plugins/ptt
```

本機試跑:

```sh
claude --plugin-dir ./plugins/ptt
```

## 授權

MIT
