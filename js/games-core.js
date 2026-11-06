/* ============================================================
   芒果游戏盒 MangoBox · 核心框架
   游戏注册表 / 大厅 / 游戏容器 / 管理员外挂系统 / 触控与音效
   依赖：store（data.js）、t（app.js i18n）
   ============================================================ */
'use strict';

/* ---------- 管理员（外挂）状态 ---------- */
const Admin = {
  unlocked: store.get('adminUnlocked', false),
  active: false,          // 本次会话管理员面板已激活
  invincible: false,      // 无敌模式
  timeScale: 1,           // 时间流速 0.25 ~ 3
  mult: 1,                // 分数倍率
  hint: false,            // 棋类提示最佳手
  PASSWORD: 'mango',      // 管理员密码（演示）
  login(pwd) {
    if (String(pwd || '') === this.PASSWORD) {
      this.unlocked = true; this.active = true;
      store.set('adminUnlocked', true);
      return true;
    }
    return false;
  },
  logout() { this.active = false; },
  save() {
    store.set('adminCfg', { invincible: this.invincible, timeScale: this.timeScale, mult: this.mult, hint: this.hint });
  },
  load() {
    const c = store.get('adminCfg', null);
    if (c) { this.invincible = !!c.invincible; this.timeScale = c.timeScale || 1; this.mult = c.mult || 1; this.hint = !!c.hint; }
  },
  isOn() { return this.active && this.unlocked; },
  /* 一键胜利：给当前游戏加分到高分 */
  instantWin(api) {
    if (api && typeof api.win === 'function') { api.win(); return true; }
    return false;
  },
};
Admin.load();

/* ---------- 音效（WebAudio 简易蜂鸣，无外部资源） ---------- */
const Sfx = {
  ctx: null,
  on: store.get('gameSound', true),
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  beep(freq = 440, dur = 0.07, type = 'square', vol = 0.04) {
    if (!this.on) return;
    const ctx = this.ensure(); if (!ctx) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { }
  },
  eat() { this.beep(660, 0.06, 'square', 0.05); },
  hit() { this.beep(300, 0.08, 'sawtooth', 0.06); },
  over() { this.beep(180, 0.35, 'triangle', 0.07); setTimeout(() => this.beep(120, 0.4, 'triangle', 0.07), 180); },
  win() { this.beep(523, 0.1); setTimeout(() => this.beep(659, 0.1), 100); setTimeout(() => this.beep(784, 0.16), 200); },
  click() { this.beep(880, 0.03, 'square', 0.03); },
};

/* ---------- 触控检测 ---------- */
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

/* ---------- 带占位符的翻译：tf('长度 {n}', { n: 5 }) ---------- */
function tf(key, params) {
  let s = t(key);
  if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
  return s;
}

/* ---------- 游戏注册表 ---------- */
const Games = {
  registry: {},
  order: [],
  register(def) {
    if (!def || !def.id || this.registry[def.id]) return;
    this.registry[def.id] = def;
    this.order.push(def.id);
  },
  get(id) { return this.registry[id]; },
  all() { return this.order.map(id => this.registry[id]); },
  bestKey(id) { return 'game_best_' + id; },
  best(id) { return store.get(this.bestKey(id), 0); },
  setBest(id, v) { store.set(this.bestKey(id), v); },
};

/* ---------- 虚拟按键（canvas 游戏触控用） ---------- */
function makePad(root, keys) {
  // keys: [{label, key, cls}] → 返回 DOM；key 为按键标识
  const wrap = document.createElement('div');
  wrap.className = 'g-pad';
  keys.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'g-pad-btn ' + (k.cls || '');
    b.textContent = k.label;
    const fire = (down) => { if (k.hold) { b.dataset.down = down ? '1' : '0'; if (down) k.fn && k.fn(); } else if (down) k.fn && k.fn(); };
    b.addEventListener('touchstart', (e) => { e.preventDefault(); fire(true); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); fire(false); }, { passive: false });
    b.addEventListener('mousedown', () => fire(true));
    b.addEventListener('mouseup', () => fire(false));
    b.addEventListener('mouseleave', () => fire(false));
    wrap.appendChild(b);
  });
  root.appendChild(wrap);
  return wrap;
}

