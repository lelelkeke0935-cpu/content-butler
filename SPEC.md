# 內容管家 SPEC

2026-10-04 DevDay Exchange Community Hack Day: Taipei。本資料夾 13:00 後才建立，所有程式當天從零寫。

## 一句話

把一份創作者素材，變成「AI 找得到、可以上架」的文章：**關鍵字 → 訪綱 → 架構 → 文案 → 上架包**。

- 使用者：Zita（Cornven，Shopify 選物店，賣亞洲獨立創作者的文具、插畫周邊、設計小物）。使用者不是工程師。
- 核心原則：**AI 不亂編**。素材裡沒有的事實，一律寫成 `【待訪談補充：要補什麼】`，並且進訪綱去問創作者。
- 介面文字全部繁體中文、白話、短句。

## 檔案分工（互不改對方的檔案）

| 組 | 檔案 |
|---|---|
| 伺服器組 | `server.mjs`、`prompts/*.md`、`schemas/*.json`、`samples/sample-creator.txt`、`samples/mock.json`、`scripts/smoke.mjs`、`README.md` |
| 畫面組 | `public/index.html`、`public/style.css`、`public/app.js` |

共同規定：零依賴（只用 Node 24 內建模組與瀏覽器原生功能），不要安裝套件，不要執行 git，不要動 `SPEC.md`、`.gitignore`、`materials/`。

## 伺服器

- 啟動：`node server.mjs`。埠號 `process.env.PORT || 8990`，只聽 `127.0.0.1`。
- `GET /` 與靜態檔：`public/`（正確的 Content-Type，含 charset=utf-8）。
- 所有 API 回 JSON（UTF-8）。錯誤一律 `{ "ok": false, "error": "白話中文訊息" }` 加合適的狀態碼。伺服器不可因單一請求出錯而掛掉。
- 請求內文上限 25 MB（docx 會帶圖）。

### AI 呼叫（重要）

AI 一律透過本機 Codex CLI，不用 API key：

```
codex exec --skip-git-repo-check --ephemeral -s read-only \
  -c model_reasoning_effort="low" \
  -C <暫存資料夾> --output-schema <schemas/xxx.json> -o <暫存輸出檔> -
```

- 提示詞從 **stdin 寫入後立刻 end()**（參數 `-` 代表讀 stdin）。stdin 不關，codex 會一直等，這是實測過的雷。
- codex 執行檔位置：先用 `process.env.CODEX_BIN`，再試 `~/.local/node/bin/codex`，最後才用 `codex`。spawn 時的 `PATH` 要補上 `~/.local/node/bin:/opt/homebrew/bin:/usr/local/bin`。
- `-C` 用 `os.tmpdir()` 底下自建的空資料夾，不要用專案資料夾。
- 逾時 180 秒；逾時或 JSON 解析失敗回 `{ok:false,error}`。同時最多跑 3 個。
- 結果讀 `-o` 指定的檔案，內容就是符合 schema 的 JSON。
- schema 必須符合 OpenAI structured output 的嚴格規定：每個 object 都要 `"additionalProperties": false`，且所有屬性都列進 `required`。
- `process.env.MOCK_AI === "1"` 時不呼叫 codex，改回 `samples/mock.json` 裡對應階段的資料（給自動測試與斷網備援用），外層加 `"mock": true`。

### AI 階段回應的外層（四個 AI 階段都一樣）

```json
{ "ok": true, "cached": false, "mock": false, "generated_at": "2026-10-04T13:40:00+08:00", "elapsed_ms": 12000, "data": { } }
```

- 快取檔 `data/cache.json`。key = sha1(階段名 + JSON.stringify(輸入去掉 `force`))。
- 命中快取：`cached: true`，`generated_at` 是當初生成的時間，`elapsed_ms` 是當初花的時間。
- 請求帶 `"force": true`：略過快取、重新生成並覆寫。

### API 一覽

