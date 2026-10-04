// 錄影機：開一個無頭 Chrome，載入真的 app，注入 director.js 自動操作，邊操作邊收畫面。
// 用法：node video/record.mjs   → 產生 video/rec/ 的畫格、rec.json（時間點）
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444;
const APP = process.env.APP_URL || 'http://127.0.0.1:8990/';
const OUT = path.join(HERE, 'rec');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/hackday-rec-${Date.now()}`,
  '--no-first-run', '--hide-scrollbars', '--window-size=1440,810', 'about:blank'], { stdio: 'ignore' });
const bye = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', bye);

let target;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) await sleep(200);
}
if (!target) { console.error('連不上 Chrome'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

let id = 0;
const pending = new Map();
const frames = [];
const writes = [];
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = m.params;
    const n = frames.length;
    frames.push({ n, t: metadata.timestamp });
    writes.push(fs.writeFile(path.join(OUT, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64')));
    send('Page.screencastFrameAck', { sessionId });
  }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 4 / 3, mobile: false });
await send('Page.navigate', { url: APP });
await sleep(3500); // 等字型與品牌資料
await send('Runtime.evaluate', { expression: await fs.readFile(path.join(HERE, 'director.js'), 'utf8') });
await sleep(300);
await send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const started = Date.now();
const result = await send('Runtime.evaluate', { expression: 'runScenario()', awaitPromise: true, returnByValue: true });
await sleep(400);
await send('Page.stopScreencast');
await Promise.all(writes);
const value = result.result?.result?.value;
if (!value) console.error('腳本沒有正常結束：', JSON.stringify(result.result?.exceptionDetails || result).slice(0, 600));
await fs.writeFile(path.join(HERE, 'rec.json'), JSON.stringify({ frames, scenario: value, wall_ms: Date.now() - started }, null, 1));
console.log(`畫格 ${frames.length} 張，實際錄了 ${((Date.now() - started) / 1000).toFixed(1)} 秒，腳本回報 ${value ? (value.total / 1000).toFixed(1) : '?'} 秒`);
ws.close();
bye();
process.exit(0);
