/* ============================================================
   芒果航空 Mango Air · 应用层
   Hash 路由 + 状态管理 + 全部页面渲染
   ============================================================ */

'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const app = $('#app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yuan = n => '¥' + Number(n).toLocaleString('zh-CN');

/* ---------- 全局状态（Tab 切换不丢失） ---------- */
const App = {
  search: {
    trip: 'oneway', from: 'PEK', to: 'SHA',
    depDate: fmtDate(new Date(Date.now() + 86400000)),
    retDate: fmtDate(new Date(Date.now() + 4 * 86400000)),
    pax: 1, cabin: 'economy',
  },
  filters: { sort: 'price', cabin: '', priceMax: 0, depPeriod: '', stops: '', airline: '' },
  booking: null,   // { flight, cabinKey, returnFlight?, retCabinKey?, paxList, contact, savePax, total, fees }
  resultsCache: null,
  resultFlights: null,   // v1.1：结果页当前航班列表（API 或演示数据）
  resultSource: 'demo',  // v1.1：当前数据来源 api | demo | fallback
  aiResult: null,
  aiInput: null,
  ordersTab: 'all',
  authTab: 'login',
  lang: store.get('lang', 'zh'),
  theme: store.get('theme', 'system'),
  animation: store.get('animation', true),
};

/* ---------- 国际化 / 主题 ---------- */
const _ZH_KEYS = (typeof DICT !== 'undefined' && DICT.en) || {};
const _isZhKey = (s) => !!s && _ZH_KEYS.hasOwnProperty(s);
function t(s) {
  if (!s) return s;
  const dict = (typeof DICT !== 'undefined' && DICT[App.lang]);
  return (dict && dict[s] != null && dict[s] !== '') ? dict[s] : s;
}
function resolveTheme(mode) {
  if (mode === 'system')
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  return mode;
}
function setTheme(mode) {
  App.theme = mode;
  store.set('theme', mode);
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#e7eefa' : '#071a33');
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (mq.addEventListener) mq.addEventListener('change', () => {
      if (App.theme === 'system') document.documentElement.dataset.theme = resolveTheme('system');
    });
  }
}
function setLang(code) {
  App.lang = code;
  store.set('lang', code);
  document.documentElement.lang = (typeof LOCALE_MAP !== 'undefined' && LOCALE_MAP[code]) || code;
  if (typeof MangoService !== 'undefined') MangoService.onLangChange();
  router();
}
function cityL(code) {
  const a = getAirport(code); if (!a) return code;
  const order = ['zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ru'];
  const i = Math.max(0, order.indexOf(App.lang));
  if (typeof APT_L10N !== 'undefined' && APT_L10N[code] && APT_L10N[code][0]) return APT_L10N[code][0][i] || APT_L10N[code][0][0];
  return a.city;
}
function aptL(code) {
  const a = getAirport(code); if (!a) return '';
  const order = ['zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ru'];
  const i = Math.max(0, order.indexOf(App.lang));
  if (typeof APT_L10N !== 'undefined' && APT_L10N[code] && APT_L10N[code][1]) return APT_L10N[code][1][i] || APT_L10N[code][1][0];
  return a.apt;
}
function weekL(n) {
  const w = (typeof WEEK_L10N !== 'undefined' && WEEK_L10N[App.lang]) || WEEK_L10N.zh;
  return w[n] != null ? w[n] : n;
}
/* 运行时 DOM 翻译：模板保持中文，渲染后按字典替换可见文本 */
function applyI18n(root) {
  if (App.lang === 'zh' || !root) return;
  const walk = (node) => {
    node.childNodes.forEach(nd => {
      if (nd.nodeType === 3) {
        const txt = nd.textContent.trim();
        if (txt && _isZhKey(txt)) {
          const rep = t(txt);
          if (rep !== txt) nd.textContent = nd.textContent.split(txt).join(rep);
        }
      } else if (nd.nodeType === 1) {
        ['placeholder', 'aria-label', 'title', 'alt'].forEach(attr => {
          const v = nd.getAttribute(attr);
          if (v && _isZhKey(v.trim())) nd.setAttribute(attr, t(v.trim()));
        });
        if (nd.tagName === 'INPUT' && nd.type === 'submit' && _isZhKey(nd.value.trim())) nd.value = t(nd.value.trim());
        walk(nd);
      }
    });
  };
  walk(root);
}

const todayStr = () => fmtDate(new Date());

/* ---------- 顶栏 / 底部 Tab 文案（随语言重建，避免多次切换失效） ---------- */
const TAB_MAP = { home: '首页', book: '订机票', ai: 'AI 低价', orders: '订单', games: '游戏', profile: '我的' };
const NAV_MAP = { '#/home': '首页', '#/book': '订机票', '#/ai': 'AI 低价', '#/games': '游戏', '#/routes': '航线目的地', '#/brand': '品牌介绍' };
function renderChrome() {
  $$('#tabbar .tab-item').forEach(a => { const k = TAB_MAP[a.dataset.tab]; const s = a.querySelector('span'); if (k && s) s.textContent = t(k); });
  $$('.nav-menu a').forEach(a => { const k = NAV_MAP[a.getAttribute('href')]; if (k) a.textContent = t(k); });
}

/* ---------- Toast / Modal ---------- */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = t(msg);
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2400);
}
function showModal(title, body, actions) {
  const box = $('#modalBox');
  box.innerHTML = `<h3>${esc(t(title))}</h3><p>${t(body)}</p><div class="modal-actions"></div>`;
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm ' + (a.style || 'btn-ghost');
    b.textContent = a.text;
    b.onclick = () => { hideModal(); a.fn && a.fn(); };
    $('.modal-actions', box).appendChild(b);
  });
  $('#modalMask').hidden = false;
}
function hideModal() { $('#modalMask').hidden = true; }
$('#modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') hideModal(); });

/* ---------- 用户 / 订单 ---------- */
function getUser() { return store.get('user', null); }
function getOrders() { return store.get('orders', []); }
function saveOrders(o) { store.set('orders', o); }
function getPassengers() { return store.get('passengers', []); }
function getFavs() { return store.get('favs', []); }
function getHistory() { return store.get('history', []); }

function totalMiles() {
  return getOrders().filter(o => o.status === 'paid')
    .reduce((s, o) => s + o.dist * o.paxCount, 0);
}
function memberLevel() {
  const m = totalMiles();
  return [...MEMBERSHIP].reverse().find(l => m >= l.min) || MEMBERSHIP[0];
}

function createOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}
function genOrderId() {
  return 'MA' + Date.now().toString().slice(-10) + Math.floor(Math.random() * 90 + 10);
}

function recordHistory(from, to) {
  let h = getHistory().filter(x => !(x.from === from && x.to === to));
  h.unshift({ from, to, ts: Date.now() });
  store.set('history', h.slice(0, 10));
}

/* ============================================================
   路由
   ============================================================ */
const ROUTES = {
  home:       { tab: 'home',    fn: pageHome },
  book:       { tab: 'book',    fn: pageBook },
  results:    { tab: 'book',    fn: pageResults },
  passengers: { tab: 'book',    fn: pagePassengers },
  confirm:    { tab: 'book',    fn: pageConfirm },
  pay:        { tab: 'book',    fn: pagePay },
  order:      { tab: 'orders',  fn: pageOrderDetail },
  orders:     { tab: 'orders',  fn: pageOrders },
  ai:         { tab: 'ai',      fn: pageAI },
  games:      { tab: 'games',   fn: pageGames },
  profile:    { tab: 'profile', fn: pageProfile },
  login:      { tab: 'profile', fn: pageLogin },
  routes:     { tab: 'home',    fn: pageRoutes },
  brand:      { tab: 'home',    fn: pageBrand },
  settings:   { tab: 'profile', fn: pageSettings },
};