**`GET /api/health`** → `{ "ok": true, "codex": "logged-in" | "not-logged-in" | "missing", "mock": false, "cache_entries": 3 }`
（`codex login status` 的輸出含 `Logged in` 即 logged-in；結果快取 60 秒。）

**`GET /api/sample`** → `{ "ok": true, "name": "檔名", "text": "素材全文", "private": true|false }`
（`materials/` 裡有 `.txt` 就回第一個，`private: true`；否則回 `samples/sample-creator.txt`，`private: false`。）

**`POST /api/material`**
- JSON `{ "text": "..." }`，或直接上傳檔案原始位元組（header `x-filename: <encodeURIComponent 過的檔名>`，支援 `.docx`、`.txt`、`.md`）。
- `.docx` 用 macOS 內建 `textutil -convert txt -stdout <暫存檔>` 轉文字。
- 回 `{ "ok": true, "text": "清理後的文字", "chars": 1234, "links": ["https://..."], "source": "docx|text" }`。
- 清理：去掉重複的相鄰行、連續空行壓成一行、去掉不可見的方向控制字元（U+200E、U+200F、U+202A–U+202E）。

**`POST /api/brand`** `{ "url": "https://www.cornven.com/" }`（不呼叫 AI，全部固定規則，有快取）
回：
```json
{ "ok": true, "cached": false, "data": {
  "url": "https://www.cornven.com/", "name": "CORNVEN", "title": "…", "description": "…", "lang": "zh-TW",
  "platform": "Shopify", "counts": { "products": 125, "collections": 94, "articles": 0 },
  "collections": ["Stickers & Stationery", "Prints & Cards"] } }
```
- 抓首頁 HTML（帶一般瀏覽器 User-Agent，逾時 12 秒），取 `og:site_name` 或 `<title>`、`meta description`、`<html lang>`。
- 平台：HTML 含 `cdn.shopify.com` 或 `Shopify.` → `Shopify`；含 `wp-content` → `WordPress`；否則 `未知`。
- 數量：讀 `/sitemap.xml`，找 `sitemap_products`、`sitemap_collections`、`sitemap_blogs` 子表，各自數 `<loc>`。文章數＝blogs 子表中網址路徑有兩層以上（`/blogs/<blog>/<article>`）的數量。抓不到就填 `null`，不要報錯。
- `collections`：從首頁導覽連結 `/collections/...` 的文字取最多 12 個不重複名稱；取不到給空陣列。
- `name`：`og:site_name` → 沒有就取 title 第一段（以 `｜`、`|`、`–`、`-` 切）。

**`POST /api/stage/keywords`** `{ "material": "素材文字", "brand": {…}, "force": false }` → data：
```json
{ "subject": "這份素材的主角（人名或品牌名）",
  "primary": "主關鍵字",
  "secondary": [ { "kw": "次關鍵字", "intent": "找資訊|找商品|找店|比較" } ],
  "questions": [ { "q": "客人會直接問 AI 的一句話", "why": "為什麼這句值得寫" } ] }
```
（secondary 6 個；questions 5 個。）

**`POST /api/stage/interview`** `{ "material", "brand", "keywords": <keywords 的 data>, "force" }` → data：
```json
{ "facts": [ { "fact": "素材裡確定有的事實", "quote": "素材原文片段（20 字內）" } ],
  "missing": [ "寫成好文章還缺的資訊" ],
  "questions": [ { "group": "創作起點|作品與角色|製作細節|買家常問|近況與通路", "q": "訪談題目", "why": "補哪個缺口" } ] }
```
（facts 5–8 個；missing 4–6 個；questions 8 題。）

**`POST /api/stage/outline`** `{ "material", "brand", "keywords", "force" }` → data：
```json
{ "h1": "文章標題",
  "answer_plan": "開頭那段要直接回答哪一句、怎麼答",
  "sections": [ { "h2": "小標", "points": ["這段要寫的重點"] } ],
  "faq": [ "常見問答的題目" ] }
```
（sections 4 個、每個 2–3 個重點；faq 4 題。）

