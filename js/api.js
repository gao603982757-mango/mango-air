/* ============================================================
 * Mango Air v1.1 — FlightAPI 数据接入层
 * ------------------------------------------------------------
 * 设计目标：让站点可以对接真实航班数据源（航司官网 API、GDS/NDC
 * 聚合接口等），同时保留本地演示数据作为降级方案。
 *
 * 重要说明（如实披露）：
 *   「天和联盟」是芒果航空品牌演示中的虚构联盟，现实世界并不存在
 *   该联盟，因此不存在"现实天和联盟航班"可供对接。本接入层对接的是
 *   「标准航班数据接口」——任何返回标准航班 JSON 的端点（真实航司
 *   API、GDS、NDC 聚合服务或你自己的后端）都可以接入。
 *
 * 工作模式：
 *   api  模式：读取用户在「设置 → 数据源」中配置的端点，发起真实
 *             HTTP 请求；超时或失败自动降级为 mock，并记录错误。
 *   mock 模式：使用内置演示数据（默认）。行为与真实 API 一致：
 *             异步、带网络延迟、可能失败——用于演示完整链路。
 *
 * 接口约定（对接真实 API 时，让你的服务端返回如下 JSON）：
 *   GET {endpoint}?from=PEK&to=SHA&date=2026-10-23
 *   Header: X-API-Key: <apiKey>
 *   200 响应：
 *   {
 *     "flights": [
 *       {
 *         "no": "CA1234", "airline": "航空公司",
 *         "from": "PEK", "to": "SHA",
 *         "depDate": "2026-10-23", "arrDate": "2026-10-23",
 *         "depTime": "08:30", "arrTime": "10:50",
 *         "durMin": 140, "stops": 0, "via": null,
 *         "aircraft": "A320neo",
 *         "cabins": [
 *           { "key": "economy", "name": "经济舱", "price": 760,
 *             "seats": 32, "bag": "23kg" }
 *         ]
 *       }
 *     ]
 *   }
 *   找不到数据时返回 { "flights": [] } 即可，不要返回非 2xx。
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'mango_api_config';
  var DEFAULT_CONFIG = {
    enabled: false,        // 是否启用真实 API（默认关闭 = 演示模式）
    endpoint: '',          // 例如 https://your-server.com/api/flights
    apiKey: '',            // 会以 X-API-Key 头发送
    provider: 'demo',      // 数据提供商标识（展示用）
    timeoutMs: 8000,       // 请求超时
  };

  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_CONFIG);
      var cfg = JSON.parse(raw);
      return Object.assign({}, DEFAULT_CONFIG, cfg);
    } catch (e) { return Object.assign({}, DEFAULT_CONFIG); }
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  var state = {
    config: loadConfig(),
    status: 'demo',        // 'demo' | 'live' | 'fallback'
    lastError: null,
    lastLatency: null,
    lastSyncAt: null,
  };

  /* ---------- 内部工具 ---------- */
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* 演示 Mock：行为模拟真实 API —— 有延迟、有失败率、返回标准结构。
   * 数据源即本地 genFlights（若已加载 data.js）。 */
  function mockSearch(params) {
    return delay(320 + Math.random() * 380).then(function () {
      // 演示用：极小概率模拟网络抖动失败（5%），用于展示降级链路
      if (Math.random() < 0.05) {
        throw new Error('演示网络波动（Mock）：请求未完成');
      }
      var list = [];
      if (typeof genFlights === 'function') {
        list = genFlights(params.from, params.to, params.date);
      }
      return { flights: list, meta: { provider: 'demo-mock', total: list.length } };
    });
  }

  /* 真实 API 请求：fetch + 超时控制 */
  function liveSearch(params) {
    var cfg = state.config;
    if (!cfg.endpoint) {
      return Promise.reject(new Error('未配置 API 端点，请在「设置 → 数据源」中填写'));
    }
    var url = cfg.endpoint
      + (cfg.endpoint.indexOf('?') >= 0 ? '&' : '?')
      + 'from=' + encodeURIComponent(params.from)
      + '&to=' + encodeURIComponent(params.to)
      + '&date=' + encodeURIComponent(params.date);

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, cfg.timeoutMs) : null;

    var t0 = Date.now();
    return fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': cfg.apiKey || '',
      },
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('API 返回 HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      state.lastLatency = Date.now() - t0;
      state.lastSyncAt = Date.now();
      var list = normalizeFlights(data);
      return { flights: list, meta: { provider: cfg.provider || 'live-api', total: list.length } };
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* 响应适配：把外部 API 的字段映射为内部结构，兼容多种常见命名 */
  function normalizeFlights(data) {
    var raw = Array.isArray(data) ? data : (data && (data.flights || data.data || data.results));
    if (!Array.isArray(raw)) return [];
    return raw.map(function (f) {
      var cabins = Array.isArray(f.cabins) ? f.cabins : [];
      return {
        id: f.id || (f.no + '-' + (f.from || '') + '-' + (f.to || '') + '-' + (f.depDate || '')),
        no: f.no || f.flightNo || f.number || '—',
        airline: f.airline || f.carrier || '合作航司',
        from: f.from || f.origin || '',
        to: f.to || f.destination || '',
        depDate: f.depDate || f.date || '',
        arrDate: f.arrDate || f.depDate || '',
        depTime: f.depTime || f.departureTime || '',
        arrTime: f.arrTime || f.arrivalTime || '',
        durMin: f.durMin || f.durationMin || 0,
        stops: typeof f.stops === 'number' ? f.stops : (f.via ? 1 : 0),
        via: f.via || null,
        viaAlliance: !!f.viaAlliance,
        aircraft: f.aircraft || '—',
        dist: f.dist || 0,
        terminals: f.terminals || null,
        punctuality: typeof f.punctuality === 'number' ? f.punctuality : null,
        cabins: cabins.map(function (c) {
          return {
            key: c.key || 'economy',
            name: c.name || '经济舱',
            price: c.price || 0,
            seats: typeof c.seats === 'number' ? c.seats : 0,
            bag: c.bag || '23kg',
          };
        }),
        _source: 'api',
      };
    });
  }

  /* ---------- 对外接口 ---------- */
  var FlightAPI = {
    /* 当前配置（只读副本） */
    getConfig: function () { return Object.assign({}, state.config); },

    /* 保存配置（设置页调用）。enabled 需要端点非空。 */
    setConfig: function (patch) {
      Object.assign(state.config, patch || {});
      if (state.config.enabled && !state.config.endpoint) {
        state.config.enabled = false;
      }
      saveConfig(state.config);
      state.status = state.config.enabled ? 'live' : 'demo';
      state.lastError = null;
      return Object.assign({}, state.config);
    },

    /* 数据源状态：供 UI 展示（首页角标 / 设置页 / 结果页） */
    getStatus: function () {
      return {
        mode: state.config.enabled ? 'api' : 'mock',
        status: state.status,           // demo | live | fallback
        lastError: state.lastError,
        latency: state.lastLatency,
        lastSyncAt: state.lastSyncAt,
        endpoint: state.config.endpoint,
      };
    },

    /* 测试连接：不落库存，仅验证端点可达 */
    testConnection: function () {
      var cfg = state.config;
      if (!cfg.endpoint) {
        return Promise.resolve({ ok: false, message: '请先填写 API 端点地址' });
      }
      var t0 = Date.now();
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, cfg.timeoutMs) : null;
      return fetch(cfg.endpoint + (cfg.endpoint.indexOf('?') >= 0 ? '&' : '?') + 'ping=1', {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'X-API-Key': cfg.apiKey || '' },
        signal: controller ? controller.signal : undefined,
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        state.lastLatency = Date.now() - t0;
        return { ok: res.ok, message: res.ok ? ('连接成功，延迟 ' + (Date.now() - t0) + 'ms') : ('HTTP ' + res.status) };
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        var msg = err.name === 'AbortError' ? '连接超时（' + cfg.timeoutMs + 'ms）' : ('连接失败：' + err.message);
        return { ok: false, message: msg };
      });
    },

    /* 搜索航班：统一入口。
     * - 未启用 API：走演示 Mock（异步，行为同真实请求）
     * - 启用 API：真实请求；失败自动降级 Mock 并在 status.lastError 记录
     * 始终 resolve（降级不 reject），UI 层通过 getStatus() 判断数据来源。 */
    searchFlights: function (params) {
      if (state.config.enabled && state.config.endpoint) {
        return liveSearch(params).catch(function (err) {
          state.lastError = String(err.message || err);
          state.status = 'fallback';
          return mockSearch(params).then(function (r) {
            r.meta.fallback = true;
            r.meta.fallbackReason = state.lastError;
            return r;
          });
        }).then(function (r) {
          if (!r.meta.fallback) state.status = 'live';
          return r;
        });
      }
      return mockSearch(params);
    },
  };

  global.FlightAPI = FlightAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = FlightAPI;
})(typeof window !== 'undefined' ? window : globalThis);