function router() {
  let key = (location.hash || '#/home').replace(/^#\//, '').split('?')[0] || 'home';
  if (!ROUTES[key]) key = 'home';
  const route = ROUTES[key];
  $$('#tabbar .tab-item').forEach(t => t.classList.toggle('on', t.dataset.tab === route.tab));
  $$('.nav-menu a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + key));
  renderNavActions();
  $('#navDrawer').classList.remove('open');
  $('#navBurger').classList.remove('open');
  window.scrollTo({ top: 0 });
  route.fn();
  applyI18n(document.body);
  renderChrome();
}

window.addEventListener('hashchange', router);
window.addEventListener('scroll', () => $('#topnav').classList.toggle('scrolled', window.scrollY > 30), { passive: true });
$('#navBurger').addEventListener('click', function () {
  this.classList.toggle('open');
  $('#navDrawer').classList.toggle('open');
});
$('#navDrawer').addEventListener('click', e => {
  if (e.target.closest('a')) {
    $('#navDrawer').classList.remove('open');
    $('#navBurger').classList.remove('open');
  }
});

function renderNavActions() {
  const u = getUser();
  $('#navActions').innerHTML = u
    ? `<a class="nav-user" href="#/profile"><span class="avatar-mini">${esc(u.nickname[0])}</span>${esc(u.nickname)}</a>
       <a class="btn btn-mango btn-sm" href="#/book">${t('立即订票')}</a>`
    : `<a class="btn btn-ghost btn-sm" href="#/login">${t('登录 / 注册')}</a>
       <a class="btn btn-mango btn-sm" href="#/book">${t('立即订票')}</a>`;
  // 移动端抽屉菜单
  $('#navDrawer').innerHTML = `
    <a href="#/home">${t('首页')}</a>
    <a href="#/book">${t('订机票')}</a>
    <a href="#/ai">${t('AI 低价')}</a>
    <a href="#/orders">${t('我的订单')}</a>
    <a href="#/profile">${t('会员中心')}</a>
    <a href="#/routes">${t('航线目的地')}</a>
    <a href="#/brand">${t('品牌介绍')}</a>
    <a href="#/settings">${t('设置')}</a>`;
}

/* ---------- 步骤指示器 ---------- */
function stepsBar(cur) {
  const steps = ['搜索航班', '选择航班', '乘机人信息', '核对订单', '模拟支付', '购票完成'];
  const idx = steps.indexOf(cur);
  return `<div class="steps" aria-label="预订进度：当前步骤 ${esc(cur)}">` + steps.map((s, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'cur' : '';
    return `<div class="step ${cls}"><span class="dot">${i < idx ? '✓' : i + 1}</span><span class="lbl">${s}</span></div>` +
      (i < steps.length - 1 ? `<div class="step-sep ${i < idx ? 'done' : ''}"></div>` : '');
  }).join('') + `</div>`;
}

/* ---------- 城市输入组件（联想搜索） ---------- */
function bindCityInput(input, menu, getVal, setVal) {
  function renderMenu() {
    const kw = input.value.trim().toLowerCase();
    const list = AIRPORTS.filter(a =>
      !kw || a.city.toLowerCase().includes(kw) || a.code.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw) || a.short.includes(kw)
    ).slice(0, 8);
    menu.innerHTML = list.map(a => `<button type="button" data-code="${a.code}"><b>${a.code}</b>${esc(cityL(a.code))} · ${esc(a.short)}<small>${esc(a.name)}</small></button>`).join('');
    menu.style.display = list.length ? 'block' : 'none';
    $$('button', menu).forEach(b => b.onclick = () => {
      setVal(b.dataset.code);
      input.value = cityL(b.dataset.code) + ' ' + b.dataset.code;
      menu.style.display = 'none';
    });
  }
  input.addEventListener('focus', () => { if (!input.value) input.value = ''; renderMenu(); });
  input.addEventListener('input', renderMenu);
  input.addEventListener('blur', () => setTimeout(() => { menu.style.display = 'none'; }, 180));
}
function cityDisplay(code) { const a = getAirport(code); return a ? `${cityL(a.code)} ${a.code}` : code; }

/* ============================================================
   页面：首页
   ============================================================ */
function pageHome() {
  const particles = Array.from({ length: 14 }, (_, i) =>
    `<span class="hero-particle" style="left:${5 + (i * 6.7) % 90}%;bottom:${(i * 13) % 40}%;width:${3 + i % 4}px;height:${3 + i % 4}px;animation-duration:${7 + (i % 5) * 2.4}s;animation-delay:${i * 0.7}s"></span>`).join('');

  app.innerHTML = `
  <div class="page">
    <section class="hero">
      <div class="hero-bg">
        <div class="hero-orbit o1"><span class="sat"></span></div>
        <div class="hero-orbit o2"><span class="sat"></span></div>
        <div class="hero-orbit o3"></div>
        <svg class="hero-lines" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,560 C300,480 500,600 760,500 S1100,420 1200,460"/>
          <path d="M0,620 C260,560 560,660 820,560 S1120,500 1200,530"/>
          <path class="fly" d="M-40,300 C250,180 480,380 720,260 S1080,140 1260,220"/>
        </svg>
        <div class="hero-grid"></div>
        ${particles}
      </div>
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="kicker">✦ 天和联盟成员航司（演示）</span>
          <h1>芒行天际<br><em>奔赴山海</em></h1>
          <p class="desc">芒果航空以一抹温暖的芒果金，连接山川湖海。年轻机队、贴心舱享与智能寻价，让每一次出发都轻快如期。</p>
          <div class="hero-cta">
            <a class="btn btn-mango btn-lg" href="#/book">立即订票</a>
            <a class="btn btn-ghost-light btn-lg" href="#/routes">探索航线</a>
          </div>
          <div class="hero-stats">
            <div><b>20+</b><span>通航城市</span></div>
            <div><b>300+</b><span>每日航班*</span></div>
            <div><b>92%</b><span>准点率*</span></div>
            <div><b>4.9</b><span>旅客评分*</span></div>
          </div>
        </div>
        <div class="hero-mango-stage" id="mangoStage">
          <div class="hero-glow"></div>
          <div class="hero-ring r1"></div>
          <div class="hero-ring r2"></div>
          <div class="hero-mango" id="heroMango">
            <img src="assets/mango-logo.png" alt="芒果航空立体芒果标识" draggable="false">
          </div>
          <div class="hero-tag t1">航班 <b>MA1024</b><br>准点起飞 ✓</div>
          <div class="hero-tag t2">芒果金舱享 · <b>已升级</b></div>
        </div>
      </div>
      <p style="position:absolute;bottom:10px;left:0;right:0;text-align:center;color:var(--ink-faint);font-size:11px;z-index:2">* 演示数据，非真实运营统计</p>
    </section>

    <div class="home-search-wrap">${searchCardHTML('首页快捷搜索')}</div>
    ${homeDealsHTML()}
    ${homeRoutesHTML()}
    ${homeFleetHTML()}
    ${homeAllianceHTML()}
    <footer class="section" style="text-align:center;color:var(--ink-faint);font-size:12.5px;padding:30px 0 10px">
      <img src="assets/alliance-logo.png" alt="天和联盟标志" style="width:54px;margin:0 auto 10px;opacity:.9">
      芒果航空 Mango Air · 芒行天际，奔赴山海<br>
      天和联盟成员（品牌演示） · 本站为演示站点，所有航班、票价与余票均为模拟数据<br>
      © 2026 Mango Air Virtual · 版本 <b style="color:var(--mango)">v1.4</b> · 数据源：<span id="footSource">演示数据</span><br>
      <span style="opacity:.75">© 2026 Mango Air Virtual. 保留所有权利。</span>
    </footer>
  </div>`;

  bindSearchCard();
  bindParallax();
  bindRouteCards(app);
}

/* 鼠标视差（桌面端） */
function bindParallax() {
  const stage = $('#mangoStage'), mango = $('#heroMango');
  if (!stage || matchMedia('(pointer: coarse)').matches) return;
  stage.addEventListener('mousemove', e => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    mango.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg) translateZ(24px) scale(1.02)`;
  });
  stage.addEventListener('mouseleave', () => { mango.style.transform = ''; });
}

/* ---------- 搜索卡（首页 & 订票页共用） ---------- */
function searchCardHTML(idPrefix) {
  const s = App.search;
  return `
  <div class="card search-card" id="searchCard">
    <div class="trip-toggle" role="tablist" aria-label="行程类型">
      <button type="button" data-trip="oneway" class="${s.trip === 'oneway' ? 'on' : ''}">单程</button>
      <button type="button" data-trip="round" class="${s.trip === 'round' ? 'on' : ''}">往返</button>
    </div>
    <form id="searchForm" novalidate>
      <div class="form-grid">
        <div class="f-field" id="ffrom">
          <label for="inpFrom">出发地</label>
          <input id="inpFrom" autocomplete="off" placeholder="出发城市 / 机场" value="${esc(cityDisplay(s.from))}">
          <span class="f-err" id="errFrom"></span>
          <div class="city-menu" id="menuFrom" style="display:none"></div>
        </div>
        <div class="swap-cell"><button type="button" class="swap-btn" id="swapBtn" aria-label="交换出发地与目的地">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v13M7 4 4 7m3-3 3 3M17 20V7m0 13 3-3m-3 3-3-3"/></svg>
        </button></div>
        <div class="f-field" id="fto">
          <label for="inpTo">到达地</label>
          <input id="inpTo" autocomplete="off" placeholder="到达城市 / 机场" value="${esc(cityDisplay(s.to))}">
          <span class="f-err" id="errTo"></span>
          <div class="city-menu" id="menuTo" style="display:none"></div>
        </div>
        <div class="f-field" id="fdep">
          <label for="inpDep">出发日期</label>
          <input id="inpDep" type="date" min="${todayStr()}" value="${s.depDate}">
          <span class="f-err" id="errDep"></span>
        </div>
        <div class="f-field" id="fret" style="${s.trip === 'round' ? '' : 'display:none'}">
          <label for="inpRet">返程日期</label>
          <input id="inpRet" type="date" min="${s.depDate}" value="${s.retDate}">
          <span class="f-err" id="errRet"></span>
        </div>
        <div class="f-field">
          <label for="inpPax">乘客</label>
          <select id="inpPax">${[1,2,3,4,5,6,7,8,9].map(n => `<option value="${n}" ${s.pax === n ? 'selected' : ''}>${n} 人</option>`).join('')}</select>
        </div>
        <div class="f-field">
          <label for="inpCabin">舱位</label>
          <select id="inpCabin">${CABINS.map(c => `<option value="${c.key}" ${s.cabin === c.key ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        </div>
        <div class="f-field" style="grid-column: 1 / -1">
          <button class="btn btn-mango btn-lg btn-block" type="submit" id="btnSearch">搜索航班</button>
        </div>
      </div>
    </form>
  </div>`;
}

function bindSearchCard() {
  const s = App.search;
  $$('.trip-toggle button').forEach(b => b.onclick = () => {
    s.trip = b.dataset.trip;
    $$('.trip-toggle button').forEach(x => x.classList.toggle('on', x === b));
    const rf = $('#fret'); if (rf) rf.style.display = s.trip === 'round' ? '' : 'none';
  });

  const inpFrom = $('#inpFrom'), inpTo = $('#inpTo');
  const resolve = v => {
    const t = v.trim().toLowerCase();
    if (!t) return null;
    return AIRPORTS.find(a => a.code.toLowerCase() === t) ||
      AIRPORTS.find(a => (a.city + ' ' + a.code).toLowerCase() === t) ||
      AIRPORTS.find(a => a.city.toLowerCase().includes(t) || a.code.toLowerCase().includes(t) || a.name.toLowerCase().includes(t) || a.short.includes(t)) || null;
  };
  bindCityInput(inpFrom, $('#menuFrom'), () => s.from, c => s.from = c);
  bindCityInput(inpTo, $('#menuTo'), () => s.to, c => s.to = c);
  inpFrom.value = cityDisplay(s.from); inpTo.value = cityDisplay(s.to);

  $('#swapBtn').onclick = () => {
    [s.from, s.to] = [s.to, s.from];
    inpFrom.value = cityDisplay(s.from); inpTo.value = cityDisplay(s.to);
    $('#swapBtn').classList.toggle('spun');
    toast('已交换出发地与目的地');
  };

  $('#inpDep').onchange = e => {
    s.depDate = e.target.value;
    const r = $('#inpRet'); r.min = s.depDate;
    if (s.retDate < s.depDate) { s.retDate = s.depDate; r.value = s.depDate; }
  };
  $('#inpRet').onchange = e => s.retDate = e.target.value;

  $('#searchForm').onsubmit = e => {
    e.preventDefault();
    // 读取输入（若用户手动输入城市则解析）
    const fv = resolve(inpFrom.value), tv = resolve(inpTo.value);
    let ok = true;
    const errField = { '#errFrom': '#ffrom', '#errTo': '#fto', '#errDep': '#fdep', '#errRet': '#fret' };
    const setErr = (id, msg) => { $(id).textContent = msg; const w = $(errField[id]); if (w) w.classList.toggle('invalid', !!msg); };
    setErr('#errFrom', !fv ? '请选择有效的出发城市' : '');
    setErr('#errTo', !tv ? '请选择有效的到达城市' : '');
    if (!fv || !tv) ok = false;
    if (fv && tv && fv.code === tv.code) { setErr('#errTo', '出发地与到达地不能相同'); ok = false; }
    if (!s.depDate) { setErr('#errDep', '请选择出发日期'); ok = false; } else setErr('#errDep', '');
    if (s.trip === 'round' && s.retDate < s.depDate) { setErr('#errRet', '返程日期不能早于出发日期'); ok = false; } else setErr('#errRet', '');
    if (!ok) { toast('请检查表单填写', 'err'); return; }

    s.from = fv.code; s.to = tv.code;
    recordHistory(s.from, s.to);
    App.filters = { sort: 'price', cabin: s.cabin, priceMax: 0, depPeriod: '', stops: '', airline: '' };
    location.hash = '#/results';
  };
}

/* ---------- 首页各区块 ---------- */
function homeDealsHTML() {
  // 从热门目的地中取今日最低价（演示）
  const deals = ['SYX', 'KMG', 'CTU', 'URC'].map(code => {
    const fs = genFlights('PEK', code, addDays(todayStr(), 3)).flatMap(f => f.cabins.filter(c => c.key === 'economy').map(c => c.price));
    return { code, price: Math.min(...fs) };
  });
  return `<section class="section">
    <div class="sec-head">
      <div><h2 class="sec-title">特价航班</h2></div>
      <a class="sec-more" href="#/ai">让 AI 帮我找低价 →</a>
    </div>
    <div class="route-grid">
      ${deals.map(d => {
        const a = getAirport(d.code);
        return `<a class="route-card" href="#/book" data-route="${d.code}">
          <div class="rc-bg" style="background:linear-gradient(135deg,hsl(${(hashCode(d.code) % 200) + 180},55%,26%),hsl(${(hashCode(d.code) % 200) + 210},60%,14%))"></div>
          <div class="from-price"><b>${yuan(d.price)}</b> 起</div>
          <div class="rc-body">
            <div class="codes">${a.code}<span class="pl">→</span></div>
            <div class="cities">${esc(cityL(a.code))} · ${esc(a.name)}</div>
            <div style="margin-top:10px"><span class="demo-badge">📊 模拟特价数据</span></div>
          </div>
        </a>`;
      }).join('')}
    </div>
  </section>`;
}

function homeRoutesHTML() {
  const routes = [['SHA', 'CAN'], ['PEK', 'CTU'], ['SZX', 'XIY'], ['HGH', 'KMG'], ['CTU', 'LXA'], ['SHA', 'SYX']];
  return `<section class="section">
    <div class="sec-head">
      <h2 class="sec-title">热门航线</h2>
      <a class="sec-more" href="#/routes">全部航线 →</a>
    </div>
    <div class="route-grid">
      ${routes.map(([f, t]) => routeCardHTML(f, t)).join('')}
    </div>
  </section>`;
}

function routeCardHTML(f, t) {
  const fa = getAirport(f), ta = getAirport(t);
  const favs = getFavs();
  const faved = favs.some(x => x.from === f && x.to === t);
  const fs = genFlights(f, t, addDays(todayStr(), 2)).flatMap(fl => cabinOf(fl, 'economy').price);
  const p = fs.length ? Math.min(...fs) : 0;
  return `<div class="route-card" data-from="${f}" data-to="${t}" role="button" tabindex="0" aria-label="搜索航线 ${esc(cityL(fa.code))} 到 ${esc(cityL(ta.code))}">
    <div class="rc-bg" style="background:linear-gradient(135deg,hsl(${(hashCode(f + t) % 160) + 190},52%,28%),hsl(${(hashCode(f + t) % 160) + 220},58%,13%))"></div>
    <button class="fav-btn ${faved ? 'faved' : ''}" data-fav aria-label="收藏航线">${faved ? '★' : '☆'}</button>
    <div class="from-price"><b>${yuan(p)}</b> 起</div>
    <div class="rc-body">
      <div class="codes">${fa.code}<span class="pl">✈ →</span>${ta.code}</div>
      <div class="cities">${esc(cityL(fa.code))} — ${esc(cityL(ta.code))} · 直飞约 ${durText(genFlights(f, t, addDays(todayStr(), 2))[0]?.durMin || 120)}</div>
      <div style="margin-top:10px"><span class="demo-badge">📊 模拟票价</span></div>
    </div>
  </div>`;
}

function bindRouteCards(scope) {
  $$('.route-card[data-from]', scope).forEach(card => {
    const f = card.dataset.from, t = card.dataset.to;
    card.addEventListener('click', e => {
      if (e.target.closest('[data-fav]')) {
        let favs = getFavs();
        const i = favs.findIndex(x => x.from === f && x.to === t);
        if (i >= 0) { favs.splice(i, 1); toast('已取消收藏'); }
        else { favs.unshift({ from: f, to: t }); toast('已收藏航线 ★'); }
        store.set('favs', favs);
        e.target.classList.toggle('faved');
        e.target.textContent = e.target.classList.contains('faved') ? '★' : '☆';
        return;
      }
      App.search.from = f; App.search.to = t;
      recordHistory(f, t);
      location.hash = '#/results';
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter') card.click(); });
  });
  $$('.route-card[data-route]', scope).forEach(card => card.addEventListener('click', () => { App.search.to = card.dataset.route; }));
}

function homeFleetHTML() {
  return `<section class="section">
    <div class="sec-head"><h2 class="sec-title">芒果机队</h2><a class="sec-more" href="#/brand">品牌介绍 →</a></div>
    <div class="two-col">
      <div class="fleet-img"><img src="assets/plane.jpg" alt="芒果航空 A321neo 客机" loading="lazy"></div>
      <div class="card" style="padding:24px">
        <table class="fleet-table">
          <tr><th>机型</th><th>座位</th><th>航程</th></tr>
          ${FLEET.map(f => `<tr><td><b>${f.model}</b><br><small style="color:var(--ink-faint)">${f.note}</small></td><td>${f.seats}</td><td>${f.range}</td></tr>`).join('')}
        </table>
        <p style="margin-top:12px"><span class="demo-badge">📊 机队演示数据</span></p>
      </div>
    </div>
  </section>`;
}

function homeAllianceHTML() {
  return `<section class="section">
    <div class="card alliance-panel">
      <div class="alliance-logo-box"><img src="assets/alliance-logo.png" alt="天和联盟标志"></div>
      <div>
        <h2 class="sec-title" style="margin-bottom:12px">天和联盟</h2>
        <p style="color:var(--ink-dim);font-size:15px">芒果航空是天和联盟品牌演示成员。联盟致力于以共享枢纽、互惠常旅客与无缝中转体验，连接更广阔的天空。</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <span class="tag gold">联盟枢纽共享</span><span class="tag gold">里程互惠</span><span class="tag gold">贵宾厅互通</span>
        </div>
        <p style="margin-top:14px"><span class="demo-badge">ℹ️ 联盟身份为品牌演示设定</span></p>
      </div>
    </div>
  </section>`;
}

/* ============================================================
   页面：机票搜索（订票 Tab 首屏）
   ============================================================ */
function pageBook() {
  app.innerHTML = `<div class="page">
    ${stepsBar('搜索航班')}
    <h1 style="font-size:26px;margin-bottom:18px;letter-spacing:1px">机票搜索</h1>
    ${searchCardHTML('book')}
    <div class="section">
      <div class="sec-head"><h2 class="sec-title">最近浏览</h2></div>
      <div id="histBox">${getHistory().length ? '' : '<div class="card empty">暂无浏览记录，快去搜索一趟航班吧 ✈</div>'}</div>
      <div class="route-grid" id="histGrid"></div>
    </div>
  </div>`;
  bindSearchCard();
  const h = getHistory().slice(0, 4);
  $('#histGrid').innerHTML = h.map(x => routeCardHTML(x.from, x.to)).join('');
  bindRouteCards($('#histGrid'));
}

/* ============================================================
   页面：航班搜索结果
   ============================================================ */
function pageResults() {
  const s = App.search;
  if (!s.from || !s.to) { location.hash = '#/book'; return; }
  app.innerHTML = `<div class="page">
    ${stepsBar('选择航班')}
    <div class="result-toolbar">
      <div>
        <h1 style="font-size:21px;letter-spacing:1px">${esc(cityL(s.from))} <span style="color:var(--mango)">→</span> ${esc(getAirport(s.to).city)}</h1>
        <p style="color:var(--ink-dim);font-size:13.5px;margin-top:2px">${s.depDate} 周${weekOf(s.depDate)} · ${s.pax} 位乘客 · ${getCabin(s.cabin).name}${s.trip === 'round' ? ` · 往返 ${s.retDate}` : ''} <span class="demo-badge" style="margin-left:6px">模拟航班数据</span></p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        ${apiStatusBadge()}
        <button class="btn btn-ghost btn-sm" id="editSearch">修改搜索</button>
      </div>
    </div>
    <div class="card filter-panel" id="filterPanel"></div>
    <div class="sort-chips" id="sortChips"></div>
    <div id="resultList" style="margin-top:16px"></div>
  </div>`;

  $('#editSearch').onclick = () => location.hash = '#/book';
  renderFilters();
  renderSortChips();
  // v1.1：异步加载（真实走 FlightAPI 数据源，失败自动降级演示数据）
  App.resultFlights = null;
  loadResultFlights();
}

function getFilteredFlights() {
  const s = App.search, f = App.filters;
  // v1.1：优先使用结果页已加载的列表（API 实时数据或演示数据），未加载时回退同步生成
  let list = App.resultFlights || dataAdapter.searchFlights({ from: s.from, to: s.to, date: s.depDate });
  if (f.stops === 'direct') list = list.filter(x => x.stops === 0);
  if (f.stops === 'transfer') list = list.filter(x => x.stops > 0);
  if (f.depPeriod) {
    const [a, b] = f.depPeriod.split('-').map(Number);
    list = list.filter(x => { const h = +x.depTime.split(':')[0]; return h >= a && h < b; });
  }
  if (f.airline) list = list.filter(x => x.airline === f.airline);
  return list;
}

/* v1.1：异步加载结果列表 —— 真实走 FlightAPI（可对接外部数据源），失败自动降级演示数据 */
function loadResultFlights() {
  const s = App.search;
  const box = $('#resultList');
  if (box) box.innerHTML = `<div class="card empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
    正在获取航班数据…</div>`;
  dataAdapter.searchFlightsAsync({ from: s.from, to: s.to, date: s.depDate }).then(r => {
    if (App.search !== s) return; // 搜索条件已变，丢弃旧响应
    App.resultFlights = r.flights;
    App.resultSource = r.source;
    refreshSourceBadges();
    renderResultList();
    renderFilters();
    if (r.source === 'fallback') toast('数据源请求失败，已切换为演示数据', 'err');
  }).catch(() => {
    if (App.search !== s) return;
    if (App.resultFlights && App.resultSource === 'api') return; // 已成功加载 API 数据，不覆盖
    App.resultFlights = dataAdapter.searchFlights({ from: s.from, to: s.to, date: s.depDate });
    App.resultSource = 'demo';
    renderResultList();
    renderFilters();
  });
}

function renderFilters() {
  const f = App.filters, s = App.search;
  if (!$('#filterPanel')) return; // 已离开结果页（异步回调晚于路由切换）
  const flights = getFilteredFlights();
  const prices = flights.map(x => cabinOf(x, s.cabin)?.price ?? Infinity);
  const maxP = Math.max(...prices.filter(isFinite), 500);
  if (!f.priceMax || f.priceMax > maxP) f.priceMax = 0;
  $('#filterPanel').innerHTML = `
    <div class="f-field"><label>舱位</label>
      <select id="fCabin"><option value="">全部舱位</option>${CABINS.map(c => `<option value="${c.key}" ${f.cabin === c.key ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
    <div class="f-field"><label>价格区间</label>
      <select id="fPrice"><option value="0">不限</option>
        ${[400, 700, 1000, 1500, 2000, Math.ceil(maxP / 100) * 100].filter((v, i, arr) => arr.indexOf(v) === i).map(v => `<option value="${v}" ${f.priceMax === v ? 'selected' : ''}>≤ ${yuan(v)}</option>`).join('')}
      </select></div>
    <div class="f-field"><label>出发时段</label>
      <select id="fPeriod"><option value="">全天</option>
        <option value="0-6" ${f.depPeriod === '0-6' ? 'selected' : ''}>凌晨 00-06</option>
        <option value="6-12" ${f.depPeriod === '6-12' ? 'selected' : ''}>上午 06-12</option>
        <option value="12-18" ${f.depPeriod === '12-18' ? 'selected' : ''}>下午 12-18</option>
        <option value="18-24" ${f.depPeriod === '18-24' ? 'selected' : ''}>晚间 18-24</option>
      </select></div>
    <div class="f-field"><label>直飞/中转</label>
      <select id="fStops"><option value="">不限</option>
        <option value="direct" ${f.stops === 'direct' ? 'selected' : ''}>仅直飞</option>
        <option value="transfer" ${f.stops === 'transfer' ? 'selected' : ''}>接受中转</option>
      </select></div>`;
  $('#fCabin').onchange = e => { f.cabin = e.target.value || s.cabin; renderResultList(); };
  $('#fPrice').onchange = e => { f.priceMax = +e.target.value; renderResultList(); };
  $('#fPeriod').onchange = e => { f.depPeriod = e.target.value; renderResultList(); };
  $('#fStops').onchange = e => { f.stops = e.target.value; renderResultList(); };
}

function renderSortChips() {
  const f = App.filters;
  const chips = [['price', '价格最低'], ['dep', '出发时间最早'], ['dur', '飞行时间最短'], ['direct', '直飞优先']];
  $('#sortChips').innerHTML = chips.map(([k, n]) => `<button class="chip ${f.sort === k ? 'on' : ''}" data-sort="${k}">${n}</button>`).join('');
  $$('#sortChips .chip').forEach(c => c.onclick = () => { f.sort = c.dataset.sort; renderSortChips(); renderResultList(); });
}

function renderResultList() {
  const s = App.search, f = App.filters;
  if (!$('#resultList')) return; // 已离开结果页（异步回调晚于路由切换）
  let list = getFilteredFlights().filter(x => !f.priceMax || (cabinOf(x, f.cabin || s.cabin)?.price ?? Infinity) <= f.priceMax);
  const sortBy = {
    price: (a, b) => cabinOf(a, s.cabin).price - cabinOf(b, s.cabin).price,
    dep: (a, b) => a.depTime.localeCompare(b.depTime),
    dur: (a, b) => a.durMin - b.durMin,
    direct: (a, b) => a.stops - b.stops || cabinOf(a, s.cabin).price - cabinOf(b, s.cabin).price,
  }[f.sort];
  list.sort(sortBy);

  const box = $('#resultList');
  if (!list.length) {
    box.innerHTML = `<div class="card empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      未找到符合筛选条件的航班<br><small>试试放宽价格或时段限制</small></div>`;
    return;
  }

  box.innerHTML = list.map(fl => {
    const c = cabinOf(fl, s.cabin);
    const fa = getAirport(fl.from), ta = getAirport(fl.to);
    const depTerm = fl.terminals?.dep ?? '—', arrTerm = fl.terminals?.arr ?? '—';
    const fromShort = fa?.short ?? fl.from, toShort = ta?.short ?? fl.to;
    const fromCity = fa ? cityL(fa.code) : fl.from, toCity = ta ? cityL(ta.code) : fl.to;
    const viaText = fl.stops ? (getAirport(fl.via) ? `中转 ${cityL(fl.via)}` : `中转 ${fl.via}`) : '直飞';
    return `<div class="card flight-card">
      <div class="fc-route">
        <div class="fc-time"><div class="t">${fl.depTime}</div><div class="c">${fromShort}<br>T${depTerm}</div></div>
        <div class="fc-line">
          <span class="dur">${durText(fl.durMin)}</span>
          <span class="ln"></span>
          <span class="stop ${fl.stops ? 'transfer' : ''}">${viaText}</span>
        </div>
        <div class="fc-time"><div class="t">${fl.arrTime}<small style="font-size:12px;color:var(--ink-faint)">${fl.arrDate !== fl.depDate ? '+1天' : ''}</small></div><div class="c">${toShort}<br>T${arrTerm}</div></div>
      </div>
      <div class="fc-price">
        <div class="p"><small>${c.name}</small><br>${yuan(c.price)}<small style="color:var(--ink-faint)">/人</small></div>
        <button class="btn btn-mango btn-sm" data-pick="${fl.id}" data-cabin="${c.key}">选择航班</button>
      </div>
      <div class="fc-meta">
        <span class="tag gold">${fl.no}</span><span class="tag">${fl.airline} · ${fl.aircraft}</span>
        <span class="tag">行李：${c.bag}</span>
        <span class="tag blue">准点率 ${fl.punctuality}%*</span>
        ${c.seats < 5 ? `<span class="tag red seats-warn">仅剩 ${c.seats} 张</span>` : `<span class="tag">余票充足</span>`}
        <span class="demo-badge">模拟数据</span>
      </div>
      <div class="cabin-select">
        ${fl.cabins.map(cb => `<button class="cabin-opt" data-pick="${fl.id}" data-cabin="${cb.key}">
          <b>${cb.name}</b><span class="cp">${yuan(cb.price)}</span>
          <small>${cb.bag} · 余 ${cb.seats} 张</small></button>`).join('')}
      </div>
    </div>`;
  }).join('');

  $$('[data-pick]', box).forEach(b => b.onclick = () => pickFlight(b.dataset.pick, b.dataset.cabin));

  // AI 推荐页「查看航班」直接进入预订
  if (App._pendingPick) {
    const pid = App._pendingPick; App._pendingPick = null;
    if (list.some(f => f.id === pid)) pickFlight(pid, App.filters.cabin || App.search.cabin);
  }
}

function pickFlight(flightId, cabinKey) {
  let fl = (App.resultFlights || []).find(f => f.id === flightId);
  if (!fl) fl = dataAdapter.searchFlights({ from: App.search.from, to: App.search.to, date: App.search.depDate }).find(f => f.id === flightId);
  if (!fl) { toast('航班信息已过期，请重新搜索', 'err'); return; }
  const c = cabinOf(fl, cabinKey);
  if (c.seats < App.search.pax) { toast(`该舱位仅剩 ${c.seats} 张，少于乘客人数`, 'err'); return; }
  App.booking = { flight: fl, cabinKey, paxList: [], contact: {}, savePax: true, trip: App.search.trip, paxCount: App.search.pax };
  location.hash = '#/passengers';
}

/* ============================================================
   页面：乘机人信息填写
   ============================================================ */
function pagePassengers() {
  const bk = App.booking;
  if (!bk) { location.hash = '#/book'; return; }
  if (!bk.paxList.length) bk.paxList = Array.from({ length: bk.paxCount }, () => ({ name: '', idType: '身份证', idNo: '', phone: '' }));
  const saved = getPassengers();

  app.innerHTML = `<div class="page">
    ${stepsBar('乘机人信息')}
    <h1 style="font-size:24px;margin-bottom:6px">乘机人信息</h1>
    <p style="color:var(--ink-dim);font-size:14px;margin-bottom:20px">请确保姓名与证件信息一致，证件类型与号码将用于值机（演示环境，不会真实提交）。</p>

    ${saved.length ? `<div class="card" style="padding:16px 20px;margin-bottom:16px">
      <b style="font-size:14px">常用乘机人</b>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        ${saved.map((p, i) => `<button class="chip" data-usepax="${i}">＋ ${esc(p.name)}（${esc(p.idNo.slice(-4))}）</button>`).join('')}
      </div></div>` : ''}

    <form id="paxForm" novalidate>
      ${bk.paxList.map((p, i) => paxFormHTML(p, i)).join('')}
      <div class="card pax-block">
        <h3>联系人信息</h3>
        <div class="form-row">
          <div class="f-field"><label for="ctPhone">联系手机号</label><input id="ctPhone" type="tel" maxlength="11" placeholder="用于接收订单通知" value="${esc(bk.contact.phone || getUser()?.phone || '')}"><span class="f-err" id="errCtPhone"></span></div>
          <div class="f-field"><label for="ctEmail">联系邮箱（选填）</label><input id="ctEmail" type="email" placeholder="name@example.com" value="${esc(bk.contact.email || '')}"><span class="f-err" id="errCtEmail"></span></div>
        </div>
        <label class="ai-switch" style="margin-top:12px"><input type="checkbox" id="savePax" ${bk.savePax ? 'checked' : ''}> 保存乘机人为常用乘机人</label>
      </div>
      <div style="display:flex;gap:14px;margin:20px 0">
        <button type="button" class="btn btn-ghost" id="backToResults">← 返回选航班</button>
        <button type="submit" class="btn btn-mango btn-lg" style="flex:1">下一步：核对订单</button>
      </div>
    </form>
  </div>`;

  $('#backToResults').onclick = () => location.hash = '#/results';
  $$('[data-usepax]').forEach(b => b.onclick = () => {
    const p = saved[+b.dataset.usepax];
    const target = bk.paxList.findIndex(x => !x.name);
    const idx = target >= 0 ? target : 0;
    Object.assign(bk.paxList[idx], { ...p });
    toast(`已填入乘机人 ${p.name}`);
    pagePassengers();
  });

  $('#paxForm').onsubmit = e => {
    e.preventDefault();
    let ok = true;
    bk.paxList.forEach((p, i) => {
      p.name = $(`#pName${i}`).value.trim();
      p.idType = $(`#pIdType${i}`).value;
      p.idNo = $(`#pIdNo${i}`).value.trim().toUpperCase();
      p.phone = $(`#pPhone${i}`).value.trim();
      const setE = (id, msg) => { $(id).textContent = msg; if (msg) ok = false; };
      setE(`#errName${i}`, p.name ? (p.name.length < 2 ? '姓名至少 2 个字符' : '') : '请填写姓名');
      if (p.idType === '身份证') {
        const okId = /^\d{17}[\dXx]$/.test(p.idNo);
        setE(`#errIdNo${i}`, !p.idNo ? '请填写证件号码' : (!okId ? '身份证号须为 18 位（最后一位可为 X）' : ''));
      } else {
        setE(`#errIdNo${i}`, p.idNo.length < 5 ? '请填写有效证件号码' : '');
      }
      if (i === 0) setE(`#errPhone${i}`, !/^1[3-9]\d{9}$/.test(p.phone) ? '请填写 11 位有效手机号' : '');
      else setE(`#errPhone${i}`, '');
    });
    bk.contact.phone = $('#ctPhone').value.trim();
    bk.contact.email = $('#ctEmail').value.trim();
    if (!/^1[3-9]\d{9}$/.test(bk.contact.phone)) { $('#errCtPhone').textContent = '请填写 11 位有效手机号'; ok = false; } else $('#errCtPhone').textContent = '';
    if (bk.contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bk.contact.email)) { $('#errCtEmail').textContent = '邮箱格式不正确'; ok = false; } else $('#errCtEmail').textContent = '';
    if (!ok) { toast('请修正表单中标红的项', 'err'); return; }
    bk.savePax = $('#savePax').checked;
    location.hash = '#/confirm';
  };
}

function paxFormHTML(p, i) {
  return `<div class="card pax-block">
    <h3>乘机人 ${i + 1} ${i === 0 ? '<span class="tag gold">下单联系人</span>' : ''}</h3>
    <div class="form-row" style="margin-bottom:14px">
      <div class="f-field"><label for="pName${i}">姓名（与证件一致）</label><input id="pName${i}" placeholder="如：张三" value="${esc(p.name)}"><span class="f-err" id="errName${i}"></span></div>
      <div class="f-field"><label for="pIdType${i}">证件类型</label>
        <select id="pIdType${i}"><option ${p.idType === '身份证' ? 'selected' : ''}>身份证</option><option ${p.idType === '护照' ? 'selected' : ''}>护照</option><option ${p.idType === '港澳台居民居住证' ? 'selected' : ''}>港澳台居民居住证</option></select></div>
    </div>
    <div class="form-row">
      <div class="f-field"><label for="pIdNo${i}">证件号码</label><input id="pIdNo${i}" placeholder="${p.idType === '身份证' ? '18 位身份证号' : '证件号码'}" value="${esc(p.idNo)}"><span class="f-err" id="errIdNo${i}"></span></div>
      <div class="f-field"><label for="pPhone${i}">手机号${i === 0 ? '' : '（选填）'}</label><input id="pPhone${i}" type="tel" maxlength="11" placeholder="11 位手机号" value="${esc(p.phone)}"><span class="f-err" id="errPhone${i}"></span></div>
    </div>
  </div>`;
}

/* ---------- 价格计算 ---------- */
function calcBooking() {
  const bk = App.booking, s = App.search;
  const c = cabinOf(bk.flight, bk.cabinKey);
  const perTicket = c.price;
  const fees = 70; // 机建+燃油（模拟）
  const tickets = perTicket * bk.paxCount;
  const airportFee = fees * bk.paxCount;
  const total = tickets + airportFee;
  return { perTicket, tickets, airportFee, total, cabin: c };
}

/* ============================================================
   页面：订单确认
   ============================================================ */
function pageConfirm() {
  const bk = App.booking;
  if (!bk || !bk.paxList.length) { location.hash = '#/book'; return; }
  const { cabin, perTicket, tickets, airportFee, total } = calcBooking();
  const fl = bk.flight;
  const fa = getAirport(fl.from), ta = getAirport(fl.to);

  app.innerHTML = `<div class="page">
    ${stepsBar('核对订单')}
    <h1 style="font-size:24px;margin-bottom:20px">核对订单</h1>
    <div class="two-col">
      <div>
        <div class="card pax-block">
          <h3>航班信息</h3>
          <table class="info-table">
            <tr><td>航班号</td><td><b style="color:var(--mango)">${fl.no}</b> · ${fl.airline} ${fl.aircraft}</td></tr>
            <tr><td>行程</td><td>${esc(cityL(fa.code))} ${fa.code} → ${esc(cityL(ta.code))} ${ta.code}${fl.stops ? `（中转 ${cityL(fl.via)}）` : '（直飞）'}</td></tr>
            <tr><td>日期时间</td><td>${fl.depDate} ${fl.depTime} — ${fl.arrDate} ${fl.arrTime}</td></tr>
            <tr><td>飞行时长</td><td>${durText(fl.durMin)}</td></tr>
            <tr><td>舱位 / 行李</td><td>${cabin.name} · ${cabin.bag}</td></tr>
            <tr><td>乘客人数</td><td>${bk.paxCount} 人</td></tr>
          </table>
        </div>
        <div class="card pax-block">
          <h3>乘机人信息</h3>
          <table class="info-table">
            ${bk.paxList.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.idType)} · ${esc(p.idNo.replace(/^(.{4}).+(.{3})$/, '$1***********$2'))}</td></tr>`).join('')}
            <tr><td>联系人</td><td>${esc(bk.contact.phone)}</td></tr>
          </table>
        </div>
        <div class="card pax-block">
          <h3>退改规则（演示）</h3>
          <p style="color:var(--ink-dim);font-size:13.5px">起飞前 2 小时以上退票收取 20% 手续费；2 小时内收取 40%；误机不退。改期每次收取 10% 手续费，差价另计。此规则为演示内容，不构成真实运输合同条款。</p>
        </div>
      </div>
      <div class="card price-panel">
        <h3 style="margin-bottom:14px">票价明细</h3>
        <div class="price-row"><span>${cabin.name} × ${bk.paxCount} 人</span><span>${yuan(perTicket)} × ${bk.paxCount}</span></div>
        <div class="price-row"><span>票面总价</span><span>${yuan(tickets)}</span></div>
        <div class="price-row"><span>机建 + 燃油（模拟）</span><span>${yuan(airportFee)}</span></div>
        <div class="price-row total"><span>总计</span><b>${yuan(total)}</b></div>
        <label class="ai-switch" style="margin:16px 0"><input type="checkbox" id="agreeChk"> 我已阅读并同意演示退改规则</label>
        <span class="f-err" id="errAgree"></span>
        <button class="btn btn-mango btn-lg btn-block" id="submitOrder">提交订单</button>
        <button class="btn btn-ghost btn-block" style="margin-top:10px" id="backEdit">← 修改乘机人</button>
        <p style="color:var(--ink-faint);font-size:12px;margin-top:14px;text-align:center">提交后进入<b style="color:var(--mango)">模拟支付</b>流程，不产生真实扣款</p>
      </div>
    </div>
  </div>`;

  $('#backEdit').onclick = () => location.hash = '#/passengers';
  $('#submitOrder').onclick = () => {
    if (!$('#agreeChk').checked) { $('#errAgree').textContent = '请先勾选同意退改规则'; toast('请先同意退改规则', 'err'); return; }
    const { total, cabin } = calcBooking();
    const order = {
      id: genOrderId(), ts: Date.now(), status: 'pending',
      flight: bk.flight, cabinKey: bk.cabinKey, cabinName: cabin.name,
      paxList: bk.paxList, contact: bk.contact, paxCount: bk.paxCount,
      total, dist: bk.flight.dist,
    };
    createOrder(order);
    App.lastOrderId = order.id;
    toast('订单已创建，进入支付');
    location.hash = '#/pay?id=' + order.id;
  };
}

/* ============================================================
   页面：模拟支付
   ============================================================ */
let payTimer = null;
function pagePay() {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id') || App.lastOrderId;
  const order = getOrders().find(o => o.id === id);
  if (!order) { location.hash = '#/orders'; return; }
  if (order.status !== 'pending') { location.hash = '#/order?id=' + order.id; return; }

  app.innerHTML = `<div class="page">
    ${stepsBar('模拟支付')}
    <div class="card pay-panel">
      <span class="demo-badge">🔒 模拟支付环境 · 不会产生真实扣款</span>
      <div class="pay-amount">${yuan(order.total)}</div>
      <p style="color:var(--ink-dim);font-size:14px">订单号 ${order.id} · ${order.flight.no} · ${order.paxCount} 位乘客</p>
      <div class="pay-methods">
        <button class="pay-method on" data-pm="余额"><span class="pm-ico">🥭</span>芒果钱包</button>
        <button class="pay-method" data-pm="银行卡"><span class="pm-ico">💳</span>银行卡</button>
        <button class="pay-method" data-pm="第三方"><span class="pm-ico">📱</span>第三方支付</button>
      </div>
      <button class="btn btn-mango btn-lg btn-block" id="btnPay">确认支付（模拟）</button>
      <div class="pay-countdown" id="payCount"></div>
    </div>
  </div>`;

  $$('.pay-method').forEach(m => m.onclick = () => {
    $$('.pay-method').forEach(x => x.classList.remove('on'));
    m.classList.add('on');
  });

  let left = 900;
  clearInterval(payTimer);
  const tick = () => {
    if (left <= 0) { clearInterval(payTimer); toast('支付超时，订单仍在待支付状态', 'err'); return; }
    left--;
    $('#payCount').textContent = `支付剩余时间 ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  };
  tick(); payTimer = setInterval(tick, 1000);

  $('#btnPay').onclick = function () {
    this.disabled = true; this.textContent = '支付处理中…';
    setTimeout(() => {
      clearInterval(payTimer);
      const orders = getOrders();
      const o = orders.find(x => x.id === order.id);
      if (o) o.status = 'paid';
      saveOrders(orders);
      toast('模拟支付成功，已出票（演示）', 'ok');
      location.hash = '#/order?id=' + order.id + '&paid=1';
    }, 1400);
  };
}

/* ============================================================
   页面：订单详情
   ============================================================ */
function pageOrderDetail() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const order = getOrders().find(o => o.id === qs.get('id'));
  if (!order) { app.innerHTML = '<div class="card empty">订单不存在</div>'; return; }
  const fl = order.flight;
  const fa = getAirport(fl.from), ta = getAirport(fl.to);
  const justPaid = qs.get('paid');

  app.innerHTML = `<div class="page">
    ${justPaid ? stepsBar('购票完成') : ''}
    ${justPaid ? `<div class="card pay-panel" style="padding:34px">
        <div style="font-size:52px">🥭</div>
        <h2 style="margin:10px 0 6px">购票成功！</h2>
        <p style="color:var(--ink-dim)">模拟出票完成（演示环境，非真实客票）。里程将在行程完成后累计。</p>
      </div>` : ''}
    <div class="card pax-block" style="margin-top:16px">
      <h3>订单信息 <span class="status ${order.status}">${STATUS[order.status]}</span></h3>
      <table class="info-table">
        <tr><td>订单编号</td><td><b>${order.id}</b></td></tr>
        <tr><td>创建时间</td><td>${new Date(order.ts).toLocaleString('zh-CN')}</td></tr>
        <tr><td>航班</td><td>${fl.no} · ${esc(cityL(fa.code))} → ${esc(cityL(ta.code))}</td></tr>
        <tr><td>日期</td><td>${fl.depDate} ${fl.depTime} 起飞</td></tr>
        <tr><td>舱位</td><td>${order.cabinName}</td></tr>
        <tr><td>乘客</td><td>${order.paxList.map(p => esc(p.name)).join('、')}</td></tr>
        <tr><td>金额</td><td><b style="color:var(--mango);font-size:18px">${yuan(order.total)}</b></td></tr>
        <tr><td>预计里程</td><td>+${order.dist * order.paxCount} km（演示）</td></tr>
      </table>
      <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">
        ${order.status === 'pending' ? `<a class="btn btn-mango" href="#/pay?id=${order.id}">去支付</a>
          <button class="btn btn-ghost" id="cancelOrder">取消订单</button>` : ''}
        ${order.status === 'paid' ? `<button class="btn btn-ghost" id="refundOrder">模拟退票</button>` : ''}
        <a class="btn btn-ghost" href="#/orders">返回订单列表</a>
      </div>
    </div>
  </div>`;

  const co = $('#cancelOrder');
  if (co) co.onclick = () => showModal('取消订单', '确认取消该订单吗？取消后状态将变为「已取消」（演示操作）。', [
    { text: '再想想' },
    { text: '确认取消', style: 'btn-mango', fn: () => { updateOrderStatus(order.id, 'cancelled'); toast('订单已取消'); pageOrderDetail(); } },
  ]);
  const ro = $('#refundOrder');
  if (ro) ro.onclick = () => showModal('模拟退票', '确认对该订单执行模拟退票吗？退款金额为演示数据。', [
    { text: '再想想' },
    { text: '确认退票', style: 'btn-mango', fn: () => { updateOrderStatus(order.id, 'cancelled'); toast('模拟退票完成'); pageOrderDetail(); } },
  ]);
}

