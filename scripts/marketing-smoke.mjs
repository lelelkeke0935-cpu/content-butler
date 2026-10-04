import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'marketing-smoke-'));
let child, logs = '', passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; };
try {
  for (const name of ['server.mjs', 'prompts', 'schemas', 'samples']) await fs.cp(path.join(root, name), path.join(temp, name), { recursive: true });
  const capture = path.join(temp, 'captured.jsonl');
  const stub = path.join(temp, 'codex-stub.mjs');
  await fs.writeFile(stub, `#!${process.execPath}\nimport fs from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const schema = args[args.indexOf('--output-schema') + 1];
const stage = path.basename(schema, '.json');
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
await fs.appendFile(${JSON.stringify(capture)}, JSON.stringify({ stage, prompt }) + '\\n');
const data = JSON.parse(await fs.readFile(${JSON.stringify(path.join(temp, 'samples/mock.json'))}, 'utf8'));
await fs.writeFile(args[args.indexOf('-o') + 1], JSON.stringify(data[stage]));
`, { mode: 0o755 });
  child = spawn(process.execPath, [path.join(temp, 'server.mjs')], { cwd: temp, env: { ...process.env, PORT: '0', MOCK_AI: '0', CODEX_BIN: stub }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  child.on('error', e => { logs += e.message; });
  for (let i = 0; i < 100 && !logs.includes('內容管家：http'); i++) {
    if (child.exitCode !== null) throw new Error(logs);
    await delay(50);
  }
  const base = logs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(base, logs);
  async function request(stage, payload) {
    const response = await fetch(base + '/api/stage/' + stage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    return { status: response.status, data: await response.json() };
  }
  const common = { material: await fs.readFile(path.join(temp, 'samples/sample-creator.txt'), 'utf8'), brand: { name: '測試選物' } };
  const marketing = { goal: '送禮推薦', audience: '喜歡插畫的朋友', occasion: '生日', budget: '每份 NT$500–1,000' };
  const data = {}, inputs = {};
  for (const stage of ['keywords', 'interview', 'outline', 'draft']) {
    const input = { ...common, marketing, ...(stage === 'keywords' ? {} : { keywords: data.keywords }), ...(stage === 'draft' ? { outline: data.outline } : {}) };
    inputs[stage] = input;
    const r = await request(stage, input);
    check(r.status === 200 && !r.data.cached && !r.data.mock, stage + ' runs through Codex adapter');
    data[stage] = r.data.data;
    const saved = await request(stage, input);
    check(saved.data.cached && saved.data.generated_at === r.data.generated_at, stage + ' same settings use cache');
    const changed = await request(stage, { ...input, marketing: { ...marketing, goal: '到店參觀' } });
    check(changed.status === 200 && !changed.data.cached, stage + ' different goal misses cache');
  }
  let captures = (await fs.readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  check(captures.length === 8, 'cached requests do not invoke Codex');
  for (const { stage, prompt } of captures) {
    const m = JSON.parse(prompt.match(/<行銷設定>\s*([\s\S]*?)\s*<\/行銷設定>/)[1]);
    check(m.audience === marketing.audience && m.occasion === marketing.occasion && m.budget === marketing.budget && ['送禮推薦', '到店參觀'].includes(m.goal), stage + ' receives complete settings');
    check(!prompt.includes('{{marketing}}') && prompt.includes('不能宣稱商品符合預算') && prompt.includes('不因品牌有網站就推定有實體店'), stage + ' factual boundaries');
  }
  for (const goal of ['認識創作者', '新品上市']) {
    const r = await request('keywords', { ...common, marketing: { ...marketing, goal } });
    check(r.status === 200 && !r.data.cached, 'accept goal ' + goal);
  }
  for (const field of ['audience', 'occasion', 'budget']) {
    const r = await request('keywords', { ...inputs.keywords, marketing: { ...marketing, [field]: '不同條件' } });
    check(r.status === 200 && !r.data.cached, field + ' changes cache identity');
  }
  const trimmed = await request('keywords', { ...inputs.keywords, marketing: { ...marketing, audience: ` ${marketing.audience} ` } });
  check(trimmed.data.cached, 'trimmed settings share cache');
  const oldClient = await request('keywords', common);
  check(oldClient.status === 200, 'older clients without marketing still work');
  const defaults = await request('keywords', { ...common, marketing: { goal: '認識創作者', audience: '', occasion: '', budget: '' } });
  check(defaults.data.cached, 'empty optional fields use canonical default');
  captures = (await fs.readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  const last = JSON.parse(captures.at(-1).prompt.match(/<行銷設定>\s*([\s\S]*?)\s*<\/行銷設定>/)[1]);
  check(last.goal === '認識創作者' && last.audience === '' && last.occasion === '' && last.budget === '', 'no invented defaults for optional fields');
  const before = captures.length;
  for (const invalid of [null, [], '送禮推薦', { goal: 'unknown' }, { audience: 123 }, { occasion: {} }, { budget: false }, { audience: '字'.repeat(201) }, { occasion: '字'.repeat(201) }, { budget: '字'.repeat(101) }, { extra: 'ignored?' }]) {
    const r = await request('keywords', { ...common, marketing: invalid });
    check(r.status === 400 && !r.data.ok, 'invalid settings rejected');
  }
  captures = (await fs.readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  check(captures.length === before, 'invalid input never invokes Codex');
  console.log(`PASS：${passed} 項行銷設定檢查（替身 Codex，未呼叫真正 AI）。`);
} catch (e) { console.error(e); process.exitCode = 1; }
finally {
  if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  await fs.rm(temp, { recursive: true, force: true });
}