**`POST /api/stage/draft`** `{ "material", "brand", "keywords", "outline": <outline 的 data>, "force" }` → data：
```json
{ "title": "文章標題",
  "answer": "開頭直接回答的那一段（60–110 個中文字）",
  "sections": [ { "h2": "小標", "body": "內文，段落用 \n\n 分隔" } ],
  "faq": [ { "q": "題目", "a": "答案" } ],
  "cta": "結尾一句，帶讀者去品牌網站",
  "seo_title": "搜尋結果標題（30 個中文字以內）",
  "meta_description": "搜尋結果描述（60–80 個中文字）",
  "handle": "english-url-slug",
  "tags": ["標籤"] }
```
（文案只能用素材裡的事實。缺的地方寫 `【待訪談補充：…】`。）

**`POST /api/stage/publish`** `{ "draft": <draft 的 data>, "brand", "keywords" }`（不呼叫 AI，固定規則）→
```json
{ "ok": true, "data": {
  "suggested_date": "2026-10-06T10:00:00+08:00",
  "html": "<p>…</p><h2>…</h2>…",
  "markdown": "# …",
  "jsonld": "{ … FAQPage 與 Article 的 JSON-LD 字串（已排版）… }",
  "todo_count": 2,
  "checks": [ { "id": "answer_first", "label": "開頭直接回答", "status": "pass|warn|fail", "detail": "一句白話說明" } ] } }
```
checks 固定這八項、依序：
1. `answer_first` 開頭直接回答：`answer` 長度 40–130 字 → pass，否則 warn。
2. `keyword_in_title` 標題有主關鍵字或主角名：`title` 含 `keywords.primary` 或 `keywords.subject` → pass，否則 warn。
3. `has_faq` 有常見問答：`faq` ≥ 3 → pass，否則 fail。
4. `seo_title_len` 搜尋標題長度：10–32 字 → pass，否則 warn。
5. `meta_len` 搜尋描述長度：50–90 字 → pass，否則 warn。
6. `brand_mentioned` 有提到品牌：全文含 `brand.name`（不分大小寫）→ pass，否則 warn。
7. `handle_format` 網址代稱格式：符合 `^[a-z0-9]+(-[a-z0-9]+)*$` → pass，否則 fail。
8. `no_placeholder` 沒有待補的地方：全文 `【待訪談補充` 出現次數為 0 → pass；否則 warn，detail 寫「還有 N 處要等訪談補充」。`todo_count` 就是這個次數。

`suggested_date`：下一個星期二早上 10:00（台北時間）。
`html`：`<p>answer</p>`，每段 `<h2>` + 段落 `<p>`，最後 `<h2>常見問答</h2>` + 每題 `<h3>`、`<p>`，再加 `<p>cta</p>`。文字要做 HTML escape。

### 提示詞（prompts/*.md）共同要求

- 用繁體中文（台灣用語）輸出。
- 只能根據素材與品牌資料。**不可編造**經歷、年份、獎項、價格、材質、數字。
- 關鍵字與「客人會問 AI 的話」要像真人會打的字，不要行話。
- 提示詞檔用 `{{material}}`、`{{brand}}`、`{{keywords}}`、`{{outline}}` 佔位，伺服器代入（素材最多取前 6000 字）。

### smoke 測試（scripts/smoke.mjs）

`MOCK_AI=1 PORT=8991` 啟動伺服器 → 依序打全部 API → 檢查外層欄位與八項 checks → 印出 PASS/FAIL → 關掉伺服器。

## 畫面

單頁，針對 1440×900 投影設計（最小寬 1100），字要大：內文 18px 起跳，標題 28–44px。

### 版面

