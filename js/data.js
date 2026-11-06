/* ============================================================
   芒果航空 Mango Air · 数据层
   说明：所有航班、票价、余票均为【本地模拟数据】，
   通过 dataAdapter 暴露接口，后续可替换为真实 API。
   ============================================================ */

'use strict';

/* ---------- 机场数据（模拟航线网络 · 36 城） ---------- */
const AIRPORTS = [
  { code: 'PEK', city: '北京', apt: '大兴', x: 39.5, y: 116.4, hub: true },
  { code: 'SHA', city: '上海', apt: '虹桥', x: 31.2, y: 121.3, hub: true },
  { code: 'CAN', city: '广州', apt: '白云', x: 23.4, y: 113.3, hub: true },
  { code: 'SZX', city: '深圳', apt: '宝安', x: 22.6, y: 113.8 },
  { code: 'CTU', city: '成都', apt: '天府', x: 30.3, y: 104.4, hub: true },
  { code: 'HGH', city: '杭州', apt: '萧山', x: 30.2, y: 120.4 },
  { code: 'XIY', city: '西安', apt: '咸阳', x: 34.4, y: 108.8, hub: true },
  { code: 'CKG', city: '重庆', apt: '江北', x: 29.7, y: 106.6 },
  { code: 'KMG', city: '昆明', apt: '长水', x: 25.1, y: 102.9, hub: true },
  { code: 'SYX', city: '三亚', apt: '凤凰', x: 18.3, y: 109.4 },
  { code: 'HAK', city: '海口', apt: '美兰', x: 19.9, y: 110.5 },
  { code: 'XMN', city: '厦门', apt: '高崎', x: 24.5, y: 118.1 },
  { code: 'TAO', city: '青岛', apt: '胶东', x: 36.4, y: 120.4 },
  { code: 'NKG', city: '南京', apt: '禄口', x: 31.7, y: 118.9 },
  { code: 'WUH', city: '武汉', apt: '天河', x: 30.8, y: 114.2 },
  { code: 'CSX', city: '长沙', apt: '黄花', x: 28.2, y: 113.2 },
  { code: 'URC', city: '乌鲁木齐', apt: '地窝堡', x: 43.9, y: 87.5 },
  { code: 'HRB', city: '哈尔滨', apt: '太平', x: 45.6, y: 126.6 },
  { code: 'LXA', city: '拉萨', apt: '贡嘎', x: 29.3, y: 90.9 },
  { code: 'DLC', city: '大连', apt: '周水子', x: 38.9, y: 121.5 },
  { code: 'CGO', city: '郑州', apt: '新郑', x: 34.7, y: 113.6 },
  { code: 'TSN', city: '天津', apt: '滨海', x: 39.1, y: 117.3 },
  { code: 'SHE', city: '沈阳', apt: '桃仙', x: 41.6, y: 123.5 },
  { code: 'CGQ', city: '长春', apt: '龙嘉', x: 43.9, y: 125.3 },
  { code: 'TYN', city: '太原', apt: '武宿', x: 37.7, y: 112.6 },
  { code: 'HET', city: '呼和浩特', apt: '白塔', x: 40.8, y: 111.8 },
  { code: 'INC', city: '银川', apt: '河东', x: 38.3, y: 106.4 },
  { code: 'XNN', city: '西宁', apt: '曹家堡', x: 36.5, y: 102.0 },
  { code: 'KWE', city: '贵阳', apt: '龙洞堡', x: 26.5, y: 106.8 },
  { code: 'NNG', city: '南宁', apt: '吴圩', x: 22.6, y: 108.2 },
  { code: 'FOC', city: '福州', apt: '长乐', x: 26.0, y: 119.3 },
  { code: 'WNZ', city: '温州', apt: '龙湾', x: 27.9, y: 120.8 },
  { code: 'KHN', city: '南昌', apt: '昌北', x: 28.9, y: 115.9 },
  { code: 'LJG', city: '丽江', apt: '三义', x: 26.7, y: 100.3 },
  { code: 'JHG', city: '西双版纳', apt: '嘎洒', x: 22.0, y: 100.8 },
  { code: 'DNH', city: '敦煌', apt: '敦煌', x: 40.1, y: 94.7 },
];

