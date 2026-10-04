'use strict';

const $ = (id) => document.getElementById(id);
const mockMode = new URLSearchParams(location.search).get('mock') === '1';
const names = ['關鍵字', '訪綱', '架構', '文案', '上架包'];
const keys = ['keywords', 'interview', 'outline', 'draft', 'publish'];
const colors = ['#E8553A', '#F0B43C', '#2F9C8E', '#B9A6E8', '#23201C'];
const dependencies = [[], [0], [0], [0, 2], [0, 3]];
const descendants = [[1, 2, 3, 4], [], [3, 4], [4], []];
const state = {
  stages: keys.map(() => ({ status: 'waiting', result: null, error: '', started: 0 })),
  active: 0, manual: false, busy: false, loading: false,
  brand: null, brandUrl: '', input: null, toastTimer: null
};
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const richText = (value) => escapeHTML(value).replace(/【待訪談補充：[^】]*】/g, '<mark>$&</mark>');
const charCount = (value) => Array.from(String(value || '')).length;
const list = (items) => `<ul>${items.map((item) => `<li>${richText(item)}</li>`).join('')}</ul>`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mockMaterial = '【虛構示範素材】\n創作者林小禾經營「小禾紙上散步」。她以街角植物、窗邊光影和散步時看到的風景為靈感，畫出日常裡的小發現。\n她的原創角色叫「葉葉」，是一位帶著小葉子的散步朋友。作品包含插畫明信片與裝飾貼紙，適合寫卡片與整理手帳。她先用鉛筆畫草稿，再以數位繪圖完成上色。\n這份示範素材未提供紙張材質、製作地、售價與補貨時間。品牌「日常選物」整理亞洲獨立創作者的文具與插畫作品，網站使用 Shopify。';
const mockBrand = { url: 'https://example.com/', name: '日常選物', title: '日常選物｜虛構示範品牌', description: '亞洲獨立創作者的文具與插畫作品', lang: 'zh-TW', platform: 'Shopify', counts: { products: 24, collections: 6, articles: 0 }, collections: ['文具與貼紙', '插畫與卡片'] };
const mockKeywords = {
  subject: '小禾紙上散步', primary: '小禾紙上散步插畫',
  secondary: [
    { kw: '植物插畫明信片', intent: '找商品' }, { kw: '原創角色葉葉', intent: '找資訊' },
    { kw: '手帳裝飾貼紙', intent: '找商品' }, { kw: '台灣插畫創作者', intent: '找資訊' },
    { kw: '日常選物文具', intent: '找店' }, { kw: '明信片與貼紙用途', intent: '比較' }
  ],
  questions: [
    { q: '小禾紙上散步的插畫在畫什麼？', why: '先認識創作者的題材與風格。' },
    { q: '葉葉是什麼角色？', why: '讓第一次看到作品的人了解角色。' },
    { q: '想裝飾手帳，可以挑哪種作品？', why: '把作品和使用情境連起來。' },
    { q: '插畫明信片可以怎麼用？', why: '回答寫卡片與日常記錄的需求。' },
    { q: '在哪裡認識小禾紙上散步？', why: '引導讀者繼續閱讀品牌介紹。' }
  ]
};
const mockInterview = {
  facts: [
    { fact: '林小禾經營小禾紙上散步。', quote: '創作者林小禾經營', source: '素材' },
    { fact: '靈感來自植物、光影與散步風景。', quote: '街角植物、窗邊光影', source: '素材' },
    { fact: '原創角色叫葉葉。', quote: '原創角色叫「葉葉」', source: '素材' },
    { fact: '作品包含明信片與裝飾貼紙。', quote: '作品包含插畫明信片與裝飾貼紙', source: '素材' },
    { fact: '先畫鉛筆草稿，再數位上色。', quote: '先用鉛筆畫草稿', source: '素材' }
  ],
  missing: ['創作起點與品牌命名故事', '葉葉的角色設定', '紙張材質與製作地', '售價、通路與補貨時間'],
  questions: [
    { group: '創作起點', q: '最初是什麼讓你開始畫畫？', why: '補上創作起點。' },
    { group: '創作起點', q: '小禾紙上散步的名字怎麼來的？', why: '補上品牌命名故事。' },
    { group: '作品與角色', q: '葉葉有哪些個性與小習慣？', why: '補上角色設定。' },
    { group: '作品與角色', q: '哪一段散步經驗變成了作品？', why: '補上具體的創作故事。' },
    { group: '製作細節', q: '明信片與貼紙使用什麼材質？', why: '補上紙張與表面特性。' },
    { group: '製作細節', q: '作品在哪裡製作？', why: '確認製作地。' },
    { group: '買家常問', q: '作品的售價與保存方式是什麼？', why: '補上購買前需要的資訊。' },
    { group: '近況與通路', q: '目前有哪些通路與補貨安排？', why: '確認購買方式與時間。' }
  ]
};
const mockOutline = {
  h1: '小禾紙上散步插畫：把日常風景收進紙上',
  answer_plan: '直接回答創作者畫什麼、有哪些作品，再說明適合的使用情境。',
  sections: [
    { h2: '從散步裡撿起創作靈感', points: ['街角植物與窗邊光影', '創作起點留給訪談補充'] },
    { h2: '認識散步朋友葉葉', points: ['帶著小葉子的原創角色', '角色個性留給訪談補充'] },
    { h2: '把插畫放進日常', points: ['明信片用來寫卡片', '裝飾貼紙用來整理手帳'] },
    { h2: '從草稿到完成作品', points: ['鉛筆草稿與數位上色', '材質與製作地仍待確認'] }
  ],
  faq: ['小禾紙上散步在畫什麼？', '葉葉是誰？', '有哪些作品可以使用？', '作品採用什麼材質？']
};
const mockDraft = {
  title: mockOutline.h1,
  answer: '小禾紙上散步是創作者林小禾的插畫品牌，以街角植物、窗邊光影與散步風景為靈感。作品包含插畫明信片與裝飾貼紙，也有帶著小葉子的原創角色「葉葉」，陪你寫卡片、整理手帳，把日常的小發現留在紙上。',
  sections: [
    { h2: '從散步裡撿起創作靈感', body: '林小禾把散步時看到的風景畫成插畫。街角的植物與窗邊的光影，都是她留意的小細節。\n\n【待訪談補充：開始創作的契機】' },
    { h2: '認識散步朋友葉葉', body: '葉葉是一位帶著小葉子的散步朋友，也是小禾紙上散步的原創角色。\n\n【待訪談補充：葉葉的個性與角色故事】' },
    { h2: '把插畫放進日常', body: '想寫一張卡片，可以用插畫明信片記下心情。整理手帳時，也可以用裝飾貼紙留下生活片段。' },
    { h2: '從草稿到完成作品', body: '林小禾先用鉛筆畫草稿，再透過數位繪圖完成上色。關於實體作品的製作細節，仍需要進一步訪談。' }
  ],
  faq: [
    { q: '小禾紙上散步在畫什麼？', a: '以街角植物、窗邊光影與散步風景為靈感，畫出日常裡的小發現。' },
    { q: '葉葉是誰？', a: '葉葉是帶著小葉子的散步朋友，也是創作者的原創角色。' },
    { q: '有哪些作品可以使用？', a: '素材中提到插畫明信片與裝飾貼紙，可用於寫卡片與整理手帳。' },
    { q: '作品採用什麼材質？', a: '【待訪談補充：明信片與貼紙的材質】' }
  ],
  cta: '謝謝你認識這份創作。歡迎到日常選物網站繼續探索，也可分享你想了解的作品細節。',
  seo_title: '小禾紙上散步插畫｜認識葉葉與日常紙品',
  meta_description: '認識小禾紙上散步與創作者林小禾，從街角植物、窗邊光影到原創角色葉葉，了解插畫明信片與裝飾貼紙的創作靈感，一起在日常選物探索寫卡片與整理手帳的靈感。',
  handle: 'little-grass-paper-walk', tags: ['插畫', '明信片', '手帳貼紙', '創作者故事']
};
function nextTuesday() {
  const local = new Date(Date.now() + 8 * 3600000);
  const days = (2 - local.getUTCDay() + 7) % 7 || 7;
  local.setUTCDate(local.getUTCDate() + days);
  return `${local.toISOString().slice(0, 10)}T10:00:00+08:00`;
}
const mockHTML = `<p>${escapeHTML(mockDraft.answer)}</p>${mockDraft.sections.map((s) => `<h2>${escapeHTML(s.h2)}</h2>${s.body.split('\n\n').map((p) => `<p>${escapeHTML(p)}</p>`).join('')}`).join('')}<h2>常見問答</h2>${mockDraft.faq.map((f) => `<h3>${escapeHTML(f.q)}</h3><p>${escapeHTML(f.a)}</p>`).join('')}<p>${escapeHTML(mockDraft.cta)}</p>`;
const mockPublish = {
  suggested_date: nextTuesday(), html: mockHTML,
  markdown: `# ${mockDraft.title}\n\n${mockDraft.answer}\n\n${mockDraft.sections.map((s) => `## ${s.h2}\n\n${s.body}`).join('\n\n')}\n\n## 常見問答\n\n${mockDraft.faq.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}\n\n${mockDraft.cta}\n`,
  jsonld: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: mockDraft.title, description: mockDraft.meta_description, articleBody: mockDraft.answer + '\n' + mockDraft.sections.map((s) => s.body).join('\n'), publisher: { '@type': 'Organization', name: mockBrand.name } },
    { '@type': 'FAQPage', mainEntity: mockDraft.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  ] }, null, 2),
  todo_count: 3,
  checks: [
    { id: 'answer_first', label: '開頭直接回答', status: 'pass', detail: '開頭先介紹創作者、作品與用途。' },
    { id: 'keyword_in_title', label: '標題有主關鍵字或主角名', status: 'pass', detail: '標題包含小禾紙上散步插畫。' },
    { id: 'has_faq', label: '有常見問答', status: 'pass', detail: '已整理 4 題常見問答。' },
    { id: 'seo_title_len', label: '搜尋標題長度', status: 'pass', detail: '標題長度適合搜尋結果。' },
    { id: 'meta_len', label: '搜尋描述長度', status: 'pass', detail: '描述長度適合搜尋結果。' },
    { id: 'brand_mentioned', label: '有提到品牌', status: 'pass', detail: '結尾已提到日常選物。' },
    { id: 'handle_format', label: '網址代稱格式', status: 'pass', detail: '使用小寫英文字與連字號。' },
    { id: 'no_placeholder', label: '沒有待補的地方', status: 'warn', detail: '還有 3 處要等訪談補充。' }
  ]
};
const mockData = [mockKeywords, mockInterview, mockOutline, mockDraft, mockPublish];

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function note(message, error = false) {
  $('material-note').textContent = message;
  $('material-note').classList.toggle('error', error);
}
async function request(path, payload, rawFile) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 200000);
  try {
    const options = { signal: controller.signal };
    if (rawFile) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(rawFile.name) }, body: rawFile });
    else if (payload !== undefined) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const response = await fetch(path, options);
    let result;
    try { result = await response.json(); } catch { throw new Error('收到的內容不完整，請再試一次。'); }
    if (!response.ok || result.ok !== true) throw new Error(result.error || '這次沒有完成，請再試一次。');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('這次等太久了，請再試一次。');
    if (error instanceof TypeError) throw new Error('目前連不上服務，請稍後再試。');
    throw error;
  } finally { clearTimeout(timeout); }
}
function renderBrand() {
  const b = state.brand;
  if (!b) return;
  const count = (value) => value == null ? '待確認' : escapeHTML(value);
  $('brand-card').innerHTML = `<strong>${escapeHTML(b.name)}</strong><span class="brand-platform">${escapeHTML(b.platform)}</span><p>商品 ${count(b.counts.products)} 件 · 分類 ${count(b.counts.collections)} 個</p><p class="${b.counts.articles === 0 ? 'brand-warning' : ''}">文章 ${count(b.counts.articles)} 篇${b.counts.articles === 0 ? '：AI 沒有內容可以引用' : ''}</p>`;
}
async function loadBrand() {
  const url = $('brand-url').value.trim();
  if (mockMode) { state.brand = structuredClone(mockBrand); state.brandUrl = url; renderBrand(); return; }
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('請填完整品牌網址。'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('品牌網址請以 https:// 或 http:// 開頭。');
  const result = await request('/api/brand', { url });
  state.brand = result.data; state.brandUrl = url; renderBrand();
}
async function loadHealth() {
  if (mockMode) {
    $('health-text').textContent = '示範模式'; $('health-dot').className = 'health-dot ready'; return;
  }
  $('health-retry').hidden = true;
  $('health-text').textContent = 'Codex 連線中';
  try {
    const result = await request('/api/health');
    const ready = result.mock || result.codex === 'logged-in';
    $('health-dot').className = `health-dot ${ready ? 'ready' : 'off'}`;
    $('health-text').textContent = result.mock ? '示範服務' : ({ 'logged-in': 'Codex 已連線', 'not-logged-in': 'Codex 尚未登入', missing: '未找到 Codex' }[result.codex] || '連線待確認');
    $('health-retry').hidden = ready;
  } catch { $('health-text').textContent = '服務尚未連線'; $('health-dot').className = 'health-dot off'; $('health-retry').hidden = false; }
}
function updateControls() {
  const locked = state.busy || state.loading;
  for (const id of ['brand-url', 'material-text', 'ref-urls', 'choose-file', 'load-sample', 'file-input']) $(id).disabled = locked;
  const count = charCount($('material-text').value.trim());
  $('material-count').textContent = `${count.toLocaleString('zh-TW')} 字`;
  $('start').disabled = locked || count <= 40;
  $('start').innerHTML = `${state.busy ? '正在生產…' : state.loading ? '正在讀取…' : '開始生產'} <span aria-hidden="true">↗</span>`;
  document.querySelectorAll('[data-action="regenerate"], [data-action="retry"]').forEach((button) => { button.disabled = locked; });
}
function renderSteps() {
  $('steps').innerHTML = state.stages.map((stage, i) => {
    const labels = { waiting: '等待', running: `進行中 ${Math.floor((Date.now() - stage.started) / 1000)} 秒`, done: '✓ 完成', failed: '失敗', stale: '待重跑' };
    return `<button class="step ${stage.status}" data-step="${i}" role="tab" aria-selected="${state.active === i}" aria-controls="stage-card" style="--stage-color:${colors[i]}"><span class="step-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="step-name">${['①','②','③','④','⑤'][i]} ${names[i]}</span><span class="step-status">${labels[stage.status]}</span></button>`;
  }).join('');
  const done = state.stages.filter((s) => s.status === 'done').length;
  const running = state.stages.map((s, i) => s.status === 'running' ? names[i] : '').filter(Boolean);
  $('progress-count').textContent = `${done} / 5`;
  $('progress-text').textContent = running.length ? `正在整理${running.join('與')}，讓故事一步步成形。` : state.busy ? '正在準備下一步…' : done === 5 ? '五步完成。補齊訪談後，就能準備上架。' : state.stages.some((s) => s.status === 'failed') ? '有階段尚未完成，可以再試一次。' : state.stages.some((s) => s.status === 'stale') ? '內容已更新，後續階段待重跑。' : '準備好素材，就從關鍵字開始。';
}
function sourceLabel(result, i) {
  if (result.mock || mockMode) return '<span class="source demo">示範資料</span>';
  if (result.cached) {
    const date = new Date(result.generated_at);
    const time = Number.isNaN(date.getTime()) ? '先前' : date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
    return `<span class="source">已保存・${escapeHTML(time)} 生成</span>`;
  }
  return `<span class="source">即時生成・${Math.max(0, Math.round((result.elapsed_ms ?? state.stages[i].elapsed ?? 0) / 1000))} 秒</span>`;
}
function keywordsView(data) {
  return `<div class="keyword-lead"><p>這份故事的主角 · ${escapeHTML(data.subject)}</p><h3 class="primary-keyword">${escapeHTML(data.primary)}</h3></div><div class="keyword-tags">${data.secondary.map((item) => `<div class="keyword-tag">${escapeHTML(item.kw)}<span>${escapeHTML(item.intent)}</span></div>`).join('')}</div><h3>客人會問 AI 的話</h3><div class="bubbles">${data.questions.map((item) => `<div class="bubble"><p>「${escapeHTML(item.q)}」</p><small>${escapeHTML(item.why)}</small></div>`).join('')}</div>`;
}
function interviewView(data) {
  const groups = [...new Set(data.questions.map((item) => item.group))];
  return `<div class="two-columns"><section><h3>素材裡已有的事實</h3><ul class="facts">${data.facts.map((item) => `<li>${escapeHTML(item.fact)} <span class="fact-source">${escapeHTML(item.source)}</span><blockquote>「${escapeHTML(item.quote)}」</blockquote></li>`).join('')}</ul></section><section class="missing-note"><h3>還缺什麼</h3>${list(data.missing)}</section></div><section><h3>帶著這 8 題，聊出好故事。</h3>${groups.map((group) => `<div class="question-group"><h4>${escapeHTML(group)}</h4>${data.questions.filter((item) => item.group === group).map((item) => `<div class="interview-question"><strong>${escapeHTML(item.q)}</strong><p>補哪個缺口：${escapeHTML(item.why)}</p></div>`).join('')}</div>`).join('')}</section><div class="export-actions"><button data-action="copy-interview">複製訪綱</button></div>`;
}
function outlineView(data) {
  return `<h3 class="outline-title">${richText(data.h1)}</h3><div class="answer-plan"><strong>開頭回答計畫</strong><p>${richText(data.answer_plan)}</p></div>${data.sections.map((section, i) => `<section class="outline-section"><h3><span>${String(i + 1).padStart(2, '0')}</span>${richText(section.h2)}</h3>${list(section.points)}</section>`).join('')}<section class="outline-section"><h3>常見問答</h3>${list(data.faq)}</section>`;
}
function draftView(data) {
  return `${/【待訪談補充/.test(JSON.stringify(data)) ? '<p class="fill-hint">點黃色的標記，就能自己補上資訊。</p>' : ''}<article class="article"><h3 class="article-title">${richText(data.title)}</h3><div class="answer-box"><strong>AI 最容易引用的一段</strong><p>${richText(data.answer)}</p></div>${data.sections.map((section) => `<section><h3>${richText(section.h2)}</h3>${section.body.split(/\n\s*\n/).map((p) => `<p>${richText(p)}</p>`).join('')}</section>`).join('')}<section><h3>常見問答</h3>${data.faq.map((item) => `<div class="faq-item"><h4>${richText(item.q)}</h4><p>${richText(item.a)}</p></div>`).join('')}</section><p style="margin-top:26px">${richText(data.cta)}</p></article>`;
}
function publishView(data) {
  const draft = state.stages[3].result.data;
  const date = new Date(data.suggested_date);
  const dateLabel = Number.isNaN(date.getTime()) ? '待確認' : date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${data.todo_count > 0 ? `<p class="todo-banner">還有 ${escapeHTML(data.todo_count)} 處待訪談補充，請確認後再上架。</p>` : ''}<div class="publish-grid"><section><h3>上架前，逐項確認</h3><ul class="check-list">${data.checks.map((check) => {
    const status = ['pass', 'warn', 'fail'].includes(check.status) ? check.status : 'warn';
    return `<li class="check ${status}"><span class="check-icon" aria-label="${{ pass: '通過', warn: '待確認', fail: '未通過' }[status]}">${{ pass: '✓', warn: '!', fail: '×' }[status]}</span><div><strong>${escapeHTML(check.label)}</strong><p>${escapeHTML(check.detail)}</p></div></li>`;
  }).join('')}</ul></section><section><h3>搜尋與上架資訊</h3><dl class="publish-meta"><dt>搜尋標題<span class="char-count">${charCount(draft.seo_title)} 字</span></dt><dd>${richText(draft.seo_title)}</dd><dt>搜尋描述<span class="char-count">${charCount(draft.meta_description)} 字</span></dt><dd>${richText(draft.meta_description)}</dd><dt>網址代稱</dt><dd>${escapeHTML(draft.handle)}</dd><dt>標籤</dt><dd>${draft.tags.map(escapeHTML).join('、')}</dd><dt>建議上架日</dt><dd>${escapeHTML(dateLabel)}<br>台北時間</dd></dl></section></div><div class="export-actions"><button data-action="copy-html">複製 HTML（貼進 Shopify 文章）</button><button data-action="copy-jsonld">複製結構化資料</button><button data-action="download">下載 Markdown</button></div><div class="schedule"><button disabled>排程發佈到 Shopify（下一步）</button><small>今天不連正式站</small></div>`;
}
function renderCard() {
  const i = state.active;
  const stage = state.stages[i];
  const card = $('stage-card');
  card.style.setProperty('--stage-color', colors[i]);
  let actions = '', content = '';
  if (stage.status === 'done') {
    actions = sourceLabel(stage.result, i) + (i < 4 ? `<button class="small-button" data-action="regenerate" ${state.busy ? 'disabled' : ''}>重新生成</button>` : '');
    content = [keywordsView, interviewView, outlineView, draftView, publishView][i](stage.result.data);
  } else if (stage.status === 'failed') {
    content = `<div class="error-state"><h3>這一步還沒完成</h3><p>${escapeHTML(stage.error)}</p><button data-action="retry" ${state.busy ? 'disabled' : ''}>再試一次</button></div>`;
  } else {
    const titles = { waiting: '故事，從這裡慢慢成形。', running: `正在整理${names[i]}…`, stale: '前面的內容已更新。' };
    const hints = { waiting: '左邊放入素材，按「開始生產」。', running: '可以切換卡片，先看已完成的內容。', stale: '這一步需要重跑，才能跟上新版內容。' };
    content = `<div class="empty-state"><div class="empty-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div><h3>${titles[stage.status]}</h3><p>${hints[stage.status]}</p>${stage.status === 'stale' ? `<button data-action="retry" ${state.busy ? 'disabled' : ''}>重跑這一步</button>` : ''}</div>`;
  }
  card.innerHTML = `<div class="tape" aria-hidden="true"></div><div class="card-heading"><div><p class="card-kicker">第 ${i + 1} 步，共 5 步</p><h2>${names[i]}<span aria-hidden="true">${[' ↗',' ✎',' ≡',' ✦',' ↗'][i]}</span></h2></div><div class="card-actions">${actions}</div></div><div class="card-body">${content}</div>${stage.status === 'done' ? '<div class="complete-stamp" aria-label="這個階段已完成">完成</div>' : ''}`;
  updateControls();
}
function render() { renderSteps(); renderCard(); updateControls(); }
function invalidate(indices) {
  for (const i of indices) state.stages[i] = { status: 'stale', result: null, error: '', started: 0 };
}
function payloadFor(i, force) {
  const common = { material: state.input.material, brand: state.input.brand };
  const keywords = state.stages[0].result?.data;
  if (i === 0) return { ...common, force };
  if (i === 1 || i === 2) return { ...common, keywords, force };
  if (i === 3) return { ...common, keywords, outline: state.stages[2].result.data, force };
  return { draft: state.stages[3].result.data, brand: state.input.brand, keywords };
}
async function runStage(i, force = false) {
  if (state.stages[i].status === 'done' && !force) return true;
  if (!dependencies[i].every((dep) => state.stages[dep].status === 'done')) return false;
  const stage = state.stages[i];
  stage.status = 'running'; stage.error = ''; stage.started = Date.now(); stage.result = null;
  render();
  try {
    let result;
    if (mockMode) {
      await wait(600);
      result = { ok: true, cached: false, mock: true, generated_at: new Date().toISOString(), elapsed_ms: 600, data: structuredClone(mockData[i]) };
    } else result = await request(`/api/stage/${keys[i]}`, payloadFor(i, force));
    stage.result = result; stage.elapsed = Date.now() - stage.started; stage.status = 'done';
    if (!state.manual) state.active = i;
    render();
    return true;
  } catch (error) {
    stage.status = 'failed'; stage.error = error.message;
    if (!state.manual) state.active = i;
    render();
    return false;
  }
}
async function runPipeline() {
  if (!await runStage(0)) return;
  if (mockMode) { await runStage(1); await runStage(2); }
  else await Promise.all([runStage(1), runStage(2)]);
  if (state.stages[2].status === 'done' && await runStage(3)) await runStage(4);
}
async function startProduction() {
  if (state.busy || state.loading || charCount($('material-text').value.trim()) <= 40) return;
  state.busy = true; state.manual = false; state.active = 0;
  $('ref-status').textContent = '';
  state.stages = keys.map(() => ({ status: 'waiting', result: null, error: '', started: 0 }));
  render();
  try {
    await initialBrand;
    if (!state.brand || state.brandUrl !== $('brand-url').value.trim()) await loadBrand();
    let material = $('material-text').value.trim();
    if (!mockMode) {
      const refs = $('ref-urls').value.split(/\r?\n/).map(url => url.trim()).filter(Boolean).slice(0, 3);
      const result = await request('/api/material', { text: material, ...(refs.length ? { refs } : {}) });
      material = result.text;
      $('ref-status').innerHTML = (result.refs || []).map(ref => `<p title="${escapeHTML(ref.url)}">${ref.ok ? `✓ ${escapeHTML(ref.title)}（${escapeHTML(ref.chars)} 字）` : '✗ 讀不到這個網址'}</p>`).join('');
    }
    if (charCount(material.trim()) <= 40) throw new Error('整理後的素材不足，請補到超過 40 字。');
    state.input = { material, brand: structuredClone(state.brand) };
    note(mockMode ? '虛構示範素材，不連線也能完整演示。' : '素材已整理，開始製作文章。');
    await runPipeline();
  } catch (error) { note(error.message, true); }
  finally { state.busy = false; render(); }
}
async function rerun(i, force) {
  if (state.busy || state.loading || !state.input) return;
  const resumePipeline = state.stages[i].status === 'failed' && !force;
  state.busy = true;
  invalidate(descendants[i]);
  if (force) state.stages[i].status = 'stale';
  render();
  try {
    for (const dep of dependencies[i]) {
      if (!await runStage(dep)) { notify('前一步尚未完成，請先再試一次。'); return; }
    }
    const completed = await runStage(i, force);
    if (completed && resumePipeline) await runPipeline();
  } finally { state.busy = false; render(); }
}
async function copyText(value) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard');
    await navigator.clipboard.writeText(value);
    notify('已複製，可以貼上了。');
  } catch {
    const area = document.createElement('textarea');
    area.value = value; area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area); area.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch { /* 使用下方的白話提示。 */ }
    area.remove();
    notify(success ? '已複製，可以貼上了。' : '瀏覽器不允許複製，請開啟剪貼簿權限後再試。');
  }
}
function interviewText(data) {
  return `訪綱\n\n素材裡已有的事實\n${data.facts.map((f) => `• ${f.fact}\n  原文：${f.quote}`).join('\n')}\n\n還缺什麼\n${data.missing.join('\n')}\n\n${data.questions.map((q, i) => `${i + 1}. 【${q.group}】${q.q}\n補哪個缺口：${q.why}`).join('\n\n')}`;
}
async function loadSample() {
  if (state.busy || state.loading) return;
  state.loading = true; updateControls();
  try {
    const result = mockMode ? { text: mockMaterial, name: '小禾紙上散步', private: false } : await request('/api/sample');
    $('material-text').value = result.text;
    note(`${result.private ? '已載入本機素材' : '已載入示範素材'}：${result.name}`);
  } catch (error) { note(error.message, true); }
  finally { state.loading = false; updateControls(); }
}
async function uploadFile() {
  const file = $('file-input').files[0];
  if (!file || state.busy || state.loading) return;
  if (!/\.(docx|txt|md)$/i.test(file.name)) { note('請選文件、純文字或 Markdown 檔案。', true); $('file-input').value = ''; return; }
  if (file.size > 25 * 1024 * 1024) { note('檔案超過 25 MB，請選較小的檔案。', true); $('file-input').value = ''; return; }
  state.loading = true; note('正在讀取檔案…'); updateControls();
  try {
    if (mockMode) {
      if (/\.docx$/i.test(file.name)) { note('示範模式不轉換文件，已載入內建示範素材。'); $('material-text').value = mockMaterial; }
      else { $('material-text').value = await file.text(); note(`已讀取 ${file.name}。五步內容使用虛構示範資料。`); }
    } else {
      const result = await request('/api/material', undefined, file);
      $('material-text').value = result.text; note(`已讀取 ${file.name}。`);
    }
  } catch (error) { note(error.message, true); }
  finally { $('file-input').value = ''; state.loading = false; updateControls(); }
}
$('steps').setAttribute('role', 'tablist');
$('steps').addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (!button) return;
  state.active = Number(button.dataset.step); state.manual = true; render();
});
$('stage-card').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'regenerate' || action === 'retry') { await rerun(state.active, action === 'regenerate'); return; }
  const result = state.stages[state.active].result;
  if (!result) return;
  if (action === 'copy-interview') await copyText(interviewText(result.data));
  if (action === 'copy-html') await copyText(result.data.html);
  if (action === 'copy-jsonld') await copyText(result.data.jsonld);
  if (action === 'download') {
    const url = URL.createObjectURL(new Blob([result.data.markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '創作者文章.md';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已準備好 Markdown 下載檔。');
  }
});
$('material-text').addEventListener('input', () => { updateControls(); note(charCount($('material-text').value.trim()) > 40 ? '素材準備好了，可以開始。' : '超過 40 字，就能開始。'); });
// Zita 的需求：待補的資訊可以自己填。點文案裡黃色的「待訪談補充」，打字補上，上架包的檢查會跟著更新。
$('stage-card').addEventListener('click', async (event) => {
  const markEl = event.target.closest('.article mark');
  if (!markEl || state.busy || state.stages[3].status !== 'done') return;
  const placeholder = markEl.textContent;
  const value = window.prompt(`補上這一段的資訊：\n${placeholder}`, '');
  if (!value || !value.trim()) return;
  const draft = state.stages[3].result.data;
  const swap = (text) => (typeof text === 'string' ? text.split(placeholder).join(value.trim()) : text);
  draft.title = swap(draft.title); draft.answer = swap(draft.answer); draft.cta = swap(draft.cta);
  draft.sections.forEach((section) => { section.h2 = swap(section.h2); section.body = swap(section.body); });
  draft.faq.forEach((item) => { item.q = swap(item.q); item.a = swap(item.a); });
  state.stages[4] = { status: 'waiting', result: null, error: '', started: 0 };
  state.manual = true; state.active = 3; render();
  await runStage(4, true);
  state.active = 3; render();
  notify('已補上。上架包的檢查也更新了。');
});
$('start').addEventListener('click', startProduction);
$('choose-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', uploadFile);
$('load-sample').addEventListener('click', loadSample);
$('health-retry').addEventListener('click', loadHealth);
if (mockMode) {
  $('mode-label').textContent = '示範資料 · 虛構創作者';
  $('material-text').value = mockMaterial;
  note('虛構示範素材，不連線也能完整演示。');
}
const initialBrand = loadBrand().catch((error) => {
  $('brand-card').innerHTML = '<strong>品牌資料待讀取</strong><p>開始生產時會再試一次。</p>';
  note(error.message, true);
});
void loadHealth();
render();
setInterval(() => { if (state.busy) renderSteps(); }, 500);

// 示範深連結：網址帶 ?shot=0..5 會自動載入素材；1–5 會跑完流程（有保存結果就秒回）並停在該階段。錄影片截圖用。
const shotParam = new URLSearchParams(location.search).get('shot');
if (shotParam !== null && !mockMode) (async () => {
  await initialBrand;
  await loadSample();
  if (shotParam !== '0') {
    await startProduction();
    state.active = Math.max(0, Math.min(4, Number(shotParam) - 1)); state.manual = true; render();
  }
  document.documentElement.dataset.shotReady = '1';
})();