- **頁首**：左邊「內容管家」＋一句副標「把創作者素材，變成 AI 找得到的文章」。右邊品牌小卡：品牌名、平台、商品數、分類數、文章數（文章數是 0 時用醒目的顏色寫「文章 0 篇：AI 沒有內容可以引用」）。再右邊是 Codex 連線狀態燈。
- **左欄（固定寬約 360px）素材區**：品牌網址輸入框（預設 `https://www.cornven.com/`）；素材文字框；「選檔案」（.docx/.txt/.md）；「載入示範素材」；素材字數；大按鈕「開始生產」。
- **右邊主區**：上方是五個階段的步驟條（①關鍵字 ②訪綱 ③架構 ④文案 ⑤上架包），每個顯示狀態（等待／進行中＋秒數／完成／失敗）。下方一次顯示一個階段的內容卡。點步驟條切換。生產進行中，自動跳到最新完成的階段（使用者自己點過就不再自動跳）。

### 流程（app.js）

1. 載入時：`GET /api/health`、`POST /api/brand`。
2. 按「開始生產」：`keywords` → 同時跑 `interview` 與 `outline` → `draft` → `publish`。
3. 每個 AI 階段卡片右上角標示來源，三種：`即時生成・12 秒`、`已保存・13:58 生成`（cached 為 true）、`示範資料`（mock 為 true）。標示一定要有，不可省略。
4. 每個 AI 階段有「重新生成」按鈕（帶 `force: true`，並把後面依賴它的階段標成待重跑）。
5. 階段失敗：卡片顯示白話錯誤與「再試一次」。
6. 網址帶 `?mock=1`：完全不打伺服器，用 app.js 內建的一份示範資料（虛構創作者），所有階段標 `示範資料`。

### 各階段卡片內容

- **① 關鍵字**：主角、主關鍵字（大字）、6 個次關鍵字（標籤，附意圖）、5 句「客人會問 AI 的話」（對話泡泡樣式，附為什麼）。
- **② 訪綱**：左「素材裡已有的事實」（附原文片段）；右「還缺什麼」；下方 8 題訪談題目依 group 分組，附「補哪個缺口」。按鈕「複製訪綱」。
- **③ 架構**：H1、開頭回答計畫、4 個 H2 與重點、4 題 FAQ，像一張大綱紙。
- **④ 文案**：排成文章樣子。開頭回答那段要框起來標「AI 最容易引用的一段」。`【待訪談補充：…】` 要用醒目底色標出。
- **⑤ 上架包**：左邊八項檢查（pass 綠、warn 黃、fail 紅，附 detail）；右邊搜尋標題、搜尋描述（顯示字數）、網址代稱、標籤、建議上架日。按鈕：「複製 HTML（貼進 Shopify 文章）」「複製結構化資料」「下載 Markdown」，以及一顆不能按的「排程發佈到 Shopify（下一步）」，旁邊小字「今天不連正式站」。

### 視覺方向：創作者的工作桌（手帳、貼紙、紙膠帶）

- 背景 `#FBF6EC` 加點陣（像點點筆記本）。墨色 `#23201C`。
- 強調色：番茄紅 `#E8553A`（主要按鈕、完成印章）、芥末黃 `#F0B43C`、湖綠 `#2F9C8E`、淡紫 `#B9A6E8`（五個階段各一條紙膠帶色，第五個用墨色）。
- 卡片：紙白 `#FFFDF8`、2px 墨色邊框、硬陰影 `6px 6px 0 #23201C`、頂端一條微微歪斜的紙膠帶。
- 字型：中文 `"Noto Sans TC"`（標題 900、內文 400/500），英數 `"Space Grotesk"`；Google Fonts 載入，載不到就退 `"PingFang TC", sans-serif`。
- 階段數字用很大的空心字。完成時蓋一顆會轉一下的圓形「完成」章。進行中用跑動的虛線邊框加秒數。
- 按鈕：膠囊形、墨色邊框、硬陰影，按下去往右下位移。
- 動畫只動 `transform` 與 `opacity`；支援 `prefers-reduced-motion`。
- 不要紫色漸層、不要毛玻璃、不要通用後台模板的長相。

## 今天不做

連接 Shopify 後台自動發佈與排程、帳號登入、多品牌管理、資料庫。
