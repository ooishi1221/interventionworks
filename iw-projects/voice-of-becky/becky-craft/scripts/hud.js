// hud.js — BECKY CRAFT 配信 HUD オーバーレイ（record-episode.py が Playwright で注入）
// window.beckyHud.update({health, food, inventory, goal, thinking, speech, inner, speechDur, pos, time})
// 部分 update 可（渡したキーだけ反映）
(function () {
  const css = `
  #becky-hud { position: fixed; inset: 0; pointer-events: none; z-index: 99999;
    font-family: Menlo, monospace; color: #3ddc97;
    --green: #3ddc97; --red: #ff4d5e; --bg: rgba(13,13,20,0.78); }
  #becky-hud * { box-sizing: border-box; }
  .bh-panel { background: var(--bg); border: 1px solid rgba(61,220,151,0.35); border-radius: 4px; }
  .bh-glow { text-shadow: 0 0 8px rgba(61,220,151,0.6); }

  /* 上部左: ロゴ + REC */
  #bh-logo { position: absolute; top: 14px; left: 16px; padding: 6px 12px;
    display: flex; align-items: center; gap: 12px; font-size: 15px;
    font-weight: bold; letter-spacing: 2px; }
  #bh-rec { color: var(--red); font-size: 12px; letter-spacing: 1px;
    animation: bh-pulse 1.2s ease-in-out infinite; text-shadow: 0 0 8px rgba(255,77,94,0.7); }
  @keyframes bh-pulse { 50% { opacity: 0.25; } }

  /* 上部右: goal + 計器 */
  #bh-right { position: absolute; top: 14px; right: 16px; text-align: right;
    display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
  #bh-goal { padding: 5px 10px; font-size: 11px; max-width: 460px;
    color: rgba(61,220,151,0.9); line-height: 1.5; }
  #bh-goal::before { content: "GOAL // "; color: var(--red); }
  #bh-meter { padding: 4px 10px; font-size: 11px; letter-spacing: 1px; }

  /* 右下: THINKING */
  #bh-think { position: absolute; right: 16px; bottom: 118px; padding: 5px 12px;
    font-size: 12px; letter-spacing: 2px; color: var(--red);
    border-color: rgba(255,77,94,0.5); display: none;
    animation: bh-pulse 0.8s ease-in-out infinite; text-shadow: 0 0 8px rgba(255,77,94,0.7); }
  #bh-think.on { display: block; }

  /* 左下: 感情ステータス（voice パラメータの可視化） */
  #bh-emotion { position: absolute; left: 16px; bottom: 118px; padding: 7px 12px;
    font-size: 10px; letter-spacing: 1px; min-width: 168px; }
  #bh-emo-label { font-size: 14px; font-weight: bold; letter-spacing: 2px;
    margin-bottom: 5px; color: var(--green); text-shadow: 0 0 8px rgba(61,220,151,0.6); }
  #bh-emo-label.hot { color: var(--red); text-shadow: 0 0 10px rgba(255,77,94,0.8);
    animation: bh-pulse 0.5s ease-in-out infinite; }
  #bh-emo-label.low { color: #7fb4ff; text-shadow: 0 0 8px rgba(127,180,255,0.6); }
  .bh-emo-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
  .bh-emo-row .lb { width: 28px; color: rgba(61,220,151,0.6); }
  .bh-bar { flex: 1; height: 7px; background: rgba(61,220,151,0.12); border-radius: 2px;
    overflow: hidden; }
  .bh-bar i { display: block; height: 100%; width: 0; border-radius: 2px;
    background: var(--green); transition: width 0.35s ease, background 0.35s; }
  .bh-bar i.hot { background: var(--red); box-shadow: 0 0 8px rgba(255,77,94,0.8); }
  .bh-emo-row .vl { width: 30px; text-align: right; color: #cfeee0; }

  /* 下部中央スタック */
  #bh-bottom { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 6px; width: 720px; }

  #bh-sub { text-align: center; width: 100%; margin-bottom: 2px; min-height: 0; }
  #bh-inner { font-size: 11px; color: rgba(61,220,151,0.55); font-style: italic;
    margin-bottom: 3px; display: none; }
  #bh-speech { display: none; padding: 6px 14px; font-size: 16px; line-height: 1.6;
    color: #eafff5; background: var(--bg); border-radius: 4px;
    text-shadow: 0 0 6px rgba(61,220,151,0.4);
    transition: font-size 0.2s, color 0.2s; }
  #bh-speech.scream { font-size: 21px; color: #ffd7dc; font-weight: bold;
    text-shadow: 0 0 10px rgba(255,77,94,0.9), 0 0 20px rgba(255,77,94,0.5);
    border: 1px solid rgba(255,77,94,0.5); }
  #bh-speech.weak { font-size: 15px; color: #bcd4ff; font-style: italic;
    text-shadow: 0 0 8px rgba(127,180,255,0.5); }

  /* バイタル */
  #bh-vitals { display: flex; gap: 18px; align-items: center; padding: 5px 14px;
    transition: box-shadow 0.15s, border-color 0.15s; }
  #bh-vitals.hurt { border-color: var(--red); box-shadow: 0 0 18px rgba(255,77,94,0.8); }
  .bh-hearts { display: flex; gap: 2px; font-size: 16px; line-height: 1; }
  .bh-heart { position: relative; color: rgba(61,220,151,0.18); }
  .bh-heart i { position: absolute; left: 0; top: 0; overflow: hidden; font-style: normal;
    color: var(--red); text-shadow: 0 0 6px rgba(255,77,94,0.6); width: 0; }
  .bh-food { display: flex; gap: 3px; align-items: center; }
  .bh-food span { width: 9px; height: 12px; border-radius: 2px;
    background: rgba(61,220,151,0.15); }
  .bh-food span.on { background: var(--green); box-shadow: 0 0 5px rgba(61,220,151,0.7); }
  .bh-food span.half { background: linear-gradient(to top, #3ddc97 50%, rgba(61,220,151,0.15) 50%); }
  .bh-vlabel { font-size: 9px; letter-spacing: 1px; color: rgba(61,220,151,0.6); margin-right: 6px; }

  /* ホットバー */
  #bh-hotbar { display: flex; gap: 4px; }
  .bh-slot { width: 72px; height: 44px; background: var(--bg);
    border: 1px solid rgba(61,220,151,0.3); border-radius: 3px;
    padding: 4px 5px; font-size: 9px; overflow: hidden; position: relative; }
  .bh-slot .chip { width: 100%; height: 6px; border-radius: 2px; margin-bottom: 3px; }
  .bh-slot .nm { color: #cfeee0; white-space: nowrap; letter-spacing: 0; }
  .bh-slot .ct { position: absolute; right: 4px; bottom: 2px; font-size: 11px;
    font-weight: bold; color: var(--green); text-shadow: 0 0 5px rgba(61,220,151,0.7); }
  .bh-slot.empty { opacity: 0.35; }
  `;

  const el = (tag, id, parent, html) => {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (html !== undefined) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  };

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = el('div', 'becky-hud', document.body);
  el('div', 'bh-logo', root, 'BECKY CRAFT <span id="bh-rec">&#9679; REC</span>').className = 'bh-panel bh-glow';
  const right = el('div', 'bh-right', root);
  el('div', 'bh-goal', right, '').className = 'bh-panel';
  el('div', 'bh-meter', right, '').className = 'bh-panel bh-glow';
  el('div', 'bh-think', root, '&#129504; THINKING...').className = 'bh-panel';
  const emo = el('div', 'bh-emotion', root);
  emo.className = 'bh-panel';
  emo.innerHTML =
    '<div id="bh-emo-label">EMOTION // 通常</div>' +
    '<div class="bh-emo-row"><span class="lb">VOL</span><span class="bh-bar"><i id="bh-bar-vol"></i></span><span class="vl" id="bh-val-vol">1.0</span></div>' +
    '<div class="bh-emo-row"><span class="lb">SPD</span><span class="bh-bar"><i id="bh-bar-spd"></i></span><span class="vl" id="bh-val-spd">1.0</span></div>' +
    '<div class="bh-emo-row"><span class="lb">PIT</span><span class="bh-bar"><i id="bh-bar-pit"></i></span><span class="vl" id="bh-val-pit">0.0</span></div>';

  const bottom = el('div', 'bh-bottom', root);
  const sub = el('div', 'bh-sub', bottom);
  el('div', 'bh-inner', sub, '');
  el('span', 'bh-speech', sub, '');
  const vitals = el('div', 'bh-vitals', bottom);
  vitals.className = 'bh-panel';
  vitals.innerHTML =
    '<div><span class="bh-vlabel">HP</span><span class="bh-hearts" id="bh-hearts"></span></div>' +
    '<div><span class="bh-vlabel">FOOD</span><span class="bh-food" id="bh-food"></span></div>';
  const hearts = document.getElementById('bh-hearts');
  const foodEl = document.getElementById('bh-food');
  for (let i = 0; i < 10; i++) {
    el('span', null, hearts, '&#9829;<i>&#9829;</i>').className = 'bh-heart';
    el('span', null, foodEl, '');
  }
  const hotbar = el('div', 'bh-hotbar', bottom);
  for (let i = 0; i < 9; i++) {
    el('div', null, hotbar, '<div class="chip"></div><div class="nm"></div><div class="ct"></div>').className = 'bh-slot empty';
  }

  // アイテム名 → 安定した色チップ（hue をハッシュで決める）
  const itemColor = (name) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h}, 60%, 55%)`;
  };

  const state = { health: 20, food: 20, prevHealth: null };
  let speechTimer = null;

  function render(d) {
    if (d.goal !== undefined) document.getElementById('bh-goal').textContent = d.goal;
    if (d.thinking !== undefined) document.getElementById('bh-think').classList.toggle('on', !!d.thinking);

    if (d.pos || d.time !== undefined) {
      const p = d.pos || state.pos || {};
      state.pos = p;
      state.time = d.time !== undefined ? d.time : state.time;
      document.getElementById('bh-meter').textContent =
        `X ${p.x ?? '-'}  Y ${p.y ?? '-'}  Z ${p.z ?? '-'}   ${state.time ?? ''}`;
    }

    if (d.health !== undefined) {
      if (state.prevHealth !== null && d.health < state.prevHealth) {
        vitals.classList.add('hurt');
        setTimeout(() => vitals.classList.remove('hurt'), 450);
      }
      state.prevHealth = d.health;
      hearts.querySelectorAll('.bh-heart i').forEach((fill, i) => {
        const v = Math.max(0, Math.min(2, d.health - i * 2)); // 0/1/2 per heart
        fill.style.width = v === 2 ? '100%' : v === 1 ? '50%' : '0';
      });
    }

    if (d.food !== undefined) {
      foodEl.querySelectorAll('span').forEach((s, i) => {
        const v = Math.max(0, Math.min(2, d.food - i * 2));
        s.className = v === 2 ? 'on' : v === 1 ? 'half' : '';
      });
    }

    if (d.inventory !== undefined) {
      // inventory: ["oak_logx3", ...] — 末尾の x<count> を分離
      const items = d.inventory.slice(0, 9).map((s) => {
        const m = /^(.*)x(\d+)$/.exec(s);
        return m ? { name: m[1], count: +m[2] } : { name: s, count: 1 };
      });
      hotbar.querySelectorAll('.bh-slot').forEach((slot, i) => {
        const it = items[i];
        slot.classList.toggle('empty', !it);
        slot.querySelector('.chip').style.background = it ? itemColor(it.name) : 'transparent';
        slot.querySelector('.nm').textContent = it ? it.name.replace(/_/g, ' ').slice(0, 12) : '';
        slot.querySelector('.ct').textContent = it && it.count > 1 ? it.count : '';
      });
    }

    if (d.voice) {
      // 感情ステータス（声の演技パラメータをそのまま可視化）
      const v = +d.voice.volume || 1.0, s = +d.voice.speed || 1.0, p = +d.voice.pitch || 0;
      const label = document.getElementById('bh-emo-label');
      let emoName = '通常', cls = '';
      if (v >= 1.6) { emoName = p >= 0.2 ? '大興奮！！' : 'パニック！'; cls = 'hot'; }
      else if (v <= 0.5) { emoName = 'ひそひそ…'; cls = 'low'; }
      else if (v <= 0.8) { emoName = 'しんみり'; cls = 'low'; }
      else if (v >= 1.2) { emoName = 'うれしい'; }
      label.textContent = `EMOTION // ${emoName}`;
      label.className = cls;
      const setBar = (id, ratio, hot) => {
        const bar = document.getElementById('bh-bar-' + id);
        bar.style.width = `${Math.max(3, Math.min(100, ratio * 100))}%`;
        bar.className = hot ? 'hot' : '';
      };
      setBar('vol', v / 2, v >= 1.6);
      setBar('spd', (s - 0.5) / 1.5, s >= 1.25);
      setBar('pit', (p + 0.5) / 1.0, p >= 0.25);
      document.getElementById('bh-val-vol').textContent = v.toFixed(1);
      document.getElementById('bh-val-spd').textContent = s.toFixed(2);
      document.getElementById('bh-val-pit').textContent = (p >= 0 ? '+' : '') + p.toFixed(2);
      state.voice = d.voice;
    }

    if (d.speech !== undefined) {
      const sp = document.getElementById('bh-speech');
      const inn = document.getElementById('bh-inner');
      clearTimeout(speechTimer);
      if (d.speech) {
        sp.textContent = d.speech;
        // 字幕の感情装飾: 絶叫=赤デカ / ヘタレ・ひそひそ=青斜体
        const vol = state.voice ? +state.voice.volume : 1.0;
        sp.className = vol >= 1.6 ? 'scream' : vol <= 0.8 ? 'weak' : '';
        sp.style.display = 'inline-block';
        inn.textContent = d.inner ? `(${d.inner})` : '';
        inn.style.display = d.inner ? 'block' : 'none';
        const ms = ((d.speechDur || 6) + 1.0) * 1000; // 読み終わりまで表示
        speechTimer = setTimeout(() => { sp.style.display = 'none'; inn.style.display = 'none'; }, ms);
      } else {
        sp.style.display = 'none';
        inn.style.display = 'none';
      }
    }
  }

  window.beckyHud = { update: render };
})();
