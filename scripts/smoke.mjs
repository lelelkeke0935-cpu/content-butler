import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'content-smoke-'));
const base = 'http://127.0.0.1:8991';
let child, fixture, logs = '', passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; };
async function request(route, input, options = {}) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(20000), ...(input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), ...options });
  check(response.headers.get('content-type')?.includes('charset=utf-8'), 'UTF-8');
  return { status: response.status, data: await response.json() };
}
async function start() {
  child = spawn(process.execPath, [path.join(temp, 'server.mjs')], { cwd: temp, env: { ...process.env, PORT: '8991', MOCK_AI: '1', CODEX_BIN: '/no-codex-in-smoke' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  child.on('error', e => { logs += e.message; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('測試伺服器啟動失敗：' + logs);
    if (logs.includes('稿定管家：http://127.0.0.1:8991')) return;
    await delay(50);
  }
  throw new Error('測試伺服器啟動逾時。');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
}
function strictSchema(schema) {
  if (schema.type === 'object') {
    check(schema.additionalProperties === false, '嚴格物件');
    assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
    Object.values(schema.properties).forEach(strictSchema);
  } else if (schema.type === 'array') strictSchema(schema.items);
}
function match(schema, value) {
  if (schema.type === 'object') { assert.deepEqual(Object.keys(value).sort(), [...schema.required].sort()); for (const k of schema.required) match(schema.properties[k], value[k]); }
  else if (schema.type === 'array') { assert.ok(Array.isArray(value)); assert.ok(value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity)); value.forEach(v => match(schema.items, v)); }
  else if (schema.type === 'boolean') assert.equal(typeof value, 'boolean');
  else { assert.equal(typeof value, 'string'); if (schema.enum) assert.ok(schema.enum.includes(value)); if (schema.maxLength) assert.ok([...value].length <= schema.maxLength); }
}
try {
  for (const name of ['server.mjs', 'prompts', 'schemas', 'samples']) await fs.cp(path.join(root, name), path.join(temp, name), { recursive: true });
  await fs.mkdir(path.join(temp, 'public')); await fs.writeFile(path.join(temp, 'public/index.html'), '<!doctype html><title>離線測試</title>');
  await fs.mkdir(path.join(temp, 'materials'));
  const schema = {};
  for (const stage of ['keywords', 'interview', 'outline', 'draft', 'social', 'fill']) { schema[stage] = JSON.parse(await fs.readFile(path.join(temp, `schemas/${stage}.json`))); strictSchema(schema[stage]); }
  await start();
  const home = await fetch(base); check(home.ok && home.headers.get('content-type').includes('text/html'), '靜態首頁');
  let r = await request('/api/health'); check(r.data.ok && r.data.mock === true && r.data.cache_entries === 0 && ['logged-in', 'not-logged-in', 'missing'].includes(r.data.codex), '健康狀態');
  r = await request('/api/sample'); check(r.data.ok && !r.data.private && r.data.name === 'sample-creator.txt', '示範素材');
  const material = r.data.text;
  await fs.writeFile(path.join(temp, 'materials/test.txt'), '離線測試素材');
  r = await request('/api/sample'); check(r.data.private && r.data.text === '離線測試素材', '私人素材優先');
  r = await request('/api/material', { text: '\u200e第一行\n第一行\n\n\n第二行\u202e\nhttps://example.invalid/' });
  check(r.data.text === '第一行\n\n第二行\nhttps://example.invalid/' && r.data.links.length === 1 && r.data.chars === [...r.data.text].length && r.data.source === 'text', '清理素材');
  check(!Object.hasOwn(r.data, 'refs'), '沒有參考網址時維持原回應');
  for (const ext of ['txt', 'md']) {
    r = await request('/api/material', undefined, { method: 'POST', headers: { 'x-filename': encodeURIComponent('測試.' + ext) }, body: '文字\n文字' });
    check(r.data.text === '文字' && r.data.source === 'text', '文字上傳');
  }
  if (process.platform === 'darwin') {
    const docx = spawnSync('/usr/bin/textutil', ['-convert', 'docx', '-format', 'txt', '-stdin', '-stdout'], { input: '離線文件測試', maxBuffer: 1024 * 1024 });
    assert.equal(docx.status, 0);
    r = await request('/api/material', undefined, { method: 'POST', headers: { 'x-filename': encodeURIComponent('素材.docx') }, body: docx.stdout });
    check(r.data.ok && r.data.source === 'docx' && r.data.text === '離線文件測試', '文件轉文字');
  }
  let origin, sitemapAvailable = true;
  fixture = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/') res.end('<html lang="zh-TW"><title>紙岸小舖｜創作選物</title><meta content="紙岸小舖" property="og:site_name"><meta name="description" content="創作與日常"><script src="https://cdn.shopify.com/test.js"></script><a href="/collections/cards">明信片</a><a href="/collections/cards">明信片</a></html>');
    else if (req.url === '/reference') res.end(`<html><head><title>參考 &amp; &#x1F33F;</title></head><body><script>隱藏腳本</script><style>隱藏樣式</style><noscript>隱藏文字</noscript><svg><text>隱藏圖形</text></svg><p>作品&nbsp;介紹 &lt;原文&gt; &#39;引句&#39;</p><p>${'🌿'.repeat(1600)}</p></body></html>`);
    else if (req.url === '/sitemap.xml' && !sitemapAvailable) { res.statusCode = 503; res.end(''); }
    else if (req.url === '/sitemap.xml') res.end(`<sitemapindex>${['products', 'collections', 'blogs'].map(s => `<sitemap><loc>${origin}/sitemap_${s}_1.xml</loc></sitemap>`).join('')}</sitemapindex>`);
    else if (req.url === '/sitemap_products_1.xml') res.end(`<urlset><url><loc>${origin}/products/card</loc></url></urlset>`);
    else if (req.url === '/sitemap_collections_1.xml') res.end(`<urlset><url><loc>${origin}/collections/cards</loc></url></urlset>`);
    else if (req.url === '/sitemap_blogs_1.xml') res.end(`<urlset><url><loc>${origin}/blogs/news</loc></url><url><loc>${origin}/blogs/news/story</loc></url></urlset>`);
    else { res.statusCode = 404; res.end(''); }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${fixture.address().port}`;
  r = await request('/api/material', { text: '素材\n素材', refs: [origin + '/missing', origin] });
  assert.deepEqual(r.data.refs, [
    { url: origin + '/missing', ok: false, title: '', chars: 0 },
    { url: origin, ok: true, title: '紙岸小舖｜創作選物', chars: 7 }
  ]);
  check(r.data.text === `素材\n\n【參考資料 1】紙岸小舖｜創作選物（${origin}）\n明信片 明信片`, '單頁失敗後仍接上參考資料');
  check(r.data.chars === [...r.data.text].length && r.data.links.includes(origin), '參考資料字數與連結');
  r = await request('/api/material', { text: '素材', refs: [origin + '/reference', origin, origin, origin + '/missing'] });
  check(r.data.refs.length === 3 && r.data.refs.every(ref => ref.ok), '最多三個參考網址');
  check(r.data.refs[0].title === '參考 & 🌿' && r.data.refs[0].chars === 1500 && !r.data.text.includes('隱藏') && r.data.text.includes("作品 介紹 <原文> '引句'"), '清除標籤、解碼實體與字數上限');
  check(r.data.text.includes('【參考資料 2】') && r.data.text.includes('【參考資料 3】'), '成功來源依序編號');
  r = await request('/api/material', { text: '素材', refs: ['file:///tmp/test', 42, origin] });
  check(r.data.refs.length === 1 && r.data.refs[0].url === origin, '僅接收 http/https 字串');
  r = await request('/api/brand', { url: origin }); check(r.data.ok && !r.data.cached, '品牌解析');
  const brand = r.data.data;
  assert.deepEqual(brand.counts, { products: 1, collections: 1, articles: 1 }); assert.deepEqual(brand.collections, ['明信片']);
  check(brand.name === '紙岸小舖' && brand.platform === 'Shopify' && brand.lang === 'zh-TW' && brand.description === '創作與日常', '品牌欄位');
  r = await request('/api/brand', { url: origin }); check(r.data.cached, '品牌快取');
  sitemapAvailable = false;
  r = await request('/api/brand', { url: origin, force: true });
  check(r.data.ok && Object.values(r.data.data.counts).every(v => v === null), '網站數量讀不到時保留空值');
  await new Promise(resolve => fixture.close(resolve)); fixture = null;
  r = await request('/api/brand', { url: origin, force: true }); check(r.data.ok === false && typeof r.data.error === 'string', '離線抓取失敗可回應');
  const data = {}, responses = {};
  for (const stage of ['keywords', 'interview', 'outline', 'draft', 'social']) {
    const input = { material, brand, ...(stage === 'keywords' ? {} : { keywords: data.keywords }), ...(['draft', 'social'].includes(stage) ? { outline: data.outline } : {}), ...(stage === 'social' ? { draft: data.draft } : {}) };
    r = await request('/api/stage/' + stage, input);
    const v = r.data; check(v.ok && !v.cached && v.mock && Number.isFinite(Date.parse(v.generated_at)) && Number.isFinite(v.elapsed_ms) && v.elapsed_ms >= 0, stage + ' 外層');
    match(schema[stage], v.data); data[stage] = v.data; responses[stage] = { input, result: v };
    if (stage === 'interview') check(v.data.facts.every(f => typeof f.source === 'string' && f.source === '素材'), '事實都有出處');
    const cached = (await request('/api/stage/' + stage, { ...input, force: false })).data;
    check(cached.cached && cached.mock && cached.generated_at === v.generated_at && cached.elapsed_ms === v.elapsed_ms, stage + ' 快取');
    const forced = (await request('/api/stage/' + stage, { ...input, force: true })).data;
    check(forced.ok && !forced.cached && forced.mock, stage + ' 重新生成');
  }
  check(!JSON.stringify(data.social).includes('【待訪談補充') && !JSON.stringify(data.social).includes('#'), '社群省略待補標記與井號');
  const fillInput = { placeholder: '【待訪談補充：作品材質】', subject: data.keywords.subject, brand };
  const mockPath = path.join(temp, 'samples/mock.json');
  const sample = JSON.parse(await fs.readFile(mockPath, 'utf8'));
  r = await request('/api/fill', fillInput);
  check(r.data.ok && r.data.mock && Number.isFinite(r.data.elapsed_ms) && !Object.hasOwn(r.data, 'cached'), '查詢外層');
  match(schema.fill, r.data.data);
  assert.deepEqual(r.data.data, sample.fill);
  check(!r.data.data.found && r.data.data.text === '' && r.data.data.sources.length === 0, '查無資料');
  sample.fill = { found: true, text: '離線測試句子。', sources: ['https://example.com/fixture'] };
  await fs.writeFile(mockPath, JSON.stringify(sample));
  r = await request('/api/fill', fillInput);
  match(schema.fill, r.data.data);
  check(r.data.data.found && r.data.data.text === sample.fill.text && r.data.data.sources[0] === sample.fill.sources[0], '查到資料附出處且不使用快取');
  sample.fill.sources = [];
  await fs.writeFile(mockPath, JSON.stringify(sample));
  r = await request('/api/fill', fillInput);
  check(r.status === 502 && !r.data.ok, '缺少出處不採用');
  r = await request('/api/stage/publish', { draft: data.draft, brand, keywords: data.keywords });
  check(r.data.ok, '上架包');
  const published = r.data.data;
  assert.deepEqual(published.checks.map(c => c.id), ['answer_first', 'keyword_in_title', 'has_faq', 'seo_title_len', 'meta_len', 'brand_mentioned', 'handle_format', 'no_placeholder']);
  check(published.checks.every(c => ['pass', 'warn', 'fail'].includes(c.status) && c.label && c.detail), '八項檢查');
  check(published.todo_count === 2 && published.checks[7].status === 'warn' && published.checks[7].detail === '還有 2 處要等訪談補充', '待補標記');
  check(published.html.startsWith('<p>') && published.markdown.startsWith('# ') && JSON.parse(published.jsonld)['@graph'].length === 2, '匯出內容');
  const taipeiNow = new Date(Date.now() + 8 * 3600000);
  taipeiNow.setUTCDate(taipeiNow.getUTCDate() + ((2 - taipeiNow.getUTCDay() + 7) % 7 || 7));
  check(published.suggested_date === `${taipeiNow.toISOString().slice(0, 10)}T10:00:00+08:00`, '下一個週二');
  const changed = structuredClone(data.draft); changed.answer = '<script>alert("x")</script>'; changed.faq = []; changed.handle = 'Bad slug';
  r = await request('/api/stage/publish', { draft: changed, brand, keywords: data.keywords });
  check(!r.data.data.html.includes('<script>') && r.data.data.html.includes('&lt;script&gt;') && r.data.data.checks[0].status === 'warn' && r.data.data.checks[2].status === 'fail' && r.data.data.checks[6].status === 'fail', '跳脫與失敗檢查');
  for (const [route, input] of [['/api/fill', {}], ['/api/stage/social', {}], ['/api/stage/social', { material, brand, keywords: data.keywords, outline: data.outline }], ['/api/stage/draft', {}], ['/api/stage/publish', {}], ['/api/brand', { url: 'file:///tmp/test' }], ['/api/unknown', {}]]) {
    r = await request(route, input); check(r.status >= 400 && r.data.ok === false && typeof r.data.error === 'string', '錯誤回應');
  }
  r = await request('/api/material', undefined, { method: 'POST', body: '{' }); check(r.status === 400 && !r.data.ok, '不完整 JSON');
  r = await request('/api/material', undefined, { method: 'POST', headers: { 'x-filename': 'test.exe' }, body: 'test' }); check(r.status === 415, '檔案格式');
  r = await request('/api/material', undefined, { method: 'POST', body: Buffer.alloc(25 * 1024 * 1024 + 1, 32) }); check(r.status === 413 && !r.data.ok, '上傳大小限制');
  await stop();
  const savedCachePath = path.join(temp, 'data/cache.json');
  const savedCache = JSON.parse(await fs.readFile(savedCachePath, 'utf8'));
  const interviewId = createHash('sha1').update('interview' + JSON.stringify({ ...responses.interview.input, marketing: { goal: '認識創作者', audience: '', occasion: '', budget: '' } })).digest('hex'); // 伺服器會把行銷設定的預設值併進輸入再算快取
  savedCache[interviewId].data.facts.forEach(f => { delete f.source; });
  await fs.writeFile(savedCachePath, JSON.stringify(savedCache));
  logs = ''; await start();
  r = await request('/api/stage/interview', responses.interview.input);
  check(r.data.ok && !r.data.cached && r.data.data.facts.every(f => f.source === '素材'), '舊訪綱快取補齊出處');
  r = await request('/api/stage/keywords', responses.keywords.input); check(r.data.cached && r.data.mock, '重啟後快取');
  r = await request('/api/health'); check(r.data.ok && r.data.cache_entries === 6, '請求出錯後仍可服務');
  console.log(`PASS：${passed} 項檢查，全 API 離線流程完成。`);
} catch (e) { console.error('FAIL：' + e.message); process.exitCode = 1; }
finally { await stop(); if (fixture) await new Promise(resolve => fixture.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); }