/* 天和联盟枢纽机场（中转均经由联盟枢纽） */
const ALLIANCE_HUBS = AIRPORTS.filter(a => a.hub).map(a => a.code);

const CABINS = [
  { key: 'economy',  name: '经济舱',     mult: 1.0,  bag: '20kg 托运 + 7kg 手提' },
  { key: 'premium',  name: '超级经济舱', mult: 1.6,  bag: '25kg 托运 + 7kg 手提' },
  { key: 'business', name: '商务舱',     mult: 2.8,  bag: '30kg 托运 + 2×8kg 手提' },
  { key: 'first',    name: '头等舱',     mult: 4.2,  bag: '40kg 托运 + 2×8kg 手提' },
];

const FLEET = [
  { model: '空中客车 A321neo', seats: 214, range: '7,400 km', note: '芒果航空主力机型，执飞国内干线' },
  { model: '空中客车 A320neo', seats: 174, range: '6,300 km', note: '高经济性单通道客机' },
  { model: '空中客车 A330-300', seats: 287, range: '11,750 km', note: '宽体客机，执飞高原与远程航线' },
  { model: '空中客车 A350-900', seats: 303, range: '15,000 km', note: '旗舰宽体客机，洲际航线' },
];

/* ---------- 工具函数 ---------- */
function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 伪随机数生成器（可复现，保证同一查询结果稳定）
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
function weekOf(s) { return '日一二三四五六'[parseDate(s).getDay()]; }

function getAirport(code) { return AIRPORTS.find(a => a.code === code); }
function getCabin(key) { return CABINS.find(c => c.key === key) || CABINS[0]; }

// 球面距离（km）
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a.x, a.y, b.x, b.y].map(v => v * rad);
  const dLa = la2 - la1, dLo = lo2 - lo1;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