function updateOrderStatus(id, status) {
  const orders = getOrders();
  const o = orders.find(x => x.id === id);
  if (o) o.status = status;
  saveOrders(orders);
}

/* ============================================================
   页面：订单管理
   ============================================================ */
function pageOrders() {
  const tabs = [['all', '全部订单'], ['pending', '待支付'], ['paid', '已完成'], ['cancelled', '已取消']];
  let orders = getOrders();
  if (App.ordersTab !== 'all') orders = orders.filter(o => o.status === App.ordersTab);

  app.innerHTML = `<div class="page">
    <h1 style="font-size:24px;margin-top:16px;margin-bottom:22px">我的订单</h1>
    <div class="order-tabs">${tabs.map(([k, n]) => `<button class="chip ${App.ordersTab === k ? 'on' : ''}" data-ot="${k}">${n}</button>`).join('')}</div>
    <div id="orderList"></div>
    <div style="margin-top:8px"><span class="demo-badge">ℹ️ 订单保存在本地浏览器（演示环境）</span></div>
  </div>`;

  $$('.order-tabs .chip').forEach(c => c.onclick = () => { App.ordersTab = c.dataset.ot; pageOrders(); });

  const box = $('#orderList');
  if (!orders.length) {
    box.innerHTML = `<div class="card empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7Z"/><path d="M14 5v2M14 11v2M14 17v2"/></svg>
      暂无相关订单<br><a href="#/book" style="color:var(--mango);font-weight:700;display:inline-flex;align-items:center;min-height:44px">去订一张机票 →</a></div>`;
    return;
  }
  box.innerHTML = orders.map(o => {
    const fl = o.flight, fa = getAirport(fl.from), ta = getAirport(fl.to);
    return `<div class="card order-card" data-oid="${o.id}" role="button" tabindex="0">
      <div class="order-top">
        <span>订单号 ${o.id}</span>
        <span class="status ${o.status}">${STATUS[o.status]}</span>
      </div>
      <div class="order-route">
        ${esc(cityL(fa.code))}<span class="arrow">✈ →</span>${esc(cityL(ta.code))}
        <div class="order-amt"><b>${yuan(o.total)}</b><br><small style="color:var(--ink-faint)">${o.paxCount} 人 · ${o.cabinName}</small></div>
      </div>
      <div class="order-info">
        <span>${fl.no}</span><span>${fl.depDate} ${fl.depTime}</span><span>${fl.depTime} — ${fl.arrTime}</span>
      </div>
    </div>`;
  }).join('');
  $$('.order-card').forEach(c => {
    c.onclick = () => location.hash = '#/order?id=' + c.dataset.oid;
    c.onkeydown = e => { if (e.key === 'Enter') c.onclick(); };
  });
}

