import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCK = process.env.MOCK_AI === '1';
const CACHE = path.join(ROOT, 'data/cache.json');
const stages = ['keywords', 'interview', 'outline', 'draft'];
const schemas = Object.fromEntries(await Promise.all(stages.map(async s => [s, JSON.parse(await fs.readFile(path.join(ROOT, `schemas/${s}.json`), 'utf8'))])));
let cache = Object.create(null);
try { const saved = JSON.parse(await fs.readFile(CACHE, 'utf8')); if (saved && typeof saved === 'object' && !Array.isArray(saved)) cache = Object.assign(Object.create(null), saved); } catch {}
let writes = Promise.resolve();
function saveCache() {
  writes = writes.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    const tmp = `${CACHE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache, null, 2));
    await fs.rename(tmp, CACHE);
  });
  return writes;
}
function key(stage, input) { const { force, ...rest } = input; return createHash('sha1').update(stage + JSON.stringify(rest)).digest('hex'); }
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validate(schema, value) {
  if (schema.type === 'object') return object(value) && schema.required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => Object.hasOwn(schema.properties, k) && validate(schema.properties[k], value[k]));
  if (schema.type === 'array') return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && value.every(v => validate(schema.items, v));
  if (schema.type === 'string') return typeof value === 'string' && (!schema.enum || schema.enum.includes(value)) && [...value].length >= (schema.minLength ?? 0) && [...value].length <= (schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(schema.pattern).test(value));
  return false;
}
const localBin = path.join(os.homedir(), '.local/node/bin');
const codexBin = () => process.env.CODEX_BIN || (existsSync(path.join(localBin, 'codex')) ? path.join(localBin, 'codex') : 'codex');
function run(bin, args, input = '', timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, PATH: `${localBin}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', stdout = '', settled = false;
    const finish = (err, result) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(Object.assign(new Error('等待超時，請再試一次。'), { status: 504 })); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', chunk => { output = (output + chunk.toString()).slice(-1024 * 1024); });
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.on('error', e => finish(e));
    child.on('close', code => finish(null, { code, output, stdout }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
let healthMemo, healthUntil = 0;
async function health() {
  if (MOCK) return { ok: true, codex: 'not-logged-in', mock: true, cache_entries: Object.keys(cache).length };
  if (Date.now() >= healthUntil) {
    try { const r = await run(codexBin(), ['login', 'status'], '', 10000); healthMemo = /Logged in/.test(r.output) ? 'logged-in' : 'not-logged-in'; }
    catch (e) { healthMemo = e.code === 'ENOENT' ? 'missing' : 'not-logged-in'; }
    healthUntil = Date.now() + 60000;
  }
  return { ok: true, codex: healthMemo, mock: false, cache_entries: Object.keys(cache).length };
}
let running = 0;
const marketingGoals = ['認識創作者', '新品上市', '送禮推薦', '到店參觀'];
function normalizeMarketing(value = {}) {
  if (!object(value) || Object.keys(value).some(k => !['goal', 'audience', 'occasion', 'budget'].includes(k))) fail('行銷設定格式不正確。');
  const result = {};
  for (const [field, limit] of Object.entries({ goal: 20, audience: 200, occasion: 200, budget: 100 })) {
    const text = value[field] ?? '';
    if (typeof text !== 'string' || [...text].length > limit) fail('行銷設定欄位格式或長度不正確。');
    result[field] = text.trim();
  }
  result.goal ||= '認識創作者';
  if (!marketingGoals.includes(result.goal)) fail('請選擇有效的行銷目標。');
  return result;
}
async function ai(stage, input) {
  if (typeof input.material !== 'string' || !input.material.trim() || !object(input.brand)) fail('請提供素材與品牌資料。');
  if (stage !== 'keywords' && !validate(schemas.keywords, input.keywords)) fail('請先完成關鍵字。');
  if (stage === 'draft' && !validate(schemas.outline, input.outline)) fail('請先完成文章架構。');
  input = { ...input, marketing: normalizeMarketing(input.marketing) };
  const id = key(stage, input);
  if (!input.force && cache[id]?.mock === MOCK) return { ...cache[id], cached: true };
  if (running >= 3) fail('目前有三個階段進行中，請稍後再試。', 429);
  running++;
  const started = Date.now();
  let dir;
  try {
    let data;
    if (MOCK) data = JSON.parse(await fs.readFile(path.join(ROOT, 'samples/mock.json'), 'utf8'))[stage];
    else {
      const template = await fs.readFile(path.join(ROOT, `prompts/${stage}.md`), 'utf8');
      const values = { ...input, material: [...input.material].slice(0, 6000).join('') };
      const prompt = template.replace(/\{\{(material|brand|keywords|outline|marketing)\}\}/g, (_, k) => typeof values[k] === 'string' ? values[k] : JSON.stringify(values[k] ?? {}));
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-ai-'));
      const output = path.join(dir, 'result.json');
      const r = await run(codexBin(), ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-c', 'model_reasoning_effort="low"', '-C', dir, '--output-schema', path.join(ROOT, `schemas/${stage}.json`), '-o', output, '-'], prompt);
      if (r.code !== 0) fail('AI 生成未完成，請確認 Codex 登入後再試。', 502);
      try { data = JSON.parse(await fs.readFile(output, 'utf8')); } catch { fail('AI 回傳格式無法讀取，請重新生成。', 502); }
    }
    if (!validate(schemas[stage], data)) fail('AI 回傳格式不完整，請重新生成。', 502);
    const result = { ok: true, cached: false, mock: MOCK, generated_at: new Date().toISOString(), elapsed_ms: Date.now() - started, data };
    cache[id] = result;
    await saveCache();
    return result;
  } finally { running--; if (dir) await fs.rm(dir, { recursive: true, force: true }); }
}
function clean(text) {
  const lines = text.replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n');
  const out = [];
  for (const line of lines) { const s = line.trim(); if (out.at(-1) !== s) out.push(s); }
  return out.join('\n').trim();
}
async function material(req, bytes) {
  let text, source = 'text';
  if (req.headers['x-filename']) {
    let filename;
    try { filename = decodeURIComponent(req.headers['x-filename']); } catch { fail('檔名無法讀取。'); }
    const ext = path.extname(filename).toLowerCase();
    if (!['.docx', '.txt', '.md'].includes(ext)) fail('請上傳 docx、txt 或 md 檔。', 415);
    if (ext === '.docx') {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-docx-'));
      try {
        const file = path.join(dir, 'input.docx'); await fs.writeFile(file, bytes);
        const r = await run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', file], '', 30000);
        if (r.code !== 0) fail('這份文件無法轉成文字。', 422);
        text = r.stdout; source = 'docx';
      } finally { await fs.rm(dir, { recursive: true, force: true }); }
    } else text = bytes.toString('utf8');
  } else { const input = parse(bytes); if (typeof input.text !== 'string') fail('請提供素材文字。'); text = input.text; }
  text = clean(text);
  const links = [...new Set((text.match(/https?:\/\/[^\s<>"'，。；、）】]+/g) || []))];
  return { ok: true, text, chars: [...text].length, links, source };
}
const decode = s => s.replace(/&(?:amp|lt|gt|quot|apos|ndash|mdash|nbsp|hellip|#39|#\d+|#x[\da-f]+);/gi, v => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&ndash;': '–', '&mdash;': '—', '&nbsp;': ' ', '&hellip;': '…' };
  if (named[v.toLowerCase()]) return named[v.toLowerCase()];
  const n = v[2].toLowerCase() === 'x' ? parseInt(v.slice(3), 16) : parseInt(v.slice(2), 10);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
const strip = s => decode(s.replace(/<[^>]*>/g, '')).trim();
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])]));
}
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentHelper/1.0)' } });
  if (!response.ok) throw new Error('fetch');
  return response.text();
}
const locations = xml => [...xml.matchAll(/<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi)].map(m => decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()));
async function brand(input) {
  let url;
  try { url = new URL(input.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { fail('請填寫完整的網站網址。'); }
  const id = key('brand', input);
  if (!input.force && cache[id]) return { ...cache[id], cached: true };
  let html;
  try { html = await fetchText(url); } catch { fail('目前讀不到品牌網站，請稍後再試。', 502); }
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
  const title = strip(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ');
  const name = meta.find(m => m.property?.toLowerCase() === 'og:site_name')?.content || title.split(/[｜|–-]/)[0].trim();
  const counts = { products: null, collections: null, articles: null };
  try {
    const sitemap = await fetchText(new URL('/sitemap.xml', url));
    const locs = locations(sitemap);
    await Promise.all([['products', 'sitemap_products'], ['collections', 'sitemap_collections'], ['articles', 'sitemap_blogs']].map(async ([type, pattern]) => {
      const matched = locs.filter(u => u.includes(pattern));
      if (!matched.length) return;
      // 多語系網站每個語言各有一份子表（例如 /en/sitemap_products_1.xml），只算主語言那份，不然數量會加倍。
      const root = matched.filter(u => { try { return new URL(u, url).pathname.startsWith('/sitemap_'); } catch { return false; } });
      const urls = root.length ? root : matched.slice(0, 1);
      try {
        const all = (await Promise.all(urls.map(u => fetchText(new URL(u, url)).then(locations)))).flat();
        counts[type] = new Set(all.filter(u => type !== 'articles' || /^\/blogs\/[^/]+\/[^/]+(?:\/.*)?$/.test(new URL(u, url).pathname))).size;
      } catch { counts[type] = null; }
    }));
  } catch {}
  const collections = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrs(m[1]).href; if (!href) continue;
    let path; try { path = new URL(href, url).pathname; } catch { continue; }
    if (!/\/collections\/[^/]+\/?$/.test(path) || /\/collections\/(all|frontpage)\/?$/.test(path)) continue;
    const label = strip(m[2]).replace(/\s+/g, ' ');
    if (!label || label.length > 30 || /^(shop|all|view all|繼續購物|全部商品)$/i.test(label) || collections.includes(label)) continue;
    collections.push(label);
    if (collections.length === 12) break;
  }
  const result = { ok: true, cached: false, data: { url: url.href, name, title, description: meta.find(m => m.name?.toLowerCase() === 'description')?.content || '', lang: attrs(html.match(/<html\b[^>]*>/i)?.[0] || '').lang || '', platform: /cdn\.shopify\.com|Shopify\./i.test(html) ? 'Shopify' : /wp-content/i.test(html) ? 'WordPress' : '未知', counts, collections } };
  cache[id] = result; await saveCache(); return result;
}
const escapeHTML = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function nextTuesday() {
  const now = new Date(Date.now() + 8 * 3600000);
  const days = (2 - now.getUTCDay() + 7) % 7 || 7;
  now.setUTCDate(now.getUTCDate() + days);
  return `${now.toISOString().slice(0, 10)}T10:00:00+08:00`;
}
function publish(input) {
  const { draft: d, brand: b, keywords: k } = input;
  if (!validate(schemas.draft, d) || !object(b) || !object(k)) fail('請提供完整文案、品牌與關鍵字。');
  const full = [d.title, d.answer, ...d.sections.flatMap(s => [s.h2, s.body]), ...d.faq.flatMap(f => [f.q, f.a]), d.cta, d.seo_title, d.meta_description, d.handle, ...d.tags].join('\n');
  const todo_count = (full.match(/【待訪談補充/g) || []).length;
  const length = s => [...s].length;
  const between = (s, min, max) => length(s) >= min && length(s) <= max;
  const check = (id, label, yes, detail, bad = 'warn') => ({ id, label, status: yes ? 'pass' : bad, detail });
  const checks = [
    check('answer_first', '開頭直接回答', between(d.answer, 40, 130), `開頭共 ${length(d.answer)} 字。`),
    check('keyword_in_title', '標題有主關鍵字或主角名', [k.primary, k.subject].some(s => typeof s === 'string' && s.length && d.title.includes(s)), '標題需含主關鍵字或主角名。'),
    check('has_faq', '有常見問答', d.faq.length >= 3, `目前有 ${d.faq.length} 題。`, 'fail'),
    check('seo_title_len', '搜尋標題長度', between(d.seo_title, 10, 32), `搜尋標題共 ${length(d.seo_title)} 字。`),
    check('meta_len', '搜尋描述長度', between(d.meta_description, 50, 90), `搜尋描述共 ${length(d.meta_description)} 字。`),
    check('brand_mentioned', '有提到品牌', typeof b.name === 'string' && b.name.length > 0 && full.toLowerCase().includes(b.name.toLowerCase()), '全文需提到品牌名稱。'),
    check('handle_format', '網址代稱格式', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.handle), '請使用小寫英數與連字號。', 'fail'),
    check('no_placeholder', '沒有待補的地方', todo_count === 0, todo_count ? `還有 ${todo_count} 處要等訪談補充` : '文案沒有待補標記。'),
  ];
  const p = text => `<p>${escapeHTML(text)}</p>`;
  const html = [p(d.answer), ...d.sections.flatMap(s => [`<h2>${escapeHTML(s.h2)}</h2>`, ...s.body.split(/\n\s*\n/).map(p)]), '<h2>常見問答</h2>', ...d.faq.flatMap(f => [`<h3>${escapeHTML(f.q)}</h3>`, p(f.a)]), p(d.cta)].join('\n');
  const markdown = [`# ${d.title}`, d.answer, ...d.sections.flatMap(s => [`## ${s.h2}`, s.body]), '## 常見問答', ...d.faq.flatMap(f => [`### ${f.q}`, f.a]), d.cta].join('\n\n');
  const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: d.title, description: d.meta_description, articleBody: [d.answer, ...d.sections.map(s => `${s.h2}\n${s.body}`), d.cta].join('\n\n'), keywords: d.tags }, { '@type': 'FAQPage', mainEntity: d.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] }, null, 2).replace(/</g, '\\u003c');
  return { ok: true, data: { suggested_date: nextTuesday(), html, markdown, jsonld, todo_count, checks } };
}
function parse(bytes) { try { const v = JSON.parse(bytes.toString('utf8')); if (!object(v)) throw new Error(); return v; } catch { fail('請傳送正確的 JSON 資料。'); } }
async function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, exceeded = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) { if (!exceeded) { exceeded = true; chunks.length = 0; reject(Object.assign(new Error('檔案超過 25 MB，請縮小後再試。'), { status: 413 })); } return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
    req.on('aborted', () => reject(Object.assign(new Error('上傳已中斷，請重試。'), { status: 400 })));
  });
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let result;
      if (req.method === 'GET' && url.pathname === '/api/health') result = await health();
      else if (req.method === 'GET' && url.pathname === '/api/sample') {
        let names = []; try { names = (await fs.readdir(path.join(ROOT, 'materials'), { withFileTypes: true })).filter(f => f.isFile() && /\.txt$/i.test(f.name)).map(f => f.name).sort(); } catch {}
        const name = names[0] || 'sample-creator.txt';
        result = { ok: true, name, text: await fs.readFile(path.join(ROOT, names.length ? 'materials' : 'samples', name), 'utf8'), private: names.length > 0 };
      } else if (req.method === 'POST') {
        const bytes = await body(req);
        if (url.pathname === '/api/material') result = await material(req, bytes);
        else {
          const input = parse(bytes);
          if (url.pathname === '/api/brand') result = await brand(input);
          else if (url.pathname === '/api/stage/publish') result = publish(input);
          else if (url.pathname.startsWith('/api/stage/') && stages.includes(url.pathname.slice('/api/stage/'.length))) result = await ai(url.pathname.slice('/api/stage/'.length), input);
          else fail('找不到這個功能。', 404);
        }
      } else fail('這個功能不支援此操作。', 405);
      json(res, 200, result); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) fail('不支援此操作。', 405);
    let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { fail('網址格式無法讀取。'); }
    const publicDir = path.join(ROOT, 'public');
    const file = path.resolve(publicDir, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(publicDir + path.sep)) fail('找不到這個檔案。', 404);
    let real; try { real = await fs.realpath(file); } catch { fail('找不到這個檔案。', 404); }
    if (!real.startsWith(publicDir + path.sep)) fail('找不到這個檔案。', 404);
    let bytes; try { bytes = await fs.readFile(real); } catch { fail('找不到這個檔案。', 404); }
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) { if (!res.headersSent && !res.destroyed) json(res, e.status || 500, { ok: false, error: e.status ? e.message : '這次處理未完成，請再試一次。' }); }
});
server.on('error', () => { console.error('伺服器無法啟動，請確認連接埠與執行權限。'); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 8990), '127.0.0.1', () => console.log(`內容管家：http://127.0.0.1:${server.address().port}`));