/* ---------- 航班生成引擎（模拟数据） ---------- */
function genFlights(fromCode, toCode, dateStr) {
  const from = getAirport(fromCode), to = getAirport(toCode);
  if (!from || !to || fromCode === toCode) return [];
  const dist = distanceKm(from, to);
  const rng = seededRandom(hashCode(`MA|${fromCode}|${toCode}|${dateStr}`));
  const basePrice = 180 + dist * 0.42;
  const baseDurMin = Math.round(dist / 820 * 60 + 35);
  const count = 20 + Math.floor(rng() * 9); // 20~28 班（v1.1 加密）
  const flights = [];
  const usedNo = new Set();

  // 中转概率：支线↔支线最高（联盟中转网络），干线次之
  const transferProb = (!from.hub && !to.hub) ? 0.5 : (dist > 1500 ? 0.3 : 0.16);
  const viaPool = ALLIANCE_HUBS.filter(h => h !== fromCode && h !== toCode);

  for (let i = 0; i < count; i++) {
    // 起飞时刻全天均匀铺开 06:00 ~ 21:30
    const depMin = 360 + Math.floor((i + rng() * 0.85) * (930 / count));
    const depH = Math.floor(depMin / 60), depM = depMin % 60;

    // 中转判定：均经由天和联盟枢纽
    let stops = 0, via = null, durMin = baseDurMin;
    if (dist > 700 && viaPool.length && rng() < transferProb) {
      stops = 1;
      via = viaPool[Math.floor(rng() * viaPool.length)];
      durMin = baseDurMin + 75 + Math.floor(rng() * 80);
    }
    // 时段价格系数：清晨/深夜更便宜
    let tf = 1.0;
    if (depMin < 480) tf = 0.76; else if (depMin < 660) tf = 0.95;
    else if (depMin < 840) tf = 0.88; else if (depMin < 1080) tf = 1.02;
    else tf = 0.72;
    const jitter = 0.75 + rng() * 0.4;
    const stopFactor = stops ? 0.82 : 1.0;
    const ecoPrice = Math.round(basePrice * tf * jitter * stopFactor / 10) * 10;

    const aircraftPool = dist > 2400 ? ['A330-300', 'A350-900', 'A321neo'] : (dist > 900 ? ['A321neo', 'A320neo'] : ['A320neo', 'A321neo']);
    const aircraft = aircraftPool[Math.floor(rng() * aircraftPool.length)];

    let no;
    do { no = 'MA' + (1000 + Math.floor(rng() * 9000)); } while (usedNo.has(no));
    usedNo.add(no);

    const arriveMin = depMin + durMin;
    const arrH = Math.floor(arriveMin / 60) % 24;
    const arrM = arriveMin % 60;
    const addDay = arriveMin >= 1440 ? 1 : 0;

    // 余票：全部舱位均有充足余票（演示）
    const seatBase = 9 + Math.floor(rng() * 60); // 9~68 张
    const cabins = CABINS.map((c, ci) => ({
      key: c.key,
      name: c.name,
      price: Math.round(ecoPrice * c.mult / 10) * 10,
      seats: Math.max(6, seatBase - ci * 3),
      bag: c.bag,
    }));

    flights.push({
      id: `${no}-${fromCode}-${toCode}-${dateStr}`,
      no, airline: '芒果航空', aircraft,
      from: fromCode, to: toCode,
      depDate: dateStr, arrDate: addDays(dateStr, addDay),
      depTime: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
      arrTime: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`,
      durMin, stops, via, viaAlliance: stops > 0,
      dist, terminals: { dep: 1 + Math.floor(rng() * 3), arr: 1 + Math.floor(rng() * 3) },
      cabins,
      punctuality: 85 + Math.floor(rng() * 14), // 准点率（模拟）
    });
  }
  flights.sort((a, b) => a.depTime.localeCompare(b.depTime));
  return flights;
}

function cabinOf(flight, key) { return flight.cabins.find(c => c.key === key); }
function durText(min) { return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`; }

/* ---------- 数据适配器 v1.1：同步（演示）+ 异步（API 接入）双通道 ---------- */
const dataAdapter = {
  mode: 'mock', // 'mock' | 'api'（与 FlightAPI 状态联动）
  searchFlights({ from, to, date }) {
    return genFlights(from, to, date);
  },
  /* v1.1 异步通道：优先走 FlightAPI（可对接真实数据源），任何失败都降级演示数据 */
  async searchFlightsAsync({ from, to, date }) {
    if (typeof FlightAPI !== 'undefined') {
      try {
        const r = await FlightAPI.searchFlights({ from, to, date });
        return { flights: r.flights, source: r.meta.fallback ? 'fallback' : (r.meta.provider === 'demo-mock' ? 'demo' : 'api'), meta: r.meta };
      } catch (e) {
        return { flights: genFlights(from, to, date), source: 'fallback', error: String((e && e.message) || e) };
      }
    }
    return { flights: genFlights(from, to, date), source: 'demo' };
  },
  /* AI 寻价：在日期窗口内扫描每日最低价（含中转/时长/预算约束） */
  findDeals({ from, to, date, range = 3, allowTransfer = true, maxDuration = 9999, budget = Infinity, cabin = 'economy', transferOnly = false }) {
    const days = [];
    for (let i = -range; i <= range; i++) days.push(addDays(date, i));
    return days.map(d => {
      let flights = genFlights(from, to, d).filter(f => f.stops === 0 || (allowTransfer && f.stops > 0));
      if (transferOnly) flights = flights.filter(f => f.stops > 0);
      flights = flights.filter(f => f.durMin <= maxDuration);
      const withCabin = flights.map(f => ({ f, c: cabinOf(f, cabin) }))
        .filter(x => x.c && x.c.price <= budget);
      if (!withCabin.length) return { date: d, best: null };
      withCabin.sort((a, b) => a.c.price - b.c.price);
      return { date: d, best: withCabin[0].f, cabin: withCabin[0].c };
    });
  },
};

/* ---------- 本地存储封装（演示用途，非生产级认证） ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('mango_' + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, val) { try { localStorage.setItem('mango_' + key, JSON.stringify(val)); } catch (e) { } },
  del(key) { try { localStorage.removeItem('mango_' + key); } catch (e) { } },
};

/* ---------- 常量 ---------- */
const STATUS = { pending: '待支付', paid: '已完成', cancelled: '已取消' };
const MEMBERSHIP = [
  { min: 0, name: '芒果新客', color: '#9db8d9' },
  { min: 5000, name: '银芒会员', color: '#c8d8ee' },
  { min: 20000, name: '金芒会员', color: '#ffc93c' },
  { min: 60000, name: '钻石芒会员', color: '#7fe3ff' },
];