/* ---------- 游戏容器（HUD + 画布挂载 + 遮罩） ---------- */
const GameRunner = {
  current: null,   // { def, api, raf, keys, paused, dead }
  start(id) {
    this.stop();
    const def = Games.get(id);
    if (!def) return;
    const app = $('#app');
    app.innerHTML = `
      <div class="g-wrap" id="gWrap">
        <div class="g-hud">
          <button class="g-hud-btn" id="gBack" aria-label="${t('返回')}">←</button>
          <div class="g-title"><span class="g-ico">${def.icon}</span><span>${t(def.name)}</span></div>
          <div class="g-stats" id="gStats"></div>
          <button class="g-hud-btn" id="gPause" aria-label="${t('暂停')}">⏸</button>
          <button class="g-hud-btn" id="gRestart" aria-label="${t('重开')}">↻</button>
          ${Admin.isOn() ? `<button class="g-hud-btn g-hud-admin" id="gCheat" aria-label="${t('外挂')}">⚡</button>` : ''}
        </div>
        <div class="g-stage" id="gStage"></div>
        <div class="g-overlay" id="gOverlay" hidden>
          <div class="g-overlay-card">
            <div class="g-over-emoji" id="gOverEmoji">🎮</div>
            <div class="g-over-title" id="gOverTitle">${t('游戏结束')}</div>
            <div class="g-over-sub" id="gOverSub"></div>
            <div class="g-over-btns">
              <button class="btn btn-ghost" id="gOverHome">${t('返回大厅')}</button>
              <button class="btn btn-mango" id="gOverAgain">${t('再来一局')}</button>
            </div>
          </div>
        </div>
        ${Admin.isOn() ? '<div class="g-admin-badge">ADMIN</div>' : ''}
      </div>`;
    $('#gBack').onclick = () => { Sfx.click(); pageGames(); };
    $('#gRestart').onclick = () => { Sfx.click(); this.start(id); };
    $('#gPause').onclick = () => this.togglePause();
    const cheatBtn = $('#gCheat');
    if (cheatBtn) cheatBtn.onclick = () => openCheatPanel();

    /* --- 给游戏的 API --- */
    let score = 0, best = Games.best(id), newBest = false;
    const refreshStats = () => {
      const s = $('#gScore'); if (s) s.textContent = Math.round(score);
      const b = $('#gBest');
      if (b) b.textContent = Math.max(best, Math.round(score));
      if (score > best && !runner.dead) { best = Math.round(score); Games.setBest(id, best); newBest = true; }
    };
    const api = {
      root: $('#gStage'),
      admin: Admin,
      isTouch,
      sfx: Sfx,
      /* 缩放后的 dt（毫秒），受时间流速影响 */
      dt(d) { return d * (Admin.isOn() ? Admin.timeScale : 1); },
      /* 分数倍率后的加分 */
      gain(n) { score += n * (Admin.isOn() ? Admin.mult : 1); refreshStats(); return score; },
      setScore(n) { score = Math.round(n * (Admin.isOn() ? Admin.mult : 1)); refreshStats(); },
      getScore() { return score; },
      /* 设置 HUD 附加信息（生命/时间/关卡等） */
      info(html) { const el = $('#gStatsInfo'); if (el) el.innerHTML = html; },
      setStatus(text) { const el = $('#gStatsStatus'); if (el) el.textContent = text; },
      over(win, subText) { GameRunner.gameOver(win, subText); },
      /* 一键胜利钩子 */
      win() { GameRunner.gameOver(true); },
      /* 键盘：注册后由容器统一收发 */
      onKey: null,
      /* 触屏滑动 */
      onSwipe: null,
      _bestSaved: false,
    };
    const runner = { def, api, raf: 0, last: 0, paused: false, dead: false };
    this.current = runner;

    /* HUD 统计区 */
    const stats = $('#gStats');
    stats.innerHTML = `<span class="g-stat">${t('分数')} <b id="gScore">0</b></span><span class="g-stat">${t('最高')} <b id="gBest">${best}</b></span><span id="gStatsInfo" class="g-stat"></span><span id="gStatsStatus" class="g-stat"></span>`;
    refreshStats();

    /* 主循环 */
    const loop = (ts) => {
      if (!this.current || this.current !== runner) return;
      if (runner.dead) return;
      if (!runner.paused) {
        const d = runner.last ? Math.min(50, ts - runner.last) : 16;
        runner.last = ts;
        try { if (api.tick) api.tick(d); } catch (e) { }
      } else runner.last = ts;
      runner.raf = requestAnimationFrame(loop);
    };
    runner.raf = requestAnimationFrame(loop);

    /* 键盘 */
    const kd = (e) => {
      if (!this.current || this.current !== runner || runner.dead) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (api.onKey) api.onKey(e, true);
    };
    const ku = (e) => { if (api.onKey) api.onKey(e, false); };
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    runner._kd = kd; runner._ku = ku;

    /* 触屏滑动（贪吃蛇等） */
    let tsx = 0, tsy = 0;
    const st = (e) => { const t0 = e.touches[0]; tsx = t0.clientX; tsy = t0.clientY; };
    const se = (e) => {
      if (!api.onSwipe) return;
      const t0 = e.changedTouches[0];
      const dx = t0.clientX - tsx, dy = t0.clientY - tsy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      api.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    const stage = $('#gStage');
    stage.addEventListener('touchstart', st, { passive: true });
    stage.addEventListener('touchend', se, { passive: true });

    /* 启动游戏 */
    try { def.mount(api); } catch (e) { console.error(e); }
    /* 移动端适配：带虚拟按键的游戏收窄画布高度预算，保证按键不被顶出屏幕 */
    const wrapEl = $('#gWrap');
    if (wrapEl && api.root.querySelector('.g-pad')) wrapEl.classList.add('has-pad');
    this._stage = stage;
  },

  togglePause() {
    const r = this.current; if (!r || r.dead) return;
    r.paused = !r.paused;
    const b = $('#gPause'); if (b) b.textContent = r.paused ? '▶' : '⏸';
    const ov = $('#gOverlay');
    if (r.paused) {
      ov.hidden = false;
      $('#gOverEmoji').textContent = '⏸';
      $('#gOverTitle').textContent = t('已暂停');
      $('#gOverSub').textContent = t('点击继续按钮恢复游戏');
      $('#gOverAgain').textContent = t('继续');
      $('#gOverAgain').onclick = () => { ov.hidden = true; this.togglePause(); };
      $('#gOverHome').onclick = () => { ov.hidden = true; pageGames(); };
    } else {
      ov.hidden = true;
      $('#gOverAgain').textContent = t('再来一局');
    }
  },

  gameOver(win, subText) {
    const r = this.current; if (!r || r.dead) return;
    r.dead = true;
    const api = r.api;
    const sc = Math.round(api.getScore());
    const best = Games.best(r.def.id);
    const isNewBest = sc > best;
    if (isNewBest) Games.setBest(r.def.id, sc);
    Sfx[win ? 'win' : 'over']();
    const ov = $('#gOverlay');
    ov.hidden = false;
    $('#gOverEmoji').textContent = win ? '🏆' : (api.admin.isOn() && api.admin.invincible ? '🛡' : '💥');
    $('#gOverTitle').textContent = win ? t('胜利！') : (api.admin.isOn() && api.admin.invincible ? t('本局由管理员罩着') : t('游戏结束'));
    $('#gOverSub').innerHTML = `${subText ? esc(subText) + '<br>' : ''}${t('本局分数')} <b>${sc}</b>${isNewBest ? ' · <span style="color:var(--mango)">' + t('新纪录！') + '</span>' : ' · ' + tf('最高 {n}', { n: best })}${api.admin.isOn() && api.admin.mult > 1 ? ' · ' + tf('外挂加成 ×{n}', { n: api.admin.mult }) : ''}`;
    $('#gOverAgain').textContent = t('再来一局');
    $('#gOverAgain').onclick = () => { Sfx.click(); this.start(r.def.id); };
    $('#gOverHome').onclick = () => { Sfx.click(); pageGames(); };
    const b = $('#gBest'); if (b) b.textContent = Math.max(best, sc);
  },

  stop() {
    const r = this.current;
    if (r) {
      cancelAnimationFrame(r.raf);
      if (r._kd) { document.removeEventListener('keydown', r._kd); document.removeEventListener('keyup', r._ku); }
      if (r.api && r.api.destroy) { try { r.api.destroy(); } catch (e) { } }
    }
    this.current = null;
  },
};

/* ---------- 作弊面板 ---------- */
function openCheatPanel() {
  const mask = $('#modalMask'), box = $('#modalBox');
  if (!mask || !box) return;
  const row = (id, label, sub, on) => `
    <label class="cheat-row" for="${id}">
      <span class="cheat-label">${label}<small>${sub}</small></span>
      <input type="checkbox" id="${id}" ${on ? 'checked' : ''}>
      <span class="cheat-switch"></span>
    </label>`;
  box.innerHTML = `
    <h3>${t('⚡ 管理员外挂面板')}</h3>
    <p style="color:var(--ink-dim);font-size:13px;margin:6px 0 14px">${t('密码：')}<code>mango</code>${t(' · 仅本地演示，刷新后仍生效')}</p>
    ${row('chkInv', t('无敌模式'), t('游戏不会失败（部分游戏降级为不扣命）'), Admin.invincible)}
    ${row('chkHint', t('AI 提示'), t('棋类高亮推荐落点'), Admin.hint)}
    <div class="cheat-row">
      <span class="cheat-label">${t('分数倍率')}<small>${t('结算时按倍率加分')}</small></span>
      <span class="cheat-mults">${[1, 2, 5, 10].map(m => `<button type="button" class="cheat-mult ${Admin.mult === m ? 'on' : ''}" data-m="${m}">×${m}</button>`).join('')}</span>
    </div>
    <div class="cheat-row">
      <span class="cheat-label">${t('时间流速')}<small>${t('0.25x ~ 3x，影响一切按 dt 运动的游戏')}</small></span>
      <input type="range" id="chkTime" min="0.25" max="3" step="0.25" value="${Admin.timeScale}">
      <b id="chkTimeVal" style="min-width:44px;text-align:right">${Admin.timeScale}x</b>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" id="chkClose">${t('关闭面板')}</button>
      <button class="btn btn-mango" id="chkWin">${t('🏆 一键胜利')}</button>
    </div>`;
  mask.hidden = false;
  const close = () => { mask.hidden = true; };
  $('#chkClose').onclick = close;
  mask.onclick = (e) => { if (e.target === mask) close(); };
  $('#chkInv').onchange = (e) => { Admin.invincible = e.target.checked; Admin.save(); };
  $('#chkHint').onchange = (e) => { Admin.hint = e.target.checked; Admin.save(); };
  const tr = $('#chkTime');
  tr.oninput = (e) => { Admin.timeScale = parseFloat(e.target.value); $('#chkTimeVal').textContent = Admin.timeScale + 'x'; Admin.save(); };
  $$('.cheat-mult', box).forEach(b => b.onclick = () => {
    Admin.mult = parseInt(b.dataset.m, 10); Admin.save();
    $$('.cheat-mult', box).forEach(x => x.classList.toggle('on', x === b));
  });
  $('#chkWin').onclick = () => {
    const r = GameRunner.current;
    close();
    if (r) { if (typeof r.def.win === 'function') { try { r.def.win(r.api); } catch (e) { } } else r.api.setScore(999999), r.api.over(true, t('管理员一键通关')); }
    else toast(t('当前没有进行中的游戏'), 'err');
  };
}

/* ---------- 管理员登录 ---------- */
function openAdminLogin() {
  const mask = $('#modalMask'), box = $('#modalBox');
  if (!mask || !box) return;
  if (Admin.unlocked) {
    // 已解锁：直接激活/退出
    Admin.active = !Admin.active;
    toast(Admin.active ? t('管理员模式已激活 ⚡') : t('管理员模式已退出'));
    if (Admin.active) pageGames();
    return;
  }
  box.innerHTML = `
    <h3>${t('🔒 管理员入口')}</h3>
    <p style="color:var(--ink-dim);font-size:13px;margin:6px 0 14px">${t('输入管理员密码以启用外挂面板')}（${t('演示密码')}：<code>mango</code>）</p>
    <div class="f-field"><input class="f-input" id="adminPwd" type="password" placeholder="${t('管理员密码')}" autocomplete="off"></div>
    <div class="f-err" id="adminErr"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="admCancel">${t('取消')}</button>
      <button class="btn btn-mango" id="admOk">${t('进入')}</button>
    </div>`;
  mask.hidden = false;
  const close = () => { mask.hidden = true; };
  $('#admCancel').onclick = close;
  mask.onclick = (e) => { if (e.target === mask) close(); };
  const ok = () => {
    const v = $('#adminPwd').value;
    if (Admin.login(v)) { close(); toast(t('管理员模式已激活 ⚡') + ' · ' + t('游戏内点击 ⚡ 打开外挂'), 'ok'); pageGames(); }
    else $('#adminErr').textContent = t('密码错误') + '（' + t('演示密码') + '：mango）';
  };
  $('#admOk').onclick = ok;
  $('#adminPwd').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  setTimeout(() => $('#adminPwd').focus(), 60);
}

/* ---------- 大厅 ---------- */
function gamesHallHTML() {
  const adminOn = Admin.isOn();
  const cards = Games.all().map(def => {
    const best = Games.best(def.id);
    return `
    <button class="game-card" data-game="${def.id}" type="button">
      <span class="game-ico" style="--gi:${def.grad || 'linear-gradient(135deg,#ffd75e,#ff9d00)'}">${def.icon}</span>
      <span class="game-name">${t(def.name)}</span>
      <span class="game-desc">${t(def.desc)}</span>
      <span class="game-best">${best ? tf('🏆 最高 {n}', { n: best }) : t(def.play)}</span>
    </button>`;
  }).join('');
  return `
  <div class="page games-page">
    <div class="games-hero">
      <div class="games-hero-txt">
        <h1>🥭 ${t('芒果游戏盒')}</h1>
        <p>MangoBox · ${t('一个页面，装下整个游戏厅')} · ${tf('共 {n} 款游戏，触屏 / 键盘都能玩', { n: Games.all().length })}</p>
      </div>
      <div class="games-hero-side">
        <span class="games-count">🎮 ${tf('{n} 款游戏', { n: Games.all().length })}</span>
        <button class="games-lock ${adminOn ? 'unlocked' : ''}" id="adminLock" type="button" aria-label="${t('管理员模式')}">${adminOn ? '⚡' : '🔒'}</button>
      </div>
    </div>
    ${adminOn ? `<div class="games-admin-tip">${t('⚡ 管理员模式已开启：进入任意游戏，点右上角')} <b>⚡</b> ${t('打开外挂面板（无敌 / 时间流速 / 分数倍率 / 一键胜利）')}</div>` : ''}
    <h2 class="games-sec">${t('— 选择一款开始游戏 —')}</h2>
    <div class="games-grid">${cards}</div>
    <p class="games-foot">${t('所有游戏均为本地演示 · 最高分保存在本机浏览器')}${adminOn ? '' : t(' · 点右上角 🔒 输入密码 mango 可开管理员外挂')}</p>
  </div>`;
}

function pageGames() {
  GameRunner.stop();
  const app = $('#app');
  app.innerHTML = gamesHallHTML();
  const lock = $('#adminLock');
  if (lock) lock.onclick = () => { Sfx.click(); openAdminLogin(); };
  $$('.game-card', app).forEach(c => c.onclick = () => {
    Sfx.click();
    const id = c.dataset.game;
    if (['snake', 'brick', 'pong', 'shooter', 'catcher', 'tetris'].includes(id) && isTouch) toast(t('触屏游戏：可用下方虚拟按键或滑动操作'), 'ok');
    GameRunner.start(id);
  });
  applyI18n(document.body);
}