/* ============================================================
   页面：AI 智能低价推荐
   ============================================================ */
function pageAI() {
  const inp = App.aiInput || {
    from: App.search.from, to: App.search.to, date: App.search.depDate,
    allowTransfer: true, maxDur: 6, budget: 1500, cabin: 'economy', flexible: true, range: 3,
  };
  App.aiInput = inp;

  app.innerHTML = `<div class="page">
    <div class="ai-hero">
      <h1>Mango AI <em>Fare Finder</em></h1>
      <p class="sub">芒果智能寻价助手 · 基于本地模拟航班数据的可解释比价推荐</p>
      <p style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${apiStatusBadge()}<span class="demo-badge">🤖 演示环境：未接入真实票价 API，所有价格由本地数据计算</span></p>
    </div>

    <form class="card ai-form" id="aiForm" novalidate>
      <div class="form-grid">
        <div class="f-field" id="aiFF"><label for="aiFrom">出发城市</label><input id="aiFrom" autocomplete="off" value="${esc(cityDisplay(inp.from))}"><span class="f-err" id="aiErrFrom"></span><div class="city-menu" id="aiMenuFrom" style="display:none"></div></div>
        <div class="f-field" id="aiFT"><label for="aiTo">目的地</label><input id="aiTo" autocomplete="off" value="${esc(cityDisplay(inp.to))}"><span class="f-err" id="aiErrTo"></span><div class="city-menu" id="aiMenuTo" style="display:none"></div></div>
        <div class="f-field"><label for="aiDate">出发日期</label><input id="aiDate" type="date" min="${todayStr()}" value="${inp.date}"><span class="f-err" id="aiErrDate"></span></div>
        <div class="f-field"><label for="aiRange">灵活搜索范围</label>
          <select id="aiRange">${[1, 3, 5, 7].map(n => `<option value="${n}" ${inp.range === n ? 'selected' : ''}>前后 ${n} 天</option>`).join('')}</select></div>
        <div class="f-field"><label for="aiDur">最大飞行时长</label>
          <select id="aiDur">${[['2', '2 小时'], ['4', '4 小时'], ['6', '6 小时'], ['10', '10 小时'], ['99', '不限']].map(([v, n]) => `<option value="${v}" ${String(inp.maxDur) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="f-field"><label for="aiBudget">预算上限（每人）</label><input id="aiBudget" type="number" min="200" step="50" value="${inp.budget}"><span class="f-err" id="aiErrBudget"></span></div>
        <div class="f-field"><label for="aiCabin">舱位偏好</label>
          <select id="aiCabin">${CABINS.map(c => `<option value="${c.key}" ${inp.cabin === c.key ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="f-field" style="display:flex;flex-direction:column;gap:12px;justify-content:end;padding-bottom:20px">
          <label class="ai-switch"><input type="checkbox" id="aiTransfer" ${inp.allowTransfer ? 'checked' : ''}> 接受中转</label>
          <label class="ai-switch"><input type="checkbox" id="aiFlexible" ${inp.flexible ? 'checked' : ''}> 出发日期可灵活调整</label>
        </div>
      </div>
      <button type="submit" class="btn btn-mango btn-lg btn-block" style="margin-top:6px">✨ 开始智能寻价</button>
    </form>

    <div id="aiOutput" style="margin-top:24px"></div>
  </div>`;

  bindCityInput($('#aiFrom'), $('#aiMenuFrom'), () => inp.from, c => inp.from = c);
  bindCityInput($('#aiTo'), $('#aiMenuTo'), () => inp.to, c => inp.to = c);

  $('#aiForm').onsubmit = e => {
    e.preventDefault();
    const fa = AIRPORTS.find(a => $('#aiFrom').value.includes(a.code) || $('#aiFrom').value.trim().startsWith(a.city));
    const ta = AIRPORTS.find(a => $('#aiTo').value.includes(a.code) || $('#aiTo').value.trim().startsWith(a.city));
    let ok = true;
    $('#aiErrFrom').textContent = fa ? '' : (ok = false, '请选择出发城市');
    $('#aiErrTo').textContent = ta ? '' : (ok = false, '请选择目的地');
    if (fa && ta && fa.code === ta.code) { $('#aiErrTo').textContent = '出发与目的地不能相同'; ok = false; }
    if (!$('#aiDate').value) { $('#aiErrDate').textContent = '请选择出发日期'; ok = false; }
    const budget = +$('#aiBudget').value;
    if (!budget || budget < 200) { $('#aiErrBudget').textContent = '预算需不低于 ¥200'; ok = false; }
    if (!ok) { toast('请检查寻价条件', 'err'); return; }

    Object.assign(inp, {
      from: fa.code, to: ta.code, date: $('#aiDate').value,
      allowTransfer: $('#aiTransfer').checked, flexible: $('#aiFlexible').checked,
      maxDur: +$('#aiDur').value, budget, cabin: $('#aiCabin').value, range: +$('#aiRange').value,
    });
    recordHistory(inp.from, inp.to);
    runAIFinder();
  };

  if (App.aiResult && App.aiResult.inputKey === aiInputKey(inp)) renderAIResult();
}

function aiInputKey(i) { return [i.from, i.to, i.date, i.range, i.allowTransfer, i.maxDur, i.budget, i.cabin].join('|'); }

function runAIFinder() {
  const inp = App.aiInput;
  $('#aiOutput').innerHTML = `<div class="card ai-loading">
    <div class="ai-orb"></div>
    正在扫描前后 ${inp.range} 天共 ${(inp.range * 2 + 1)} 个出发日的航班数据，比较价格、时长与中转…</div>`;
  setTimeout(() => {
    const days = dataAdapter.findDeals({ ...inp, maxDuration: inp.maxDur * 60 });
    const cur = days.find(d => d.date === inp.date);
    const baseline = cur?.best ? { price: cabinOf(cur.best, inp.cabin).price, f: cur.best } : null;
    const valid = days.filter(d => d.best);
    const best = valid.length ? valid.reduce((a, b) => cabinOf(b.best, inp.cabin).price < cabinOf(a.best, inp.cabin).price ? b : a) : null;
    App.aiResult = { days, baseline, best, inputKey: aiInputKey(inp), inp: { ...inp } };
    renderAIResult();
  }, 900);
}

function renderAIResult() {
  const r = App.aiResult, inp = r.inp;
  const box = $('#aiOutput');
  if (!r.baseline) {
    box.innerHTML = `<div class="card empty">所选日期与预算条件下未找到可用航班。<br><small>试试提高预算、放宽时长或允许中转。</small></div>`;
    return;
  }
  const basePrice = r.baseline.price;
  const curD = r.days.find(d => d.date === inp.date);

  // 每日价格柱状图
  const allPrices = r.days.filter(d => d.best).map(d => cabinOf(d.best, inp.cabin).price);
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices);
  const chart = inp.flexible ? `<div class="card bar-chart">
    ${r.days.map(d => {
    if (!d.best) return `<div class="bar-col"><span>—</span><span style="min-height:8px"></span><span>${d.date.slice(5)}</span></div>`;
    const p = cabinOf(d.best, inp.cabin).price;
    const hPct = 22 + Math.round((1 - (p - minP) / Math.max(maxP - minP, 1)) * 78);
    const cheapest = p === minP, isCur = d.date === inp.date;
    return `<div class="bar-col" title="${d.date} ${yuan(p)}">
        <span class="bp ${cheapest ? 'low' : ''}">${p}</span>
        <div class="bar ${cheapest ? 'cheapest' : ''} ${isCur ? 'bar-cur' : ''}" style="height:${hPct}%"></div>
        <span>${d.date.slice(5)}${isCur ? '<br>所选' : ''}</span>
      </div>`;
  }).join('')}
  </div>` : '';

  // 推荐卡片
  const deals = r.days.filter(d => d.best && d.date !== inp.date)
    .map(d => ({ d, p: cabinOf(d.best, inp.cabin).price, save: basePrice - cabinOf(d.best, inp.cabin).price }))
    .filter(x => x.save > 0)
    .sort((a, b) => b.save - a.save).slice(0, 3);

  const curStopTxt = r.baseline.f.stops ? `中转 1 次（${cityL(r.baseline.f.via)}）` : '直飞';
  let recHTML = '';
  if (deals.length) {
    recHTML = `<div class="sec-head"><h2 class="sec-title">更省钱的方案</h2></div>` + deals.map(x => {
      const f = x.d.best, c = cabinOf(f, inp.cabin);
      const durDiff = f.durMin - r.baseline.f.durMin;
      const reasons = [];
      reasons.push(`比您所选 ${inp.date.slice(5)} 的方案（${yuan(basePrice)}）便宜 <b style="color:var(--ok)">${yuan(x.save)}</b>`);
      if (durDiff > 0) reasons.push(`但飞行时间多 ${Math.round(durDiff / 60 * 10) / 10} 小时`);
      else if (durDiff < 0) reasons.push(`且飞行时间还少 ${Math.round(-durDiff / 60 * 10) / 10} 小时`);
      reasons.push(f.stops ? '需接受中转' : '为直飞航班');
      if (f.depTime < '10:00') reasons.push('需早起出发（清晨航班通常更便宜）');
      return `<div class="card deal-card ${x.p === minP ? 'best' : ''}">
        <div class="deal-date"><b>${x.d.date.slice(5)}</b><small>周${weekOf(x.d.date)}</small></div>
        <div class="deal-body">
          <b>${f.no} · ${f.depTime} 出发 · ${f.stops ? '中转' : '直飞'} · ${durText(f.durMin)}</b>
          <div class="why">💡 ${reasons.join('；')}</div>
        </div>
        <div class="deal-save">
          <div class="sv">省 ${yuan(x.save)}</div>
          <div style="color:var(--ink-dim);font-size:13px">${yuan(x.p)}/人</div>
          <button class="btn btn-mango btn-sm" style="margin-top:8px" data-ai-pick="${f.id}">查看航班</button>
        </div>
      </div>`;
    }).join('');
    if (minP < basePrice) {
      recHTML += `<p style="color:var(--ink-dim);font-size:13.5px;margin:6px 4px 0">💡 综合结论：最低价出现在 <b style="color:var(--mango)">${r.days.find(d => d.best && cabinOf(d.best, inp.cabin).price === minP).date}</b>（${yuan(minP)}），比当前所选日期低 ${yuan(basePrice - minP)}。若您可灵活调整出发日期，建议优先考虑该日航班。</p>`;
    }
  } else {
    recHTML = `<div class="card" style="padding:22px;color:var(--ink-dim);font-size:14.5px">✅ 经过前后 ${inp.range} 天的全量比对，您当前选择的 <b style="color:var(--mango)">${inp.date}</b>（${curStopTxt}，${yuan(basePrice)}/人）已是搜索窗口内的最优价格，无需改期。</div>`;
  }

  box.innerHTML = `
    ${recHTML}
    <div class="sec-head" style="margin-top:30px"><h2 class="sec-title">所选日期价格走势</h2><span class="sec-sub">黄色为窗口内最低价 · 虚线框为当前所选日期</span></div>
    ${chart}
    <div class="card" style="padding:18px 22px;margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><b>${r.baseline.f.no}</b> · ${inp.date} ${r.baseline.f.depTime} 出发 · ${curStopTxt} · ${getCabin(inp.cabin).name} ${yuan(basePrice)}/人</div>
      <button class="btn btn-mango" data-ai-pick="${r.baseline.f.id}">预订该航班</button>
      <button class="btn btn-ghost" id="aiRerun">↻ 重新计算</button>
    </div>`;

  $('#aiRerun').onclick = runAIFinder;
  $$('[data-ai-pick]').forEach(b => b.onclick = () => {
    // 跳转去预订：把搜索上下文切到该航班
    Object.assign(App.search, { from: inp.from, to: inp.to, depDate: r.days.find(d => d.best && d.best.id === b.dataset.aiPick)?.date || inp.date, pax: App.search.pax, cabin: inp.cabin, trip: 'oneway' });
    App.filters = { sort: 'price', cabin: inp.cabin, priceMax: 0, depPeriod: '', stops: '', airline: '' };
    App._pendingPick = b.dataset.aiPick;
    location.hash = '#/results';
  });
}

/* ============================================================
   页面：会员个人中心
   ============================================================ */
function pageProfile() {
  const u = getUser();
  if (!u) {
    app.innerHTML = `<div class="page">
      <div class="card profile-head" style="justify-content:center;text-align:center">
        <div>
          <div class="avatar-lg" style="margin:0 auto 14px"><img src="assets/mango-logo.png" alt="芒果航空"></div>
          <h2>登录芒果航空</h2>
          <p style="color:var(--ink-dim);font-size:14px;margin:8px 0 20px">登录后可管理订单、累计里程、维护常用乘机人<br><span class="demo-badge">演示环境：本地存储模拟，非生产级认证系统</span></p>
          <a class="btn btn-mango btn-lg" href="#/login">登录 / 注册</a>
        </div>
      </div>
      ${profileSectionsHTML(false)}
    </div>`;
    bindProfileSections();
    return;
  }
  const lvl = memberLevel(), miles = totalMiles();
  const nextLvl = MEMBERSHIP.find(l => l.min > miles);
  app.innerHTML = `<div class="page">
    <div class="card profile-head">
      <div class="avatar-lg">${esc(u.nickname[0])}</div>
      <div>
        <h2 style="font-size:22px">${esc(u.nickname)}</h2>
        <span class="member-badge" style="background:${lvl.color}22;color:${lvl.color};border:1px solid ${lvl.color}55">${lvl.name}</span>
        <p style="color:var(--ink-dim);font-size:13px;margin-top:6px">${esc(u.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'))}</p>
      </div>
      <div class="miles-box">
        <b>${miles.toLocaleString('zh-CN')}</b>
        <span>累计里程（演示）</span>
        ${nextLvl ? `<small style="color:var(--ink-faint);font-size:11px">距 ${nextLvl.name} 还差 ${(nextLvl.min - miles).toLocaleString('zh-CN')}</small>` : '<small style="color:var(--mango);font-size:11px">已达最高等级</small>'}
      </div>
    </div>
    <div class="section">
      <div class="menu-grid">
        <a class="menu-tile" href="#/orders"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7Z"/></svg>我的订单<small>查看全部订单状态</small></a>
        <button class="menu-tile" id="tilePax"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.4 3.8-5 6.5-5s5.3 1.6 6.5 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 15.2c2.4.2 4.4 1.6 5.5 4.8"/></svg>常用乘机人<small>${getPassengers().length} 位已保存</small></button>
        <button class="menu-tile" id="tileFav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7.5-4.7-9.5-9C1 8.5 3 5 6.5 5c2.2 0 3.8 1.2 5.5 3.2C13.7 6.2 15.3 5 17.5 5 21 5 23 8.5 21.5 12c-2 4.3-9.5 9-9.5 9Z"/></svg>我的收藏<small>${getFavs().length} 条收藏航线</small></button>
        <button class="menu-tile" id="tileHist"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>浏览记录<small>最近查看的航线</small></button>
        <button class="menu-tile" id="tileMsg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>消息通知<small>2 条未读（演示）</small></button>
        <button class="menu-tile" id="tileCs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>官方客服<small>7×24 在线答疑</small></button>
        <button class="menu-tile" id="tileFb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/></svg>意见反馈<small>帮助我们改进</small></button>
        <button class="menu-tile" id="tileSet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>设置<small>清除本地演示数据</small></button>
        <button class="menu-tile" id="tileOut"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>退出登录</button>
      </div>
    </div>
    ${profileSectionsHTML(true)}
  </div>`;

  $('#tilePax').onclick = () => $('#secPax').scrollIntoView({ behavior: 'smooth' });
  $('#tileFav').onclick = () => $('#secFav').scrollIntoView({ behavior: 'smooth' });
  $('#tileHist').onclick = () => $('#secHist').scrollIntoView({ behavior: 'smooth' });
  $('#tileMsg').onclick = () => showModal('消息通知', '1. 欢迎乘坐芒果航空！使用 AI 低价功能，帮您找到更划算的出发日。<br>2. 您关注的航线价格有波动（模拟消息）。', [{ text: '知道了', style: 'btn-mango' }]);
  $('#tileCs').onclick = () => { if (typeof MangoService !== 'undefined') MangoService.open(); };
  $('#tileFb').onclick = () => showModal('意见反馈', `<textarea id="fbText" rows="4" style="width:100%;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;color:var(--ink);padding:12px;resize:vertical" placeholder="写下您的建议…"></textarea>`,
    [{ text: '取消' }, { text: '提交', style: 'btn-mango', fn: () => toast('感谢反馈（演示环境，不会真实发送）', 'ok') }]);
  $('#tileSet').onclick = () => showModal('设置', '清除本地保存的订单、乘机人、收藏与浏览记录？登录状态不受影响。',
    [{ text: '取消' }, { text: '清除', style: 'btn-mango', fn: () => { ['orders', 'passengers', 'favs', 'history'].forEach(k => store.del(k)); toast('本地演示数据已清除', 'ok'); pageProfile(); } }]);
  $('#tileOut').onclick = () => showModal('退出登录', '确定要退出当前账号吗？', [
    { text: '取消' }, { text: '退出', style: 'btn-mango', fn: () => { store.del('user'); toast('已退出登录'); router(); } },
  ]);
  bindProfileSections();
}

function profileSectionsHTML(logged) {
  const favs = getFavs(), hist = getHistory(), paxs = getPassengers();
  return `
    <div class="section" id="secPax">
      <div class="sec-head"><h2 class="sec-title">常用乘机人</h2></div>
      <div class="card">
        ${paxs.length ? paxs.map((p, i) => `<div class="list-item">
          <div><div class="li-title">${esc(p.name)}</div><div class="li-sub">${esc(p.idType)} · 尾号 ${esc(p.idNo.slice(-4))}</div></div>
          <button class="icon-btn" data-delpax="${i}" aria-label="删除乘机人">🗑</button>
        </div>`).join('') : '<div class="empty" style="padding:26px">暂无常用乘机人，订票时可勾选保存</div>'}
      </div>
    </div>
    <div class="section" id="secFav">
      <div class="sec-head"><h2 class="sec-title">我的收藏航线</h2></div>
      <div class="route-grid">${favs.length ? favs.slice(0, 4).map(x => routeCardHTML(x.from, x.to)).join('') : '<div class="card empty" style="grid-column:1/-1;padding:26px">暂无收藏，去<a href="#/routes" style="color:var(--mango);display:inline-flex;align-items:center;min-height:44px">航线页</a>看看吧</div>'}</div>
    </div>
    <div class="section" id="secHist">
      <div class="sec-head"><h2 class="sec-title">浏览记录</h2><span class="sec-sub">最近 10 条搜索（本地保存）</span></div>
      <div class="card">
        ${hist.length ? hist.map(h => `<div class="list-item" role="button" tabindex="0" data-hist="${h.from}-${h.to}" style="cursor:pointer">
          <div><div class="li-title">${esc(cityL(h.from))} → ${esc(cityL(h.to))}</div><div class="li-sub">${new Date(h.ts).toLocaleString('zh-CN')}</div></div>
          <span style="color:var(--mango);font-size:13px">再查一次 →</span>
        </div>`).join('') : '<div class="empty" style="padding:26px">暂无浏览记录</div>'}
      </div>
    </div>`;
}

function bindProfileSections() {
  $$('[data-delpax]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const paxs = getPassengers(); paxs.splice(+b.dataset.delpax, 1); store.set('passengers', paxs);
    toast('已删除'); pageProfile();
  });
  $$('[data-hist]').forEach(el => el.onclick = () => {
    const [f, t] = el.dataset.hist.split('-');
    App.search.from = f; App.search.to = t;
    location.hash = '#/results';
  });
  bindRouteCards(app);
}

/* ============================================================
   页面：登录 / 注册
   ============================================================ */
function pageLogin() {
  const tab = App.authTab;
  app.innerHTML = `<div class="page">
    <div class="card auth-wrap">
      <div style="text-align:center;margin-bottom:20px">
        <img src="assets/mango-logo.png" alt="芒果航空" style="width:80px;margin:0 auto 8px">
        <h2 style="letter-spacing:2px">芒果航空会员</h2>
      </div>
      <div class="auth-tabs">
        <button data-at="login" class="${tab === 'login' ? 'on' : ''}">登录</button>
        <button data-at="register" class="${tab === 'register' ? 'on' : ''}">注册</button>
      </div>
      <form id="authForm" novalidate>
        ${tab === 'register' ? `<div class="f-field" style="margin-bottom:14px"><label for="auNick">昵称</label><input id="auNick" placeholder="2~12 位昵称"><span class="f-err" id="errNick"></span></div>` : ''}
        <div class="f-field" style="margin-bottom:14px"><label for="auPhone">手机号</label><input id="auPhone" type="tel" maxlength="11" placeholder="11 位手机号"><span class="f-err" id="errPhone"></span></div>
        <div class="f-field" style="margin-bottom:14px"><label for="auPwd">密码</label><input id="auPwd" type="password" placeholder="至少 6 位"><span class="f-err" id="errPwd"></span></div>
        ${tab === 'register' ? `<div class="f-field" style="margin-bottom:14px"><label for="auPwd2">确认密码</label><input id="auPwd2" type="password" placeholder="再次输入密码"><span class="f-err" id="errPwd2"></span></div>` : ''}
        <button class="btn btn-mango btn-lg btn-block" type="submit">${tab === 'login' ? '登录' : '注册并登录'}</button>
      </form>
      <p class="auth-note">🔒 演示环境：账号仅保存在本地浏览器，非生产级身份认证系统</p>
    </div>
  </div>`;

  $$('.auth-tabs button').forEach(b => b.onclick = () => { App.authTab = b.dataset.at; pageLogin(); });
  $('#auPhone').value = getUser()?.phone || '';

  $('#authForm').onsubmit = e => {
    e.preventDefault();
    const phone = $('#auPhone').value.trim(), pwd = $('#auPwd').value;
    let ok = true;
    const setE = (id, m) => { $(id).textContent = m; if (m) ok = false; };
    if (!/^1[3-9]\d{9}$/.test(phone)) setE('#errPhone', '请输入 11 位有效手机号'); else setE('#errPhone', '');
    if (pwd.length < 6) setE('#errPwd', '密码至少 6 位'); else setE('#errPwd', '');
    let nickname = '';
    if (tab === 'register') {
      nickname = $('#auNick').value.trim();
      if (nickname.length < 2 || nickname.length > 12) setE('#errNick', '昵称需 2~12 个字符'); else setE('#errNick', '');
      if (pwd !== $('#auPwd2').value) setE('#errPwd2', '两次输入的密码不一致'); else setE('#errPwd2', '');
    }
    if (!ok) { toast('请修正表单错误', 'err'); return; }

    if (tab === 'register') {
      const users = store.get('users', {});
      if (users[phone]) { setE('#errPhone', '该手机号已注册，请直接登录'); return; }
      users[phone] = { pwd, nickname };
      store.set('users', users);
      store.set('user', { phone, nickname });
      toast('注册成功，欢迎加入芒果航空！', 'ok');
    } else {
      const users = store.get('users', {});
      if (users[phone] && users[phone].pwd !== pwd) { setE('#errPwd', '密码错误'); return; }
      const nickname = users[phone]?.nickname || '芒果旅客' + phone.slice(-4);
      store.set('user', { phone, nickname });
      toast('登录成功', 'ok');
    }
    location.hash = '#/profile';
  };
}

/* ============================================================
   页面：航线与目的地
   ============================================================ */
function pageRoutes() {
  const popular = [
    ['PEK', 'SHA'], ['PEK', 'CAN'], ['PEK', 'CTU'], ['PEK', 'SYX'],
    ['SHA', 'CTU'], ['SHA', 'SZX'], ['SHA', 'KMG'], ['SHA', 'SYX'],
    ['CAN', 'URC'], ['CTU', 'LXA'], ['SZX', 'XIY'], ['HGH', 'HRB'],
  ];
  const dests = [...new Set(AIRPORTS.map(a => cityL(a.code)))];
  app.innerHTML = `<div class="page">
    <h1 style="font-size:26px;letter-spacing:1px;margin-bottom:8px">航线与目的地</h1>
    <p style="color:var(--ink-dim);font-size:14px;margin-bottom:18px">芒果航空网络覆盖 ${AIRPORTS.length} 座城市（演示航线网络） · 点击航线卡片即可搜索</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px">
      ${dests.map(c => `<span class="tag">${esc(c)}</span>`).join('')}
    </div>
    <div class="sec-head"><h2 class="sec-title">热门航线</h2><span class="demo-badge">模拟票价</span></div>
    <div class="route-grid">${popular.map(([f, t]) => routeCardHTML(f, t)).join('')}</div>
  </div>`;
  bindRouteCards(app);
}

/* ============================================================
   页面：品牌介绍
   ============================================================ */
function pageBrand() {
  app.innerHTML = `<div class="page">
    <h1 style="font-size:26px;letter-spacing:1px;margin-bottom:20px">品牌介绍</h1>
    <div class="card slogan-panel">
      <div class="slogan-img"><img src="assets/slogan.png" alt="芒果航空品牌口号：芒行天际，奔赴山海"></div>
      <div>
        <h2 class="sec-title" style="margin-bottom:14px">芒行天际，奔赴山海</h2>
        <p style="color:var(--ink-dim);font-size:15px">芒果航空（Mango Air）是一家以「温暖、轻快、可负担」为基因的虚拟演示航司。我们相信飞行不该是昂贵的距离——一抹芒果金，就能点亮整片深蓝天空。</p>
        <p style="color:var(--ink-dim);font-size:15px;margin-top:10px">从清晨第一班短途摆渡，到跨越高原的长航宽体，芒果航空用年轻机队与贴心舱享，陪伴每一位旅客奔赴自己的山海。</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><span class="tag gold">年轻机队</span><span class="tag gold">透明定价</span><span class="tag gold">温暖服务</span></div>
      </div>
    </div>

    <section class="section">
      <div class="sec-head"><h2 class="sec-title">芒果机队</h2><span class="demo-badge">机队演示数据</span></div>
      <div class="two-col">
        <div class="fleet-img"><img src="assets/plane.jpg" alt="芒果航空 A321neo 客机" loading="lazy"></div>
        <div class="card" style="padding:24px">
          <table class="fleet-table">
            <tr><th>机型</th><th>座位数</th><th>最大航程</th></tr>
            ${FLEET.map(f => `<tr><td><b>${f.model}</b></td><td>${f.seats}</td><td>${f.range}</td></tr>`).join('')}
          </table>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card alliance-panel">
        <div class="alliance-logo-box"><img src="assets/alliance-logo.png" alt="天和联盟标志"></div>
        <div>
          <h2 class="sec-title" style="margin-bottom:14px">天和联盟</h2>
          <p style="color:var(--ink-dim);font-size:15px">芒果航空是天和联盟的品牌演示成员。天和联盟以深蓝色航迹为标志，象征跨越山海的连接。成员航司间共享枢纽机场、互认常旅客里程，并提供贵宾厅与中转保障互通。</p>
          <p style="margin-top:14px"><span class="demo-badge">ℹ️ 联盟合作关系为品牌演示设定，非现实联盟认证</span></p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card" style="padding:26px">
        <h3 style="margin-bottom:10px">声明</h3>
        <p style="color:var(--ink-faint);font-size:13px;line-height:1.9">本网站为芒果航空 Mango Air 品牌演示站点。页面中的航班、时刻、票价、余票、准点率、机队与联盟信息均为虚构演示数据，不构成真实航空运输服务或要约。本站不接入真实支付、不出具真实客票。如需乘坐真实航班，请前往真实航空公司官方渠道。</p>
      </div>
    </section>
  </div>`;
}

/* ---------- 页面：设置 ---------- */
function apiStatusBadge() {
  if (typeof FlightAPI === 'undefined') return '<span class="src-badge demo">演示数据</span>';
  const s = FlightAPI.getStatus();
  if (s.mode === 'api' && s.status === 'live') return `<span class="src-badge live">API 实时 · ${esc(s.endpoint.length > 34 ? s.endpoint.slice(0, 34) + '…' : s.endpoint)}</span>`;
  if (s.mode === 'api' && s.status === 'fallback') return '<span class="src-badge fallback">API 降级 · 演示数据</span>';
  return '<span class="src-badge demo">演示数据（Mock）</span>';
}
function refreshSourceBadges() {
  $$('.src-badge').forEach(b => {
    const fresh = document.createElement('div');
    fresh.innerHTML = apiStatusBadge();
    b.replaceWith(fresh.firstChild);
  });
  const foot = $('#footSource');
  if (foot && typeof FlightAPI !== 'undefined') {
    const s = FlightAPI.getStatus();
    foot.textContent = s.mode === 'api' ? (s.status === 'fallback' ? 'API 降级（演示数据）' : 'API 实时数据') : '演示数据';
  }
}
function csStatusBadge() {
  if (typeof MangoService === 'undefined') return '<span class="src-badge demo">本地知识库客服</span>';
  const s = MangoService.getStatus();
  if (s.mode === 'ai') {
    return s.lastOkAt
      ? `<span class="src-badge live">AI 客服在线 · ${esc((s.model || '').slice(0, 24))}</span>`
      : '<span class="src-badge fallback">AI 已配置 · 待验证</span>';
  }
  return '<span class="src-badge demo">本地知识库客服</span>';
}
function pageSettings() {
  const langBtns = (typeof LANGUAGES !== 'undefined' ? LANGUAGES : [{ code: 'zh', label: '简体中文' }]).map(l =>
    `<button class="lang-btn ${App.lang === l.code ? 'active' : ''}" data-lang="${l.code}">
       <span>${esc(l.label)}</span><span class="lang-code">${l.code.toUpperCase()}</span>
     </button>`).join('');
  const themeSeg = ['dark', 'light', 'system'].map(m =>
    `<button data-theme-opt="${m}" class="${App.theme === m ? 'active' : ''}">${t({ dark: '深色模式', light: '浅色模式', system: '跟随系统' }[m])}</button>`).join('');
  const apiCfg = (typeof FlightAPI !== 'undefined') ? FlightAPI.getConfig() : { enabled: false, endpoint: '', apiKey: '', provider: 'demo' };
  const apiSt = (typeof FlightAPI !== 'undefined') ? FlightAPI.getStatus() : { mode: 'mock', status: 'demo' };
  const csCfg = (typeof MangoService !== 'undefined') ? MangoService.getConfig() : { enabled: false, endpoint: '', model: '', apiKey: '' };
  app.innerHTML = `<div class="page">
    <h1 style="font-size:26px;letter-spacing:1px;margin-bottom:8px">${t('设置 ')}</h1>
    <p style="color:var(--ink-dim);font-size:14px;margin-bottom:18px">${t('当前设置已保存到本地浏览器')} · v1.4</p>
    <div class="settings-list">
      <div class="set-group-title">${t('数据源')}</div>
      <div class="set-row" style="flex-direction:column;align-items:stretch;gap:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><div class="set-label">${t('API 数据源')}</div><div class="set-sub">${t('对接真实航班数据接口。未启用时使用本地演示数据。')}</div></div>
          ${apiStatusBadge()}
        </div>
        <label class="f-label" for="apiEndpoint">${t('API 端点地址')}</label>
        <input class="f-input" id="apiEndpoint" type="url" placeholder="${t('例如 https://your-server.com/api/flights')}" value="${esc(apiCfg.endpoint)}">
        <label class="f-label" for="apiKey">${t('API Key（可选）')}</label>
        <input class="f-input" id="apiKey" type="password" placeholder="${t('通过 X-API-Key 请求头发送')}" value="${esc(apiCfg.apiKey)}">
        <label class="f-label" for="apiProvider">${t('数据提供商标识')}</label>
        <input class="f-input" id="apiProvider" type="text" placeholder="demo" value="${esc(apiCfg.provider || '')}">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-ghost btn-sm" id="apiTest">${t('测试连接')}</button>
          <button class="btn btn-mango btn-sm" id="apiSave">${t('保存并启用')}</button>
          <span id="apiTestResult" style="font-size:12.5px;color:var(--ink-dim)"></span>
        </div>
        <div style="background:var(--glass);border:1px solid var(--line);border-radius:12px;padding:12px 14px">
          <div class="set-label" style="margin-bottom:6px">${t('关于对接')}</div>
          <p style="color:var(--ink-faint);font-size:12.5px;line-height:1.85;margin:0">${t('「天和联盟」为芒果航空品牌演示中的虚构联盟，现实并不存在该联盟，因此不存在可对接的「现实天和联盟航班」。本设置对接的是标准航班数据接口：任何返回标准航班 JSON 的端点（真实航司 API、GDS/NDC 聚合或自建后端）均可接入，字段约定见 js/api.js 顶部注释。请求失败将自动降级为本地演示数据。')}</p>
        </div>
      </div>
      <div class="set-group-title">${t('官方客服')}</div>
      <div class="set-row" style="flex-direction:column;align-items:stretch;gap:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><div class="set-label">${t('官方客服 AI 通道')}</div><div class="set-sub">${t('默认豆包免费模型 doubao-seed-2-1-pro-260915，免费额度内零成本；未配置或连接失败时自动使用本地知识库客服，对话不中断。')}</div></div>
          ${csStatusBadge()}
        </div>
        <label class="f-label" for="aiEndpoint">${t('AI 客服端点地址')}</label>
        <input class="f-input" id="aiEndpoint" type="url" placeholder="${t('例如 https://ark.cn-beijing.volces.com/api/v3')}" value="${esc(csCfg.endpoint)}">
        <label class="f-label" for="aiModel">${t('模型名称')}</label>
        <input class="f-input" id="aiModel" type="text" placeholder="${t('例如 doubao-seed-2-1-pro-260915')}" value="${esc(csCfg.model)}">
        <label class="f-label" for="aiKey">${t('API Key')}</label>
        <input class="f-input" id="aiKey" type="password" placeholder="${t('以 Bearer 方式随请求发送')}" value="${esc(csCfg.apiKey)}">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-ghost btn-sm" id="aiTest">${t('测试客服连接')}</button>
          <button class="btn btn-mango btn-sm" id="aiSave">${t('保存并启用')}</button>
          <span id="aiTestResult" style="font-size:12.5px;color:var(--ink-dim)"></span>
        </div>
        <div style="background:var(--glass);border:1px solid var(--line);border-radius:12px;padding:12px 14px">
          <div class="set-label" style="margin-bottom:6px">${t('关于官方客服')}</div>
          <p style="color:var(--ink-faint);font-size:12.5px;line-height:1.85;margin:0">${t('客服悬浮入口位于页面右下角。AI 通道对接 OpenAI 兼容的 chat completions 接口（默认豆包免费模型 doubao-seed-2-1-pro-260915，回答简短以节省 Token）；请求失败或未配置时自动降级为本地知识库客服。会话记录仅保存在本机浏览器。')}</p>
        </div>
      </div>
      <div class="set-group-title">${t('语言')}</div>
      <div class="set-row" style="flex-direction:column;align-items:stretch;gap:12px">
        <div class="lang-grid">${langBtns}</div>
      </div>
      <div class="set-group-title">${t('主题')}</div>
      <div class="set-row">
        <div><div class="set-label">${t('主题')}</div><div class="set-sub">${t('深色模式')} · ${t('浅色模式')} · ${t('跟随系统')}</div></div>
        <div class="seg">${themeSeg}</div>
      </div>
      <div class="set-group-title">${t('动画效果')}</div>
      <div class="set-row">
        <div><div class="set-label">${t('动画效果')}</div><div class="set-sub">${t('开启动画与过渡效果')}</div></div>
        <label class="switch"><input type="checkbox" id="animToggle" ${App.animation ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="set-group-title">${t('关于')}</div>
      <div class="set-row" style="flex-direction:column;align-items:stretch;gap:12px">
        <p style="color:var(--ink-faint);font-size:13px;line-height:1.9">${t('本网站为芒果航空 Mango Air 品牌演示站点（版本 v1.4）。页面中的航班、时刻、票价、余票、准点率、机队与联盟信息均为虚构演示数据，不构成真实航空运输服务或要约。本站不接入真实支付、不出具真实客票。如需乘坐真实航班，请前往真实航空公司官方渠道。')}</p>
        <button class="btn btn-ghost danger-btn" id="clearData">${t('立即清除')}</button>
      </div>
    </div>
  </div>`;
  $$('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
  $$('[data-theme-opt]').forEach(b => b.onclick = () => { setTheme(b.dataset.themeOpt); router(); });
  const at = $('#animToggle');
  if (at) at.onchange = (e) => {
    App.animation = e.target.checked; store.set('animation', App.animation);
    document.body.classList.toggle('no-anim', !App.animation);
  };
  const cd = $('#clearData');
  if (cd) cd.onclick = () => showModal(t('清除本地数据'), t('清除所有本地保存的订单、账号、乘机人与偏好'), [
    { text: t('再想想'), style: 'btn-ghost' },
    { text: t('立即清除'), style: 'btn-mango', fn: () => {
        ['user', 'orders', 'passengers', 'favs', 'history', 'lang', 'theme', 'animation'].forEach(k => store.del(k));
        toast(t('数据已清除')); location.hash = '#/home';
    } },
  ]);
  /* ---- API 数据源交互 ---- */
  const epInput = $('#apiEndpoint'), keyInput = $('#apiKey'), pvInput = $('#apiProvider');
  const testBtn = $('#apiTest'), saveBtn = $('#apiSave'), testRes = $('#apiTestResult');
  if (testBtn) testBtn.onclick = () => {
    if (typeof FlightAPI === 'undefined') return;
    testRes.textContent = t('正在测试连接…');
    testRes.style.color = 'var(--ink-dim)';
    FlightAPI.setConfig({ endpoint: epInput.value.trim(), apiKey: keyInput.value.trim(), provider: pvInput.value.trim() || 'demo', enabled: false });
    FlightAPI.testConnection().then(r => {
      testRes.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
      testRes.style.color = r.ok ? 'var(--ok)' : 'var(--danger)';
    });
  };
  if (saveBtn) saveBtn.onclick = () => {
    if (typeof FlightAPI === 'undefined') return;
    const endpoint = epInput.value.trim();
    if (!endpoint) { toast(t('请先填写 API 端点地址')); epInput.focus(); return; }
    FlightAPI.setConfig({ endpoint, apiKey: keyInput.value.trim(), provider: pvInput.value.trim() || 'demo', enabled: true });
    toast(t('已启用 API 数据源，正在验证…'));
    FlightAPI.testConnection().then(r => {
      if (r.ok) { toast(t('API 数据源已启用')); refreshSourceBadges(); }
      else { toast(t('连接失败，已切换为演示数据') + '：' + r.message); refreshSourceBadges(); }
    });
  };
  /* ---- 官方客服 AI 通道交互 ---- */
  const csEp = $('#aiEndpoint'), csModel = $('#aiModel'), csKey = $('#aiKey');
  const csTest = $('#aiTest'), csSave = $('#aiSave'), csRes = $('#aiTestResult');
  if (csTest) csTest.onclick = () => {
    if (typeof MangoService === 'undefined') return;
    csRes.textContent = t('正在测试连接…');
    csRes.style.color = 'var(--ink-dim)';
    MangoService.setConfig({ endpoint: csEp.value.trim(), model: csModel.value.trim() || 'doubao-seed-2-1-pro-260915', apiKey: csKey.value.trim(), enabled: false });
    MangoService.testConnection().then(r => {
      csRes.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
      csRes.style.color = r.ok ? 'var(--ok)' : 'var(--danger)';
    });
  };
  if (csSave) csSave.onclick = () => {
    if (typeof MangoService === 'undefined') return;
    const endpoint = csEp.value.trim();
    if (!endpoint) { toast(t('请先填写 AI 客服端点地址')); csEp.focus(); return; }
    MangoService.setConfig({ endpoint, model: csModel.value.trim() || 'doubao-seed-2-1-pro-260915', apiKey: csKey.value.trim(), enabled: true });
    toast(t('客服配置已保存，AI 通道已启用'));
    csRes.textContent = '';
    MangoService.testConnection().then(r => {
      csRes.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
      csRes.style.color = r.ok ? 'var(--ok)' : 'var(--danger)';
    });
  };
}

/* ---------- 移动端软键盘避让 ---------- */
/* 输入控件聚焦弹出软键盘后，延迟滚动到可视区中央，避免关键操作被键盘遮挡 */
(function () {
  const SEL = 'input, select, textarea';
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches(SEL)) return;
    // date/datetime 输入会拉起系统选择器，无需滚动
    const t = (el.type || '').toLowerCase();
    if (t === 'date' || t === 'datetime-local' || t === 'time') return;
    setTimeout(() => {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { el.scrollIntoView(); }
    }, 300);
  });
})();

/* ---------- 启动 ---------- */
setTheme(App.theme);
document.documentElement.lang = (typeof LOCALE_MAP !== 'undefined' && LOCALE_MAP[App.lang]) || App.lang;
router();
refreshSourceBadges();
if (typeof MangoService !== 'undefined') MangoService.init();
