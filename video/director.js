// 影片導演：只在錄影時由 record.mjs 注入頁面，不屬於 app 本身。
// 做三件事：畫一個假游標去按真的按鈕、移動鏡頭、在下方顯示步驟說明。
(() => {
  const style = document.createElement('style');
  style.textContent = `
    html { overflow: hidden !important; }
    body { transform-origin: 0 0; transition: transform .95s cubic-bezier(.45,0,.15,1); will-change: transform; }
    #v-root { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; font-family: "Noto Sans TC","PingFang TC",sans-serif; color: #23301f; }
    #v-cursor { position: absolute; left: 0; top: 0; width: 40px; height: 40px; transform: translate(1180px, 700px); transition: transform .6s cubic-bezier(.3,.1,.2,1); filter: drop-shadow(3px 4px 0 rgba(35,32,28,.3)); }
    #v-cursor.press svg { transform: scale(.82); }
    #v-cursor svg { transition: transform .12s ease; transform-origin: 4px 4px; }
    #v-ripple { position: absolute; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; border: 6px solid #749655; opacity: 0; }
    #v-ripple.go { animation: v-ripple .5s ease-out; }
    @keyframes v-ripple { 0% { opacity: .95; transform: scale(.15); } 100% { opacity: 0; transform: scale(1.25); } }
    #v-cap { position: absolute; left: 50%; bottom: 34px; transform: translate(-50%, 30px); opacity: 0; transition: transform .45s cubic-bezier(.2,.9,.2,1.2), opacity .3s ease; display: flex; align-items: center; gap: 16px; background: #23301f; color: #eeeddf; padding: 13px 34px 15px 16px; border-radius: 999px; box-shadow: 6px 6px 0 #749655; white-space: nowrap; }
    #v-cap.on { transform: translate(-50%, 0); opacity: 1; }
    #v-cap .n { background: #f2cf4b; color: #23301f; font-weight: 900; font-size: 22px; padding: 6px 16px; border-radius: 999px; font-family: "Space Grotesk","Noto Sans TC",sans-serif; }
    #v-cap .t { font-size: 31px; font-weight: 900; letter-spacing: .02em; }
    #v-note { position: absolute; right: 26px; top: 20px; background: #fffef8; border: 2px solid #23301f; padding: 6px 14px; font-size: 15px; font-weight: 700; border-radius: 6px; opacity: 0; transition: opacity .4s ease; }
    #v-note.on { opacity: 1; }
    #v-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; text-align: center; background-color: #eeeddf; background-image: radial-gradient(#e6d27c 1.6px, transparent 1.8px); background-size: 22px 22px; opacity: 0; transition: opacity .55s ease; }
    #v-card.on { opacity: 1; }
    #v-card .k { font-size: 24px; font-weight: 900; background: #23301f; color: #eeeddf; padding: 8px 22px; border-radius: 999px; transform: translateY(18px); opacity: 0; transition: all .5s cubic-bezier(.2,.9,.2,1.2) .15s; }
    #v-card h1 { font-size: 86px; font-weight: 900; line-height: 1.15; letter-spacing: -.01em; margin: 0; transform: translateY(26px); opacity: 0; transition: all .6s cubic-bezier(.2,.9,.2,1.15) .3s; }
    #v-card h1 b { background: linear-gradient(transparent 60%, #f2cf4b 60%); }
    #v-card p { font-size: 30px; font-weight: 700; margin: 0; transform: translateY(20px); opacity: 0; transition: all .55s ease .55s; }
    #v-card small { font-size: 19px; font-weight: 500; opacity: 0; transition: opacity .5s ease .8s; font-family: "Space Grotesk","Noto Sans TC",sans-serif; }
    #v-card.on .k, #v-card.on h1, #v-card.on p { transform: none; opacity: 1; }
    #v-card.on small { opacity: .7; }
    #v-card .tiles { display: flex; gap: 34px; }
    #v-card .tile { width: 330px; padding: 26px 16px 22px; background: #fffef8; border: 4px solid #23301f; box-shadow: 9px 9px 0 #23301f; transform: translateY(40px) rotate(-2deg); opacity: 0; transition: all .5s cubic-bezier(.2,.9,.2,1.25); }
    #v-card .tile:nth-child(2) { transition-delay: .25s; transform: translateY(40px); }
    #v-card .tile:nth-child(3) { transition-delay: .6s; transform: translateY(40px) rotate(2deg); background: #C8663A; color: #fffef8; }
    #v-card.on .tile { opacity: 1; transform: rotate(-2deg); } #v-card.on .tile:nth-child(2) { transform: none; } #v-card.on .tile:nth-child(3) { transform: rotate(2deg) scale(1.08); }
    #v-card .tile .n { font-size: 120px; font-weight: 700; line-height: 1; font-family: "Space Grotesk","Noto Sans TC",sans-serif; }
    #v-card .tile .l { font-size: 30px; font-weight: 900; margin-top: 6px; }
    #v-card .chat { display: flex; flex-direction: column; gap: 22px; width: 980px; }
    #v-card .say { font-size: 38px; font-weight: 900; padding: 22px 34px; border: 4px solid #23301f; box-shadow: 8px 8px 0 #23301f; opacity: 0; transform: translateY(26px); transition: all .5s cubic-bezier(.2,.9,.2,1.2); text-align: left; }
    #v-card .say.me { align-self: flex-end; background: #f2cf4b; border-radius: 30px 30px 6px 30px; transition-delay: .2s; }
    #v-card .say.ai { align-self: flex-start; background: #fffef8; border-radius: 30px 30px 30px 6px; transition-delay: 1.5s; }
    #v-card .say small { display: block; font-size: 20px; font-weight: 700; opacity: .7 !important; margin-bottom: 4px; transition: none; }
    #v-card.on .say { opacity: 1; transform: none; }
    #v-card .chips { display: flex; gap: 14px; }
    #v-card .chip { font-size: 30px; font-weight: 900; padding: 12px 24px; border: 4px solid #23301f; border-radius: 999px; background: #fffef8; box-shadow: 5px 5px 0 #23301f; opacity: 0; transform: translateY(22px) scale(.8); transition: all .4s cubic-bezier(.2,.9,.2,1.4); }
    #v-card.on .chip { opacity: 1; transform: none; }
    #v-card .chip:nth-child(1) { transition-delay: .5s; background: #F6B0A2; } #v-card .chip:nth-child(2) { transition-delay: .8s; background: #F7D58D; } #v-card .chip:nth-child(3) { transition-delay: 1.1s; background: #9FDCD2; } #v-card .chip:nth-child(4) { transition-delay: 1.4s; background: #D6CAF3; } #v-card .chip:nth-child(5) { transition-delay: 1.7s; background: #23301f; color: #eeeddf; }
    .v-pulse { outline: 5px solid #749655 !important; outline-offset: 6px; border-radius: 6px; animation: v-pulse .9s ease-in-out 2; }
    @keyframes v-pulse { 50% { outline-offset: 13px; outline-color: #f2cf4b; } }
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'v-root';
  root.innerHTML = `
    <div id="v-note">示範使用已保存的生成結果；實際生成約 90 秒</div>
    <div id="v-cap"><span class="n"></span><span class="t"></span></div>
    <div id="v-ripple"></div>
    <div id="v-cursor"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M5 3 L5 31 L13 24 L18.5 36 L24 33.5 L18.5 22 L29 22 Z" fill="#23301f" stroke="#fffef8" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
    <div id="v-card"></div>`;
  document.documentElement.appendChild(root);

  const $ = (sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let base = performance.now();
  const events = [];
  const mark = (type) => events.push({ type, t: Math.round(performance.now() - base) });
  let cam = { s: 1, x: 0, y: 0 };
  const cursor = root.querySelector('#v-cursor');
  const ripple = root.querySelector('#v-ripple');
  const cap = root.querySelector('#v-cap');
  const card = root.querySelector('#v-card');
  let cur = { x: 1180, y: 700 };

  // 錄影時讓每個 AI 階段多等一下，才看得到一格一格亮起來（畫面有標示是已保存的結果）
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const res = await realFetch(input, init);
    if (/\/api\/stage\//.test(url)) await wait(/publish/.test(url) ? 350 : 600);
    return res;
  };
  try { navigator.clipboard.writeText = async () => {}; } catch {}

  const box = (el) => { const r = $(el).getBoundingClientRect(); return { x: (r.left - cam.x) / cam.s, y: (r.top - cam.y) / cam.s, w: r.width / cam.s, h: r.height / cam.s }; };
  async function focus(sel, s = 1.4, opt = {}) {
    const el = $(sel); if (!el) return;
    const b = box(el), vw = innerWidth, vh = innerHeight - 96;
    let x = vw / 2 - (b.x + b.w / 2) * s;
    let y = opt.top !== undefined ? opt.top - b.y * s : vh / 2 - (b.y + Math.min(b.h, vh / s) / 2) * s;
    const W = document.body.scrollWidth, H = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    x = Math.min(0, Math.max(vw - W * s, x));
    y = Math.min(0, Math.max(vh - H * s, y));
    cam = { s, x, y };
    document.body.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    await wait(opt.ms ?? 1000);
  }
  async function reset(ms = 950) { cam = { s: 1, x: 0, y: 0 }; document.body.style.transform = 'none'; await wait(ms); }
  async function point(sel, fx = 0.5, fy = 0.55) {
    const el = $(sel); if (!el) return;
    const r = el.getBoundingClientRect();
    cur = { x: r.left + r.width * fx, y: r.top + r.height * fy };
    cursor.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
    await wait(650);
  }
  async function click(sel, fx, fy) {
    const el = $(sel); if (!el) return;
    await point(el, fx, fy);
    cursor.classList.add('press');
    ripple.style.left = cur.x + 'px'; ripple.style.top = cur.y + 'px';
    ripple.classList.remove('go'); void ripple.offsetWidth; ripple.classList.add('go');
    mark('click');
    await wait(130);
    cursor.classList.remove('press');
    el.click();
    await wait(260);
  }
  async function caption(n, text) {
    cap.classList.remove('on');
    await wait(220);
    cap.querySelector('.n').textContent = n; cap.querySelector('.t').textContent = text;
    cap.classList.add('on'); mark('caption');
  }
  async function showCard(html, ms) { card.innerHTML = html; void card.offsetWidth; card.classList.add('on'); mark('card'); await wait(ms); }
  async function hideCard() { card.classList.remove('on'); await wait(600); }
  async function typeInto(sel, text, per = 42) {
    const el = $(sel); el.focus(); el.value = '';
    for (const ch of text) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(per); }
    mark('typed');
  }
  function pulse(sel) { const el = $(sel); if (!el) return; el.classList.add('v-pulse'); setTimeout(() => el.classList.remove('v-pulse'), 2000); }
  const stageDone = async (i, max = 15000) => { const end = Date.now() + max; while (Date.now() < end) { if ($(`#steps .step[data-step="${i}"]`)?.classList.contains('done')) return; await wait(100); } };

  async function swapCard(html, ms) { card.classList.remove('on'); await wait(300); card.innerHTML = html; void card.offsetWidth; card.classList.add('on'); mark('card'); await wait(ms); }
  window.runScenario = async () => {
    base = performance.now(); events.length = 0;
    const logo = (h) => `<img src="/logo.jpg" style="height:${h}px;background:#fff;border:4px solid #23301f;padding:10px 28px;box-shadow:10px 10px 0 #23301f;transform:rotate(-2deg)">`;

    // ── 開場 15 秒：我們是誰 → 現況 → 麻煩在哪 → 我們做了什麼 ──
    card.innerHTML = `<div class="k">隊伍：今天交稿</div>${logo(200)}<p>從素材到上架，幫你稿定。</p><small>DevDay Exchange Community Hack Day: Taipei</small>`;
    card.classList.add('on');
    await wait(2900);
    await swapCard(`<div class="k">CORNVEN・亞洲獨立創作者選物</div><div class="tiles"><div class="tile"><div class="n">125</div><div class="l">個商品</div></div><div class="tile"><div class="n">96</div><div class="l">個分類</div></div><div class="tile"><div class="n">0</div><div class="l">篇文章</div></div></div><p>商品很多，文章是零。</p>`, 3500);
    await swapCard(`<div class="chat"><div class="say me"><small>客人問 AI</small>有沒有推薦的日本療癒系插畫師？</div><div class="say ai"><small>沒有文章</small>AI 就沒有內容可以引用。</div></div>`, 3900);
    await swapCard(`<div class="k">所以我們做了</div>${logo(150)}<div class="chips"><span class="chip">① 關鍵字</span><span class="chip">② 訪綱</span><span class="chip">③ 架構</span><span class="chip">④ 文案</span><span class="chip">⑤ 上架包</span></div><p>一份素材，五步變成可以上架的文章</p>`, 3200);
    await hideCard();

    // ── 操作 45 秒 ──
    await caption('步驟 1', '放進一份創作者素材');
    await focus('.material', 1.2, { ms: 750, top: 20 });
    await click('#load-sample');
    await wait(450);
    if ($('.marketing-settings')) {
      await caption('步驟 2', '選這次的行銷目標與受眾');
      await focus('.marketing-settings', 1.3, { ms: 800 });
      pulse('.marketing-settings');
      await wait(1100);
    }
    if ($('#ref-urls')) {
      await caption('步驟 3', '加上參考網址，每個事實都標出處');
      await focus('#ref-urls', 1.4, { ms: 750 });
      await point('#ref-urls', 0.25);
      await typeInto('#ref-urls', 'https://www.cornven.com/pages/artists', 16);
      await wait(350);
    }
    await caption('步驟 4', '按「開始生產」，五個階段依序完成');
    await focus('#start', 1.2, { ms: 650 });
    await click('#start');
    root.querySelector('#v-note').classList.add('on');
    await focus('#steps', 1.3, { ms: 750 });
    await stageDone(4);
    await wait(500);
    root.querySelector('#v-note').classList.remove('on');

    await reset(600);
    await click('#steps .step[data-step="0"]', 0.3, 0.45);
    await caption('① 關鍵字', '找出客人會直接問 AI 的話');
    await focus('.bubbles', 1.36, { ms: 850, top: 40 });
    await wait(1700);

    await reset(600);
    await click('#steps .step[data-step="1"]', 0.3, 0.45);
    await caption('② 訪綱', '素材沒寫的，不亂編，變成訪談題目');
    await focus('.two-columns', 1.3, { ms: 850, top: 30 });
    pulse('.missing-note');
    await wait(1900);

    await reset(600);
    await click('#steps .step[data-step="2"]', 0.3, 0.45);
    await caption('③ 架構', '標題、小標、常見問答先排好');
    await focus('.outline-title', 1.3, { ms: 850, top: 60 });
    await wait(900);

    await reset(600);
    await click('#steps .step[data-step="3"]', 0.3, 0.45);
    await caption('④ 文案', '開頭直接回答，AI 最容易引用這一段');
    await focus('.answer-box', 1.38, { ms: 850 });
    pulse('.answer-box');
    await wait(1200);
    const threads = [...document.querySelectorAll('.draft-tabs button')].find((b) => b.textContent.includes('Threads'));
    if (threads) {
      await caption('④ 文案', '同一篇，再產出 Threads 與 IG 版本');
      await focus('.draft-tabs', 1.3, { ms: 750, top: 90 });
      await click(threads);
      for (let k = 0; k < 40 && !$('.social-post'); k++) await wait(150);
      await focus('.social-post', 1.25, { ms: 800, top: 60 });
      await wait(1500);
      const web = [...document.querySelectorAll('.draft-tabs button')].find((b) => b.textContent.includes('網站文章'));
      if (web) { web.click(); await wait(250); }
    }
    if ($('.article mark')) {
      await caption('④ 文案', '待補的資訊：自己填，或請 AI 上網查');
      await focus('.article mark', 1.4, { ms: 850 });
      await click('.article mark');
      await wait(300);
      if ($('.fill-panel')) await focus('.fill-panel', 1.3, { ms: 800 });
      await wait(1400);
    }

    await reset(600);
    await click('#steps .step[data-step="4"]', 0.3, 0.45);
    await caption('⑤ 上架包', '八項檢查，複製就能貼進 Shopify');
    await focus('.check-list', 1.34, { ms: 850, top: 40 });
    await wait(1300);
    await focus('.export-actions', 1.34, { ms: 800 });
    await click('[data-action="copy-html"]');
    await wait(700);

    cap.classList.remove('on');
    await showCard(`${logo(190)}<h1 style="font-size:70px">從素材到上架，<b>幫你稿定</b></h1><p>下一步：連上 Shopify，自動排程發佈</p><small>隊伍：今天交稿（Kyle・Zita・Ethan）｜github.com/lelelkeke0935-cpu/content-butler｜Built with Codex CLI</small>`, 2600);
    mark('end');
    return { events, total: Math.round(performance.now() - base) };
  };
})();
