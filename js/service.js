/* ============================================================
 * Mango Air v1.4 — 官方客服 MangoService
 * ------------------------------------------------------------
 * 双通道设计（与全站「真实 API + 演示降级」模式一致）：
 *   1) AI 通道：OpenAI 兼容的 chat completions 接口
 *      （端点 / 模型 / Key 可在「设置 → 官方客服 API」配置，
 *       默认预填 DeepSeek；失败自动降级，并提示用户）
 *   2) 本地通道：内置知识库（订票 / 退改签 / 行李 / 值机 /
 *      发票 / 会员 / 支付 / 航班动态 / 特殊旅客 / 人工客服），
 *      八国语言关键词匹配，无需任何配置即可使用。
 *
 * 会话历史保存在本机浏览器（localStorage: mango_cs_history），
 * 演示站点不向任何第三方发送会话记录（AI 通道除外）。
 * ============================================================ */
(function (global) {
  'use strict';

  /* 用户提供的 API Key（预填）。说明：默认通道为火山方舟（Volcengine
   * Ark）豆包（Doubao）免费模型 doubao-seed-2-1-pro-260915，每月免费
   * 额度内零成本、回答简短以节省 Token；未开通模型或请求失败时自动
   * 降级到本地知识库客服，对话不中断。在设置页可替换为您自己的 Key。 */
  var PRESET_API_KEY = 'ark-57967c0a-cdd5-460a-a04f-6d9d0f5a05b2-33724';

  var LANGS = ['zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ru'];
  var CFG_KEY = 'cs_cfg';          // → mango_cs_cfg
  var HIS_KEY = 'cs_history';      // → mango_cs_history
  var HISTORY_MAX = 60;
  var CHAT_TIMEOUT = 35000;
  var TEST_TIMEOUT = 12000;

  /* 默认：火山方舟（Volcengine Ark）OpenAI 兼容端点 + 豆包免费模型。
   * 免费模型 + 低 max_tokens + 关闭深度思考 + 精简系统提示：
   * 最大限度节省 Token。 */
  var DEFAULT_CFG = {
    enabled: true,
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2-1-pro-260915',
    apiKey: PRESET_API_KEY,
  };

  function loadCfg() {
    try {
      var raw = localStorage.getItem('mango_' + CFG_KEY);
      if (!raw) return Object.assign({}, DEFAULT_CFG);
      return Object.assign({}, DEFAULT_CFG, JSON.parse(raw) || {});
    } catch (e) { return Object.assign({}, DEFAULT_CFG); }
  }
  function saveCfg(cfg) {
    try { localStorage.setItem('mango_' + CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }
  function loadHistory() {
    try {
      var raw = localStorage.getItem('mango_' + HIS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(-HISTORY_MAX) : [];
    } catch (e) { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem('mango_' + HIS_KEY, JSON.stringify(arr.slice(-HISTORY_MAX))); } catch (e) { }
  }

  var state = {
    cfg: loadCfg(),
    history: loadHistory(),
    open: false,
    chipSet: 0,           // 快选问题批次
    aiBroken: false,      // 本会话内 AI 是否已失败过（用于提示）
    verified: false,      // 真实连通性：是否通过 testConnection 验证
    pending: false,       // 是否正在等待回复
    lastError: null,
    lastLatency: null,
    lastOkAt: null,
  };

  /* ============================================================
     本地知识库（八国语言）
     k = 匹配关键词；a = 答复文案；chip = 快选问题
     ============================================================ */
  var KB = [
    {
      id: 'booking',
      k: {
        zh: ['订票', '订机票', '购票', '预订', '买票', '下单'],
        en: ['book', 'booking', 'reserve', 'purchase', 'order a flight'],
        es: ['reservar', 'reserva', 'comprar billete', 'comprar un vuelo'],
        fr: ['réserver', 'réservation', 'acheter un billet', 'commander'],
        de: ['buchen', 'flug buchen', 'buchung', 'ticket kaufen'],
        ja: ['予約', '航空券', 'チケット', '購入'],
        ko: ['예약', '항공권', '티켓', '구매'],
        ru: ['бронир', 'бронь', 'оформить', 'заказ'],
      },
      kw: {
        zh: ['怎么买', '买一张', '订一张', '买机票'],
        en: ['buy ticket', 'how do i book', 'how to book', 'i want to fly'],
        es: ['comprar', 'cómo reservo', 'como reservo'],
        fr: ['acheter', 'comment réserver'],
        de: ['kaufen', 'wie buche ich'],
        ja: ['買い方', 'どうやって予約'],
        ko: ['사는 법', '어떻게 예약'],
        ru: ['купить', 'как забронировать'],
      },
      a: {
        zh: '在首页或底部「订机票」选择出发地、到达地与日期，搜索航班后挑选舱位，依次填写乘机人、核对订单并完成模拟支付即可出票。演示站点不出具真实客票，全流程可在本机完整体验。',
        en: 'Open the "Book" tab, pick your origin, destination and date, then choose a flight and cabin. Fill in passenger details, review the order and complete the simulated payment — the ticket is issued instantly. This demo site does not issue real tickets, but the full flow works on your device.',
        es: 'En la pestaña «Reservar» elige origen, destino y fecha, busca un vuelo y selecciona cabina. Rellena los datos del pasajero, revisa el pedido y completa el pago simulado para emitir el billete. Es una demo: no se emiten billetes reales.',
        fr: 'Dans l\'onglet « Réserver », choisissez l\'origine, la destination et la date, puis un vol et une cabine. Renseignez les passagers, vérifiez la commande et effectuez le paiement simulé : le billet est émis aussitôt. Site de démonstration, aucun billet réel n\'est émis.',
        de: 'Im Tab „Flüge buchen“ Start, Ziel und Datum wählen, dann Flug und Kabine auswählen. Passagierdaten eintragen, Bestellung prüfen und die simulierte Zahlung abschließen — das Ticket wird sofort ausgestellt. Demo-Seite: keine echten Tickets.',
        ja: '「航空券予約」タブで出発地・到着地・日程を選び、便とキャビンを選択。搭乗者情報を入力し、注文を確認して疑似決済を完了すると即時発券されます。デモサイトのため実際のチケットは発行されません。',
        ko: '「항공권 예약」 탭에서 출발지·도착지·날짜를 선택하고 항공편과 객실을 고르세요. 탑승자 정보 입력 후 주문을 확인하고 모의 결제를 완료하면 즉시 발권됩니다. 데모 사이트이므로 실제 티켓은 발급되지 않습니다.',
        ru: 'Во вкладке «Бронирование» выберите пункт отправления, назначения и дату, затем рейс и класс салона. Заполните данные пассажиров, проверьте заказ и завершите имитацию оплаты — билет выписывается сразу. Это демо-сайт: реальные билеты не выдаются.',
      },
      chip: {
        zh: '怎么订票？', en: 'How do I book?', es: '¿Cómo reservo?',
        fr: 'Comment réserver ?', de: 'Wie buche ich?', ja: '予約方法は？',
        ko: '예약 방법은?', ru: 'Как забронировать?',
      },
    },
    {
      id: 'refund',
      k: {
        zh: ['退票', '改签', '退款', '改期', '取消订单', '退掉', '变更'],
        en: ['refund', 'rebook', 'change my', 'cancel', 'modify'],
        es: ['reembolso', 'cambio', 'cancelar', 'devolución', 'modificar'],
        fr: ['remboursement', 'changement', 'annuler', 'modifier', 'rembourser'],
        de: ['erstatten', 'umbuchen', 'stornieren', 'ändern', 'rücktritt'],
        ja: ['払い戻し', '変更', 'キャンセル', '返金', '取り消し'],
        ko: ['환불', '변경', '취소', '수정', '반환'],
        ru: ['возврат', 'обмен', 'отмен', 'изменить', 'перенести'],
      },
      a: {
        zh: '演示退改规则：起飞前 2 小时以外可免费改期一次；退票收取票面价 10% 手续费；航班延误 3 小时以上可免费全退。请在「我的 → 我的订单」中选择对应订单操作。演示站点不涉及真实资金。',
        en: 'Demo rules: one free date change up to 2 hours before departure; refunds cost 10% of the fare; flights delayed over 3 hours can be fully refunded. Open "Me → My Orders" and pick the order. No real money is involved.',
        es: 'Reglas de demo: un cambio de fecha gratuito hasta 2 horas antes de la salida; la devolución cuesta el 10% del billete; con más de 3 horas de retraso, reembolso total. Ve a «Yo → Mis pedidos» y elige el pedido. No se mueve dinero real.',
        fr: 'Règles de démo : un changement de date gratuit jusqu\'à 2 h avant le départ ; le remboursement coûte 10 % du billet ; au-delà de 3 h de retard, remboursement intégral. Allez dans « Moi → Mes commandes » et choisissez la commande. Aucun argent réel n\'est en jeu.',
        de: 'Demo-Regeln: eine kostenlose Umbuchung bis 2 Stunden vor Abflug; Erstattung kostet 10 % des Fahrpreises; bei über 3 Stunden Verspätung volle Erstattung. Unter „Mein Konto → Meine Buchungen“ den Vorgang starten. Kein echtes Geld.',
        ja: 'デモ規則：出発2時間前まで変更手数料無料1回、払い戻しは運賃の10％、3時間以上の遅延で全額払い戻し。「マイページ → 予約」から操作できます。実際の金銭のやり取りはありません。',
        ko: '데모 규칙: 출발 2시간 전까지 1회 무료 변경, 환불은 운임의 10%, 3시간 이상 지연 시 전액 환불. 「마이 → 내 예약」에서 처리하세요. 실제 금전 거래는 없습니다.',
        ru: 'Демо-правила: одна бесплатная смена даты за 2 часа до вылета; возврат стоит 10 % тарифа; при задержке более 3 часов — полный возврат. Откройте «Моя страница → Мои заказы». Реальных денег не участвует.',
      },
      chip: {
        zh: '退改签规则？', en: 'Refund rules?', es: '¿Reglas de cambio?',
        fr: 'Règles de remboursement ?', de: 'Erstattungsregeln?', ja: '変更・払い戻し規則は？',
        ko: '변경·환불 규칙은?', ru: 'Правила возврата?',
      },
    },
    {
      id: 'baggage',
      k: {
        zh: ['行李', '托运', '随身', '背包', '行李箱', '多重', '公斤', '20寸', '多少斤'],
        en: ['baggage', 'luggage', 'checked bag', 'carry-on', 'suitcase', 'how many kg'],
        es: ['equipaje', 'maleta', 'facturar', 'cuántos kg', 'maletas'],
        fr: ['bagage', 'valise', 'bagages', 'soute', 'combien de kg'],
        de: ['gepäck', 'koffer', 'aufgegeben', 'handgepäck', 'wie viele kg'],
        ja: ['手荷物', '預け', '荷物', 'スーツケース', '何kg'],
        ko: ['수하물', '짐', '위탁', '캐리어', '몇 kg'],
        ru: ['багаж', 'чемодан', 'ручная кладь', 'сдать', 'сколько кг'],
      },
      a: {
        zh: '经济舱免费托运行李额 23kg，手提行李 7kg（一件，三边合计 ≤115cm）；公务舱托运 32kg。超重部分按 12 元/kg 收取（演示标准）。危险品与锂电池须随身携带并做好防护。',
        en: 'Economy includes 23kg checked baggage and 7kg carry-on (one piece, edges totaling ≤115cm); Business gets 32kg checked. Overweight is charged at ¥12/kg (demo rate). Dangerous goods and lithium batteries must be carried in the cabin with protection.',
        es: 'Economía incluye 23kg de equipaje facturado y 7kg de mano (una pieza, lados ≤115cm en total); Business 32kg. El exceso cuesta 12¥/kg (tarifa demo). Materiales peligrosos y baterías de litio deben ir en cabina, protegidos.',
        fr: 'Économie : 23 kg en soute et 7 kg en cabine (un bagage, côtés ≤115 cm au total) ; Business : 32 kg. Excédent facturé 12 ¥/kg (tarif démo). Marchandises dangereuses et batteries au lithium en cabine, protégées.',
        de: 'Economy: 23 kg aufgegeben + 7 kg Handgepäck (ein Stück, Kantensumme ≤115 cm); Business: 32 kg. Übergepäck 12 ¥/kg (Demo-Tarif). Gefahrgut und Lithium-Akkus geschützt im Handgepäck.',
        ja: 'エコノミーは預け手荷物23kg・機内持ち込み7kg（1個・三辺合計115cm以内）、ビジネスは32kg。超過は12元/kg（デモ料金）。危険物・リチウム電池は保護して機内持ち込みを。',
        ko: '이코노미는 위탁 수하물 23kg, 기내 수하물 7kg(1개, 세 변 합계 115cm 이내), 비즈니스 32kg. 초과 시 12위안/kg(데모 요금). 위험물·리튬 배터리는 보호하여 기내 반입.',
        ru: 'Эконом: 23 кг багажа + 7 кг ручная кладь (одно место, сумма сторон ≤115 см); бизнес — 32 кг. Перевес 12 юаней/кг (демо-тариф). Опасные грузы и литиевые батареи — в салоне, защищённые.',
      },
      chip: {
        zh: '行李额度多少？', en: 'Baggage allowance?', es: '¿Equipaje incluido?',
        fr: 'Bagage inclus ?', de: 'Gepäck inklusive?', ja: '手荷物の上限は？',
        ko: '수하물 허용량은?', ru: 'Норма багажа?',
      },
    },
    {
      id: 'member',
      k: {
        zh: ['会员', '积分', '里程', '升舱', '等级', '银芒', '金芒', '钻石', '金卡'],
        en: ['member', 'miles', 'points', 'loyalty', 'tier', 'upgrade'],
        es: ['miembro', 'millas', 'puntos', 'nivel', 'fidelidad', 'ascender'],
        fr: ['membre', 'miles', 'points', 'niveau', 'fidélité', 'surclassement'],
        de: ['mitglied', 'meilen', 'punkte', 'stufe', 'status', 'upgrade'],
        ja: ['会員', 'マイル', 'ポイント', '等級', 'ランク', 'アップグレード'],
        ko: ['멤버', '회원', '마일', '포인트', '등급', '업그레이드'],
        ru: ['участник', 'миль', 'баллы', 'уровень', 'статус', 'апгрейд'],
      },
      a: {
        zh: '芒果会员按累计里程分四级：芒果新客、银芒（5,000 里程）、金芒（20,000）、钻石芒（60,000）。已支付订单按航段里程自动累计，等级越高享优先选座与额外行李额（演示权益）。',
        en: 'Mango membership has four tiers by accumulated miles: Mango New, Silver (5,000), Gold (20,000) and Diamond (60,000). Paid orders earn segment miles automatically; higher tiers enjoy priority seating and extra baggage (demo benefits).',
        es: 'La membresía tiene cuatro niveles por millas acumuladas: Mango Nuevo, Plata (5.000), Oro (20.000) y Diamante (60.000). Los pedidos pagados suman millas por segmento; niveles altos tienen asiento prioritario y equipaje extra (beneficios demo).',
        fr: 'L\'adhésion compte quatre niveaux selon les miles cumulés : Mango Nouveau, Argent (5 000), Or (20 000), Diamant (60 000). Les commandes payées créditent les miles par segment ; les niveaux élevés offrent choix de siège prioritaire et bagage supplémentaire (avantages démo).',
        de: 'Die Mitgliedschaft hat vier Stufen nach gesammelten Meilen: Mango Neu, Silber (5.000), Gold (20.000), Diamant (60.000). Bezahlte Buchungen sammeln Streckenmeilen; höhere Stufen erhalten Priorität bei der Sitzwahl und Zusatzgepäck (Demo-Vorteile).',
        ja: '会員は累計マイルで4段階：マンゴ新規・シルバー（5,000）・ゴールド（20,000）・ダイヤモンド（60,000）。支払済み予約で区間マイルが自動加算され、上位ランクは優先座席・追加手荷物（デモ特典）。',
        ko: '멤버십은 누적 마일리지로 4단계: 망고 신규·실버(5,000)·골드(20,000)·다이아몬드(60,000). 결제 완료 주문에서 구간 마일이 자동 적립되며 상위 등급은 우선 좌석·추가 수하물(데모 혜택).',
        ru: 'Уровни по накопленным милям: Mango Новый, Серебро (5 000), Золото (20 000), Алмаз (60 000). Оплаченные заказы дают мили за участки; старшие уровни — приоритетный выбор места и допбагаж (демо-льготы).',
      },
      chip: {
        zh: '会员怎么升级？', en: 'Membership tiers?', es: '¿Niveles de membresía?',
        fr: 'Niveaux d\'adhésion ?', de: 'Mitgliedsstufen?', ja: '会員ランクは？',
        ko: '멤버십 등급은?', ru: 'Уровни участия?',
      },
    },
    {
      id: 'checkin',
      k: {
        zh: ['值机', '选座', '座位', '登机牌', '提前多久', '到机场', '几号航站楼'],
        en: ['check-in', 'check in', 'seat', 'boarding pass', 'how early', 'terminal'],
        es: ['check-in', 'facturación', 'asiento', 'tarjeta de embarque', 'terminal'],
        fr: ['enregistrement', 'check-in', 'siège', "carte d'embarquement", 'terminal'],
        de: ['check-in', 'einchecken', 'sitzplatz', 'boardingkarte', 'terminal'],
        ja: ['チェックイン', '座席', '搭乗券', '何分前', 'ターミナル'],
        ko: ['체크인', '좌석', '탑승권', '몇 분 전', '터미널'],
        ru: ['регистрац', 'место', 'посадочный', 'за сколько', 'терминал'],
      },
      a: {
        zh: '航班起飞前 24 小时开放网上值机（演示），可在订单详情页选座；机场柜台于起飞前 90 分钟停止办理。建议国内航班提前 2 小时、国际航班提前 3 小时到达机场。',
        en: 'Online check-in opens 24 hours before departure (demo) — choose your seat on the order detail page; airport counters close 90 minutes before takeoff. Arrive 2 hours early for domestic flights and 3 hours for international.',
        es: 'El check-in en línea abre 24 horas antes de la salida (demo): elige asiento en el detalle del pedido. Los mostradores cierran 90 minutos antes. Llega 2 horas antes en vuelos nacionales y 3 horas en internacionales.',
        fr: 'L\'enregistrement en ligne ouvre 24 h avant le départ (démo) — choisissez votre siège sur la page de commande. Les comptoirs ferment 90 min avant. Présentez-vous 2 h avant pour un vol intérieur, 3 h pour un international.',
        de: 'Online-Check-in öffnet 24 Stunden vor Abflug (Demo) — Sitzplatz auf der Bestellseite wählen. Schalter schließen 90 Minuten vor Abflug. 2 Stunden vorher bei Inlandsflügen, 3 Stunden bei internationalen.',
        ja: '出発24時間前からウェブチェックイン（デモ）が可能、注文詳細で座席選択可。空港カウンターは出発90分前に締切。国内線は2時間前、国際線は3時間前までに空港へ。',
        ko: '출발 24시간 전부터 웹체크인(데모)이 가능하며 주문 상세에서 좌석을 선택하세요. 공항 카운터는 출발 90분 전 마감. 국내선은 2시간, 국제선은 3시간 전까지 공항에 도착하세요.',
        ru: 'Онлайн-регистрация открывается за 24 часа до вылета (демо) — место выбирается на странице заказа. Стойки закрываются за 90 минут. Приезжайте за 2 часа на внутренние рейсы и за 3 часа на международные.',
      },
      chip: {
        zh: '怎么值机选座？', en: 'Online check-in?', es: '¿Check-in en línea?',
        fr: 'Enregistrement en ligne ?', de: 'Online-Check-in?', ja: 'チェックイン方法は？',
        ko: '체크인 방법은?', ru: 'Онлайн-регистрация?',
      },
    },
    {
      id: 'invoice',
      k: {
        zh: ['发票', '报销', '行程单', '开票', '凭证', '抬头'],
        en: ['invoice', 'receipt', 'expense', 'reimburs', 'vat'],
        es: ['factura', 'recibo', 'gastos', 'reembolso', 'iva'],
        fr: ['facture', 'reçu', 'note de frais', 'tva', 'justificatif'],
        de: ['rechnung', 'beleg', 'quittung', 'ust', 'auslage'],
        ja: ['領収書', 'インボイス', '請求書', '経費', 'レシート'],
        ko: ['영수증', '인보이스', '청구서', '경비', '계산서'],
        ru: ['счет', 'фактур', 'квитанц', 'ндс', 'расход'],
      },
      a: {
        zh: '演示站点不接入真实支付，也不出具真实发票。真实场景中：行程结束后 30 天内可在「我的订单」申请电子发票（增值税普通发票），抬头与税号请仔细核对，错误将影响报销。',
        en: 'This demo site does not process real payments or issue real invoices. In a real scenario you can request an e-invoice (VAT general invoice) within 30 days after the trip under "My Orders" — double-check the title and tax ID, as errors affect reimbursement.',
        es: 'Esta demo no procesa pagos reales ni emite facturas reales. En un caso real puedes solicitar factura electrónica (IVA general) dentro de 30 días desde «Mis pedidos»; revisa bien el titular y el NIF, los errores afectan al reembolso.',
        fr: 'Cette démo ne traite pas de paiements réels ni de factures réelles. En réel, une facture électronique (TVA générale) peut être demandée sous 30 jours après le voyage dans « Mes commandes » ; vérifiez l\'intitulé et le numéro de TVA, une erreur gêne le remboursement.',
        de: 'Diese Demo verarbeitet keine echten Zahlungen und stellt keine echten Rechnungen aus. Real: E-Rechnung (USt.-Normalrechnung) innerhalb von 30 Tagen nach der Reise unter „Meine Buchungen“ — Titel und Steuernummer prüfen, Fehler behindern die Erstattung.',
        ja: 'このデモサイトでは実際の決済・実際の領収書は発行されません。実際の運用では旅程終了後30日以内に「予約」から電子インボイス（増値税普通発票）を申請できます。宛名・税番号は慎重にご確認ください。',
        ko: '이 데모 사이트에서는 실제 결제와 실제 영수증이 발행되지 않습니다. 실제로는 여행 종료 후 30일 이내에 「내 예약」에서 전자 인보이스(부가세 일반 영수증)를 신청할 수 있습니다. 명의와 세금 번호를 정확히 확인하세요.',
        ru: 'Демо-сайт не проводит реальные платежи и не выдаёт реальные счета. В реальном сценарии электронный счёт (НДС, общий) запрашивается в течение 30 дней после поездки в «Мои заказы»; проверяйте название и ИНН — ошибки мешают отчётности.',
      },
      chip: {
        zh: '如何开发票？', en: 'How to get an invoice?', es: '¿Cómo facturo?',
        fr: 'Comment obtenir une facture ?', de: 'Rechnung anfordern?', ja: '領収書の発行は？',
        ko: '영수증 발급은?', ru: 'Как получить счёт?',
      },
    },
    {
      id: 'payment',
      k: {
        zh: ['支付', '付款', '怎么付', '支付宝', '微信', '信用卡', '银行卡', '花呗', '钱'],
        en: ['pay', 'payment', 'alipay', 'wechat', 'credit card', 'how to pay'],
        es: ['pago', 'pagar', 'alipay', 'wechat', 'tarjeta', 'cómo pagar'],
        fr: ['payer', 'paiement', 'alipay', 'wechat', 'carte', 'comment payer'],
        de: ['zahlung', 'bezahlen', 'alipay', 'wechat', 'karte', 'wie bezahlen'],
        ja: ['支払', '決済', 'アリペイ', 'ウィーチャット', 'カード', '払い方'],
        ko: ['결제', '지불', '알리페이', '위챗', '카드', '결제 방법'],
        ru: ['оплат', 'платеж', 'алипэй', 'вичат', 'карта', 'как платить'],
      },
      a: {
        zh: '本站为模拟支付环境：支持支付宝、微信、银行卡（演示）三种方式，点击即完成，不产生真实扣款，也不会保存任何支付信息。',
        en: 'This site uses a simulated payment environment: Alipay, WeChat Pay and bank card (demo) all complete instantly — no real charges, and no payment data is stored.',
        es: 'El pago es simulado: Alipay, WeChat Pay y tarjeta (demo) se completan al instante, sin cargos reales ni datos guardados.',
        fr: 'Le paiement est simulé : Alipay, WeChat Pay et carte bancaire (démo) aboutissent instantanément — aucun débit réel, aucune donnée enregistrée.',
        de: 'Die Zahlung ist simuliert: Alipay, WeChat Pay und Bankkarte (Demo) schließen sofort ab — keine echte Abbuchung, keine gespeicherten Daten.',
        ja: '支払いは疑似環境です：Alipay・WeChat Pay・カード（デモ）は即時完了し、実際の引き落としや情報保存はありません。',
        ko: '결제는 모의 환경입니다: 알리페이·위챗페이·카드(데모) 모두 즉시 완료되며 실제 출금이나 정보 저장은 없습니다.',
        ru: 'Оплата имитируется: Alipay, WeChat Pay и карта (демо) проходят мгновенно — без реального списания и без сохранения данных.',
      },
      chip: {
        zh: '支持哪些支付？', en: 'Payment methods?', es: '¿Formas de pago?',
        fr: 'Moyens de paiement ?', de: 'Zahlungsarten?', ja: '支払い方法は？',
        ko: '결제 수단은?', ru: 'Способы оплаты?',
      },
    },
    {
      id: 'flightstatus',
      k: {
        zh: ['航班', '动态', '延误', '取消', '准点', '几点到', '起飞时间', '晚点'],
        en: ['flight status', 'delay', 'delayed', 'cancel', 'on-time', 'when will'],
        es: ['estado del vuelo', 'retraso', 'cancelado', 'puntual', 'cuándo'],
        fr: ['état du vol', 'retard', 'annulé', 'ponctuel', 'quand'],
        de: ['flugstatus', 'verspätung', 'ausfall', 'pünktlich', 'wann'],
        ja: ['運航', '遅延', '欠航', '定時', 'フライト状況', '何時'],
        ko: ['운항', '지연', '결항', '정시', '항공편', '몇 시'],
        ru: ['рейс', 'статус', 'задержк', 'отмен', 'пунктуал', 'когда'],
      },
      a: {
        zh: '演示站点的航班动态为模拟数据：起飞前 2 小时起可在订单详情查看预计起飞时间，准点率约 88%。如遇延误请留意订单通知（演示）。真实动态请以航空公司官方渠道为准。',
        en: 'Flight status on this demo site is simulated: from 2 hours before departure you can see the estimated takeoff time in the order details; the on-time rate is about 88%. Watch order notifications for delays (demo). Real status: official airline channels.',
        es: 'El estado de vuelos aquí es simulado: desde 2 horas antes de la salida verás la hora estimada en el detalle del pedido; puntualidad ≈88 %. Ante retrasos, revisa las notificaciones (demo). El estado real: canales oficiales.',
        fr: 'L\'état des vols est simulé : 2 h avant le départ, l\'heure estimée apparaît dans le détail de la commande ; ponctualité ≈88 %. En cas de retard, consultez les notifications (démo). État réel : canaux officiels.',
        de: 'Der Flugstatus ist simuliert: ab 2 Stunden vor Abflug erscheint die geschätzte Zeit in der Bestellung; Pünktlichkeit ≈88 %. Bei Verspätung Benachrichtigungen beachten (Demo). Echter Status: offizielle Kanäle.',
        ja: 'フライト状況は疑似データです：出発2時間前から注文詳細で予定時刻を確認できます。定時運行率は約88％。遅延時は通知（デモ）をご確認ください。実際の運航状況は公式チャンネルで。',
        ko: '항공편 현황은 모의 데이터입니다: 출발 2시간 전부터 주문 상세에서 예상 출발 시각을 확인할 수 있으며 정시 운항률은 약 88%입니다. 지연 시 알림(데모)을 확인하세요. 실제 현황은 공식 채널에서.',
        ru: 'Статус рейсов — имитация: за 2 часа до вылета в заказе виден расчётный время вылета; пунктуальность ≈88 %. При задержке следите за уведомлениями (демо). Реальный статус — в официальных каналах.',
      },
      chip: {
        zh: '航班动态准点吗？', en: 'Is my flight on time?', es: '¿Vuelo puntual?',
        fr: 'Vol à l\'heure ?', de: 'Ist mein Flug pünktlich?', ja: 'フライトは定時？',
        ko: '항공편 정시인가요?', ru: 'Рейс пунктуален?',
      },
    },
    {
      id: 'special',
      k: {
        zh: ['儿童', '小孩', '婴儿', '宝宝', '孕妇', '宠物', '动物', '轮椅', '无人陪伴', '带娃', '儿童票', '婴儿票', '小孩票', '带孩子'],
        en: ['child', 'children', 'infant', 'baby', 'pregnant', 'pet', 'animal', 'wheelchair'],
        es: ['niño', 'niños', 'bebé', 'embarazada', 'mascota', 'animal'],
        fr: ['enfant', 'enfants', 'bébé', 'enceinte', 'animal', 'chien'],
        de: ['kind', 'kinder', 'baby', 'schwanger', 'haustier', 'tier'],
        ja: ['子供', '子ども', '幼児', '赤ちゃん', '妊娠', 'ペット', '動物'],
        ko: ['아동', '어린이', '유아', '아기', '임신', '반려동물', '동물'],
        ru: ['ребен', 'ребён', 'младен', 'беремен', 'питом', 'животн', 'коляск'],
      },
      a: {
        zh: '儿童（2-12 周岁）可购成人全价 50% 起的儿童票并需成人陪同；婴儿（14 天-2 周岁）为成人全价 10%，不占座。孕妇 32 周以上需医院证明；宠物托运请提前 48 小时申请（演示政策）。',
        en: 'Children (2-12) travel from 50% of the adult fare, accompanied by an adult; infants (14 days-2 years) pay 10% without a seat. Pregnant passengers beyond 32 weeks need a medical certificate; pets require an application 48 hours ahead (demo policy).',
        es: 'Niños (2-12) pagan desde el 50% de la tarifa de adulto, acompañados; bebés (14 días-2 años) el 10%, sin asiento. Embarazadas de más de 32 semanas: certificado médico; mascotas: solicitud 48 h antes (política demo).',
        fr: 'Enfants (2-12 ans) : dès 50 % du tarif adulte, accompagnés ; nourrissons (14 jours-2 ans) : 10 % sans siège. Femmes enceintes au-delà de 32 semaines : certificat médical ; animaux : demande 48 h avant (politique démo).',
        de: 'Kinder (2-12) zahlen ab 50 % des Erwachsenentarifs in Begleitung; Kleinkinder (14 Tage-2 Jahre) 10 % ohne Sitzplatz. Schwangere ab 32 Wochen: ärztliches Attest; Haustiere 48 h vorher anmelden (Demo-Richtlinie).',
        ja: '子供（2-12歳）は大人運賃の50%から・大人の同伴が必要、乳児（14日-2歳）は10%で座席なし。妊娠32週以上は医師の証明、ペットは48時間前の申請（デモ規定）。',
        ko: '아동(2~12세)은 성인 운임의 50%부터·보호자 동반 필요, 유아(14일~2세)는 10%·좌석 없음. 임신 32주 이상은 의사 소견서, 반려동물은 48시간 전 신청(데모 규정).',
        ru: 'Дети (2-12 лет) — от 50 % взрослого тарифа, с сопровождением; младенцы (14 дней-2 года) — 10 %, без места. Беременным после 32 недель нужна справка; питомцев — заявка за 48 часов (демо-правила).',
      },
      chip: {
        zh: '儿童票怎么买？', en: "Children's tickets?", es: '¿Billetes de niño?',
        fr: 'Billets enfant ?', de: 'Kindertickets?', ja: '子ども料金は？',
        ko: '아동 요금은?', ru: 'Детские билеты?',
      },
    },
    {
      id: 'contact',
      k: {
        zh: ['人工', '真人', '电话', '投诉', '转接', '客服热线', '找人', '人工客服'],
        en: ['human', 'agent', 'phone', 'call', 'complaint', 'hotline', 'speak to'],
        es: ['humano', 'agente', 'teléfono', 'llamar', 'queja', 'reclamación'],
        fr: ['humain', 'agent', 'téléphone', 'appel', 'réclamation', 'parler'],
        de: ['mensch', 'mitarbeiter', 'telefon', 'anruf', 'beschwerde', 'berater'],
        ja: ['有人', 'オペレーター', '電話', '苦情', 'つないで', '人間'],
        ko: ['상담원', '사람', '전화', '연결', '불만', '통화'],
        ru: ['человек', 'оператор', 'телефон', 'звонок', 'жалоб', 'специалист'],
      },
      a: {
        zh: '如需人工帮助，请拨打客服热线 400-100-1157（演示号码），服务时间 09:00-21:00。当前在线客服 7×24 为您服务，也可以先在这里描述问题，我会尽力解答。',
        en: 'For human help, call our hotline 400-100-1157 (demo number), 09:00-21:00. This chat assistant is online 24/7 — describe your issue here first and I will do my best.',
        es: 'Para ayuda humana, llama al 400-100-1157 (número demo), 09:00-21:00. Este asistente en línea está 24/7: describe tu caso aquí y haré lo posible.',
        fr: 'Pour une aide humaine, appelez le 400-100-1157 (numéro démo), 09:00-21:00. Cet assistant en ligne est disponible 24/7 : décrivez votre demande ici, je ferai de mon mieux.',
        de: 'Für menschliche Hilfe: Hotline 400-100-1157 (Demo-Nummer), 09:00-21:00. Dieser Online-Assistent ist rund um die Uhr erreichbar — beschreiben Sie Ihr Anliegen hier, ich tue mein Bestes.',
        ja: '有人対応はホットライン 400-100-1157（デモ番号）09:00-21:00。このオンラインアシスタントは24時間対応します。ここで内容をお伝えいただければ、できる限りお答えします。',
        ko: '상담원 연결은 400-100-1157(데모 번호), 09:00-21:00. 온라인 어시스턴트는 24시간 이용 가능합니다. 여기서 문의 내용을 알려주시면 최선을 다해 답변드립니다.',
        ru: 'Для живого оператора: горячая линия 400-100-1157 (демо-номер), 09:00-21:00. Этот онлайн-ассистент на связи 24/7 — опишите вопрос здесь, я сделаю всё возможное.',
      },
      chip: {
        zh: '转人工客服？', en: 'Talk to a human?', es: '¿Hablar con una persona?',
        fr: 'Parler à un humain ?', de: 'Mit Mitarbeiter sprechen?', ja: '有人対応は？',
        ko: '상담원 연결?', ru: 'Оператор?',
      },
    },
    {
      id: 'greet',
      k: {
        zh: ['你好', '您好', '在吗', '嗨', 'hello', 'hi', '在不在', '哈喽'],
        en: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon'],
        es: ['hola', 'buenas', 'buenos días', 'buenas tardes'],
        fr: ['bonjour', 'salut', 'bonsoir', 'bonne journée'],
        de: ['hallo', 'guten tag', 'hi', 'guten morgen'],
        ja: ['こんにちは', 'おはよう', 'はじめまして', 'どうも'],
        ko: ['안녕', '헬로', '처음', '반가워'],
        ru: ['здравств', 'привет', 'добрый день', 'добрый вечер'],
      },
      a: {
        zh: '您好！很高兴为您服务 🥭 我可以帮您了解订票流程、退改签、行李额度、值机选座、发票、会员权益等问题，直接问我就好。',
        en: 'Hello! Happy to help 🥭 I can assist with booking, refunds & changes, baggage, check-in, invoices and membership — just ask.',
        es: '¡Hola! Encantado de ayudarte 🥭 Puedo informarte sobre reservas, cambios, equipaje, check-in, facturas y membresía. Pregúntame lo que quieras.',
        fr: 'Bonjour ! Ravi de vous aider 🥭 Je peux vous renseigner sur la réservation, les changements, les bagages, l\'enregistrement, les factures et l\'adhésion.',
        de: 'Hallo! Gerne für Sie da 🥭 Ich helfe bei Buchung, Umbuchung, Gepäck, Check-in, Rechnungen und Mitgliedschaft — fragen Sie einfach.',
        ja: 'こんにちは！お手伝いします 🥭 予約・変更・手荷物・チェックイン・領収書・会員特典についてお答えします。どうぞお気軽に。',
        ko: '안녕하세요! 도와드리겠습니다 🥭 예약·변경·수하물·체크인·영수증·멤버십 혜택에 대해 안내합니다. 편하게 물어보세요.',
        ru: 'Здравствуйте! Рад помочь 🥭 Расскажу о бронировании, изменениях, багаже, регистрации, счетах и льготах — спрашивайте.',
      },
      chip: null,
    },
  ];

  /* 快选问题：两批轮换 */
  var CHIP_GROUPS = [
    ['booking', 'refund', 'baggage', 'member'],
    ['checkin', 'invoice', 'payment', 'special'],
  ];

  function lang() {
    return (typeof App !== 'undefined' && LANGS.indexOf(App.lang) >= 0) ? App.lang : 'zh';
  }
  function T(s) { return (typeof t === 'function') ? t(s) : s; }
  function kbEntry(id) { return KB.filter(function (e) { return e.id === id; })[0]; }
  function entryText(e, field) {
    var l = lang();
    return (e[field] && (e[field][l] || e[field].en)) || (e[field] && e[field].zh) || '';
  }

  /* ---------- 本地知识库匹配 ---------- */
  /* 两段匹配：先强关键词（主题词，如「儿童票」「退票」），
   * 无命中再弱关键词（泛化问法，如「怎么买」）——避免
   * 「怎么买儿童票」被「怎么买」抢匹配。 */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }
  function bestByKeys(q, keyList) {
    var best = null, bestScore = 0;
    KB.forEach(function (e) {
      var keys = keyList(e);
      keys.forEach(function (k) {
        var kk = norm(k);
        if (kk && q.indexOf(kk) >= 0 && kk.length > bestScore) {
          bestScore = kk.length;
          best = e;
        }
      });
    });
    return best;
  }
  function matchKB(text) {
    var q = norm(text);
    if (!q) return null;
    var l = lang();
    var strong = bestByKeys(q, function (e) { return (e.k && (e.k[l] || e.k.en)) || []; });
    if (strong) return strong;
    var booking = kbEntry('booking');
    if (booking && booking.kw) {
      var keys = booking.kw[l] || booking.kw.en || [];
      for (var i = 0; i < keys.length; i++) {
        var kk = norm(keys[i]);
        if (kk && q.indexOf(kk) >= 0) return booking;
      }
    }
    return null;
  }
  function localAnswer(text) {
    var e = matchKB(text);
    if (e) return entryText(e, 'a');
    return T('这个问题我还在学习中，您可以换个说法，或拨打客服热线 400-100-1157（演示）。');
  }

  /* 精简系统提示：小模型按调用计费，每轮都携带，越短越省 Token */
  function systemPrompt() {
    var l = lang();
    var P = {
      zh: '你是芒果航空官方客服。本航司为演示站点：票价、退改签、行李、会员政策均为演示设定，无真实支付。请用简体中文简洁回答订票、退改、行李、值机、发票、会员、支付、航班动态等问题；不确定时建议拨打客服热线 400-100-1157（09:00-21:00，演示）。150 字以内。',
      en: 'You are Mango Air customer service. Mango Air is a demo airline: fares, refund rules, baggage and membership are demo settings, no real payments. Answer briefly in the user\'s language about booking, refunds, baggage, check-in, invoices, membership, payment, flight status; if unsure, suggest demo hotline 400-100-1157 (09:00-21:00). Under 100 words.',
      es: 'Eres atención al cliente de Mango Air, aerolínea demo: tarifas, cambios, equipaje y membresía son ajustes de demo, sin pagos reales. Responde breve en español sobre reservas, cambios, equipaje, check-in, facturas, membresía, pagos y estado de vuelos; si dudas, sugiere la línea demo 400-100-1157 (09:00-21:00). Menos de 100 palabras.',
      fr: 'Vous êtes le service client de Mango Air, compagnie démo : tarifs, changements, bagages et adhésion sont des réglages de démo, sans paiement réel. Répondez brièvement en français sur réservation, changements, bagages, enregistrement, factures, adhésion, paiement, état des vols ; en cas de doute, ligne démo 400-100-1157 (09:00-21:00). Moins de 100 mots.',
      de: 'Sie sind Kundenbetreuung von Mango Air, Demo-Airline: Tarife, Umbuchungen, Gepäck und Mitgliedschaft sind Demo-Einstellungen, keine echten Zahlungen. Antworten Sie knapp auf Deutsch zu Buchung, Umbuchung, Gepäck, Check-in, Rechnungen, Mitgliedschaft, Zahlung, Flugstatus; bei Unsicherheit Demo-Hotline 400-100-1157 (09:00-21:00). Unter 100 Wörter.',
      ja: 'あなたはマンゴ航空のカスタマーサポートです。デモ航空会社のため運賃・変更・手荷物・会員規定はデモ設定、実際の決済はありません。日本語で簡潔に、予約・変更・手荷物・チェックイン・領収書・会員・支払・運航状況について回答。不明時はデモホットライン 400-100-1157（09:00-21:00）を案内。100文字以内。',
      ko: '당신은 망고항공 고객지원입니다. 데모 항공사로 운임·변경·수하물·멤버십 정책은 데모 설정이며 실제 결제는 없습니다. 한국어로 간결하게 예약·변경·수하물·체크인·영수증·멤버십·결제·운항 현황에 대해 답변하세요. 불확실하면 데모 핫라인 400-100-1157(09:00-21:00)을 안내. 100자 이내.',
      ru: 'Вы — поддержка Mango Air, демо-авиакомпании: тарифы, обмен, багаж и уровни участия — демо-настройки, реальных платежей нет. Отвечайте кратко на русском о бронировании, обмене, багаже, регистрации, счетах, участии, оплате, статусе рейсов; если не уверены — демо-горячая линия 400-100-1157 (09:00-21:00). До 80 слов.',
    };
    return P[l] || P.zh;
  }

  function callAI(text) {
    var cfg = state.cfg;
    if (!cfg.endpoint || !cfg.apiKey) return Promise.reject(new Error('未配置 AI 客服端点或 Key'));
    var url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
    var prior = state.history.slice(-6).filter(function (m) { return m.role === 'user' || m.role === 'bot'; })
      .map(function (m) { return { role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }; });
    var body = {
      model: cfg.model || 'doubao-seed-2-1-pro-260915',
      messages: [{ role: 'system', content: systemPrompt() }].concat(prior, [{ role: 'user', content: text }]),
      temperature: 0.3,
      max_tokens: 400,
      /* 豆包 Seed 2.x 默认开启深度思考，会消耗大量 reasoning tokens；
       * 客服问答关闭思考，显著节省 Token（仍保留关闭失败时的兼容）。 */
      extra_body: { thinking: { type: 'disabled' } },
    };
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, CHAT_TIMEOUT) : null;
    var t0 = Date.now();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      state.lastLatency = Date.now() - t0;
      state.lastOkAt = Date.now();
      state.lastError = null;
      var msg = data && data.choices && data.choices[0] && data.choices[0].message;
      var content = msg && (msg.content || msg.reasoning_content);
      if (!content || !String(content).trim()) throw new Error('AI 返回内容为空');
      return String(content).trim();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      state.lastError = err && err.name === 'AbortError' ? '请求超时' : String((err && err.message) || err);
      throw err;
    });
  }

  /* ============================================================
     UI
     ============================================================ */
  var el = {};

  function buildUI() {
    if (el.root) return;
    var fab = document.createElement('button');
    fab.className = 'cs-fab';
    fab.id = 'csFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', T('打开官方客服'));
    fab.textContent = '💬';
    fab.onclick = toggle;

    var panel = document.createElement('section');
    panel.className = 'cs-panel';
    panel.id = 'csPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', T('官方客服'));
    panel.innerHTML =
      '<header class="cs-head">' +
      '  <div class="cs-head-info">' +
      '    <span class="cs-ava" aria-hidden="true">🥭</span>' +
      '    <div class="cs-head-txt"><b id="csTitle">' + T('官方客服') + '</b>' +
      '      <small id="csMode"><i class="cs-dot"></i><span id="csModeText"></span></small></div>' +
      '  </div>' +
      '  <div class="cs-head-acts">' +
      '    <button class="cs-ico" id="csClear" type="button" aria-label="' + T('清空对话') + '" title="' + T('清空对话') + '">🗑</button>' +
      '    <button class="cs-ico" id="csClose" type="button" aria-label="' + T('关闭客服') + '" title="' + T('关闭客服') + '">✕</button>' +
      '  </div>' +
      '</header>' +
      '<div class="cs-msgs" id="csMsgs" aria-live="polite"></div>' +
      '<div class="cs-chips" id="csChips"></div>' +
      '<form class="cs-input" id="csForm">' +
      '  <input class="cs-text" id="csText" type="text" placeholder="' + T('输入您的问题…') + '" autocomplete="off" maxlength="200">' +
      '  <button class="cs-send" id="csSend" type="submit">' + T('发送') + '</button>' +
      '</form>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    el.root = panel; el.fab = fab;
    el.msgs = panel.querySelector('#csMsgs');
    el.chips = panel.querySelector('#csChips');
    el.form = panel.querySelector('#csForm');
    el.text = panel.querySelector('#csText');
    el.modeText = panel.querySelector('#csModeText');
    el.dot = panel.querySelector('.cs-dot');

    panel.querySelector('#csClose').onclick = close;
    panel.querySelector('#csClear').onclick = clearHistory;
    el.form.onsubmit = function (e) {
      e.preventDefault();
      var v = el.text.value.trim();
      if (!v || state.pending) return;
      el.text.value = '';
      send(v);
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) close();
    });
    refreshMode();
    /* 静默验证连通性（max_tokens:1，极省 Token）：用户开通模型后，
     * 每次打开面板即如实显示「AI 客服在线」；否则保持本地客服。 */
    if (state.cfg.enabled && state.cfg.endpoint && state.cfg.apiKey) {
      testConnection().then(function (r) { state.verified = r.ok; refreshMode(); });
    }
  }

  function refreshMode() {
    if (!el.modeText) return;
    /* 只有真实连通验证通过后才显示「AI 客服在线」，避免「配置存在即
     * 乐观判定」导致徽章误导（如浏览器 CORS 拦真正的请求时仍显示在线）。 */
    var online = !!state.verified;
    el.modeText.textContent = online ? T('AI 客服在线') : T('本地客服在线');
    el.dot.className = 'cs-dot ' + (online ? 'ai' : 'local');
  }

  function timeStr(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderMessages() {
    if (!el.msgs) return;
    el.msgs.innerHTML = '';
    state.history.forEach(function (m) { el.msgs.appendChild(bubbleEl(m)); });
    if (!state.history.length) {
      var w = { role: 'bot', mode: 'local', ts: Date.now(), text: T('你好，我是芒果航空官方客服 🥭') + ' ' + T('请问有什么可以帮您？点击下方快捷问题，或直接输入。') };
      state.history.push(w);
      saveHistory(state.history);
      el.msgs.appendChild(bubbleEl(w));
    }
    renderChips();
    scrollBottom();
  }

  function bubbleEl(m) {
    var wrap = document.createElement('div');
    if (m.role === 'note') {
      wrap.className = 'cs-note';
      wrap.textContent = m.text;
      return wrap;
    }
    wrap.className = 'cs-msg ' + (m.role === 'user' ? 'user' : 'bot');
    var b = document.createElement('div');
    b.className = 'cs-bubble';
    b.textContent = m.text;
    var meta = document.createElement('span');
    meta.className = 'cs-meta';
    meta.textContent = (m.role === 'user' ? '' : (m.mode === 'ai' ? 'AI · ' : T('本地客服') + ' · ')) + timeStr(m.ts || Date.now());
    b.appendChild(meta);
    wrap.appendChild(b);
    return wrap;
  }

  function renderChips() {
    if (!el.chips) return;
    var group = CHIP_GROUPS[state.chipSet % CHIP_GROUPS.length];
    el.chips.innerHTML = '';
    group.forEach(function (id) {
      var e = kbEntry(id);
      if (!e) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-chip';
      b.textContent = entryText(e, 'chip');
      b.onclick = function () { send(entryText(e, 'chip')); };
      el.chips.appendChild(b);
    });
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'cs-chip cs-chip-more';
    more.textContent = T('换一批');
    more.onclick = function () { state.chipSet++; renderChips(); };
    el.chips.appendChild(more);
  }

  function scrollBottom() {
    requestAnimationFrame(function () {
      if (el.msgs) el.msgs.scrollTop = el.msgs.scrollHeight;
    });
  }

  function pushMsg(m) {
    state.history.push(m);
    saveHistory(state.history);
    if (el.msgs) { el.msgs.appendChild(bubbleEl(m)); scrollBottom(); }
  }

  function showTyping() {
    hideTyping();
    var d = document.createElement('div');
    d.className = 'cs-msg bot';
    d.id = 'csTyping';
    d.innerHTML = '<div class="cs-bubble cs-typing"><i></i><i></i><i></i></div>';
    if (el.msgs) { el.msgs.appendChild(d); scrollBottom(); }
  }
  function hideTyping() {
    var d = document.getElementById('csTyping');
    if (d) d.remove();
  }

  /* ---------- 发送 / 应答 ---------- */
  function send(text) {
    text = String(text || '').trim();
    if (!text || state.pending) return;
    pushMsg({ role: 'user', text: text, ts: Date.now() });
    state.pending = true;
    showTyping();
    var minDelay = new Promise(function (r) { setTimeout(r, 450); });
    // 本地知识库命中（数据库里相似的问题）→ 直接用本地回答，不调豆包，省 Token
    var hit = matchKB(text);
    // AI 仅作兜底：本地答不上来、且已配置 AI 通道时才调用
    var useAI = !hit && !!(state.cfg.enabled && state.cfg.endpoint && state.cfg.apiKey);
    var aiP = useAI ? callAI(text).catch(function (err) {
      state.aiBroken = true;
      state.verified = false;
      refreshMode();
      var local = localAnswer(text);
      minDelay.then(function () {
        hideTyping();
        pushMsg({ role: 'note', text: T('AI 暂不可用，已切换本地客服'), ts: Date.now() });
        pushMsg({ role: 'bot', mode: 'local', text: local, ts: Date.now() });
        state.pending = false;
      });
      return null; // 已处理，走 then 的空分支
    }) : Promise.resolve(null);

    aiP.then(function (aiText) {
      return minDelay.then(function () {
        hideTyping();
        if (aiText) {
          state.verified = true;
          refreshMode();
          pushMsg({ role: 'bot', mode: 'ai', text: aiText, ts: Date.now() });
        } else if (!useAI) {
          pushMsg({ role: 'bot', mode: 'local', text: localAnswer(text), ts: Date.now() });
        }
        state.pending = false;
      });
    });
  }

  /* ---------- 开关 ---------- */
  function open() {
    buildUI();
    state.open = true;
    el.root.hidden = false;
    el.fab.classList.add('on');
    renderMessages();
    refreshMode();
    /* 每次打开面板时若尚未验证连通，则静默复测：开通模型后无需刷新
     * 页面，打开客服即自动切到 AI 通道（max_tokens:1，极省）。 */
    if (state.cfg.enabled && state.cfg.endpoint && state.cfg.apiKey && !state.verified) {
      testConnection().then(function (r) { state.verified = r.ok; refreshMode(); });
    }
    setTimeout(function () { if (el.text) el.text.focus(); }, 120);
  }
  function close() {
    state.open = false;
    if (el.root) el.root.hidden = true;
    if (el.fab) el.fab.classList.remove('on');
  }
  function toggle() { state.open ? close() : open(); }

  function clearHistory() {
    state.history = [];
    saveHistory(state.history);
    if (el.msgs) el.msgs.innerHTML = '';
    renderMessages();
    if (typeof toast === 'function') toast(T('对话已清空'));
  }

  /* 语言切换：重渲染面板静态文案与快选问题（历史消息保留原语言） */
  function onLangChange() {
    if (!el.root) return;
    el.fab.setAttribute('aria-label', T('打开官方客服'));
    el.root.setAttribute('aria-label', T('官方客服'));
    var title = document.getElementById('csTitle');
    if (title) title.textContent = T('官方客服');
    var clr = document.getElementById('csClear');
    if (clr) { clr.setAttribute('aria-label', T('清空对话')); clr.title = T('清空对话'); }
    var cls = document.getElementById('csClose');
    if (cls) { cls.setAttribute('aria-label', T('关闭客服')); cls.title = T('关闭客服'); }
    if (el.text) el.text.placeholder = T('输入您的问题…');
    var snd = document.getElementById('csSend');
    if (snd) snd.textContent = T('发送');
    renderChips();
    refreshMode();
  }

  /* ============================================================
     配置 / 状态（设置页调用）
     ============================================================ */
  function getConfig() { return Object.assign({}, state.cfg); }
  function setConfig(patch) {
    Object.assign(state.cfg, patch || {});
    if (state.cfg.enabled && !state.cfg.endpoint) state.cfg.enabled = false;
    saveCfg(state.cfg);
    state.aiBroken = false;
    refreshMode();
    return getConfig();
  }
  function getStatus() {
    return {
      mode: state.verified ? 'ai' : 'local',
      endpoint: state.cfg.endpoint,
      model: state.cfg.model,
      lastError: state.lastError,
      lastLatency: state.lastLatency,
      lastOkAt: state.lastOkAt,
      sessionAiBroken: state.aiBroken,
    };
  }
  function testConnection() {
    var cfg = state.cfg;
    if (!cfg.endpoint) return Promise.resolve({ ok: false, message: T('请先填写 AI 客服端点地址') });
    if (!cfg.apiKey) return Promise.resolve({ ok: false, message: T('请先填写 API Key') });
    var url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TEST_TIMEOUT) : null;
    var t0 = Date.now();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: cfg.model || 'doubao-seed-2-1-pro-260915',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      state.lastLatency = Date.now() - t0;
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (data) {
          var m = data && data.error && data.error.message;
          throw new Error(m || ('HTTP ' + res.status));
        });
      }
      state.lastOkAt = Date.now();
      state.lastError = null;
      state.verified = true;
      refreshMode();
      return { ok: true, message: T('客服连接测试通过，延迟 {n}ms').replace('{n}', state.lastLatency) };
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      state.lastError = err && err.name === 'AbortError' ? '请求超时' : String((err && err.message) || err);
      state.verified = false;
      refreshMode();
      return { ok: false, message: state.lastError };
    });
  }

  global.MangoService = {
    init: buildUI,
    open: open,
    close: close,
    toggle: toggle,
    send: send,
    onLangChange: onLangChange,
    getConfig: getConfig,
    setConfig: setConfig,
    getStatus: getStatus,
    testConnection: testConnection,
    clearHistory: clearHistory,
    PRESET_API_KEY: PRESET_API_KEY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
