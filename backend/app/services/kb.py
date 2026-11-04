"""本地知识库兜底：无 Key / 在线 AI 失败时使用，保证对话不中断。"""

KB_ZH = [
    ("退票", "退票可在「我的订单」中发起：起飞前 24 小时以上收 10% 手续费，24 小时内收 20%。演示站点不产生真实扣费。"),
    ("改签", "同舱位改签免费一次，跨舱位补差价；演示环境不真实计费。"),
    ("行李", "经济舱免费托运 20kg，公务舱 30kg；随身行李限 5kg、尺寸 55×40×20cm。"),
    ("值机", "起飞前 48 小时开放线上值机，机场值机截止为起飞前 45 分钟。"),
    ("会员", "芒果会员分银卡/金卡/黑卡，累计里程可兑换升舱与免费机票。"),
    ("发票", "行程结束后可在「我的订单 → 申请发票」开具电子发票，约 1-3 个工作日。"),
    ("支付", "支持微信、支付宝、银联；演示环境不发生真实扣款。"),
    ("航班动态", "本演示站航班动态为模拟数据，真实动态请以航司官方渠道为准。"),
    ("客服", "人工客服热线 400-100-1157，服务时间 09:00-21:00（演示）。"),
    ("价格", "票价随季节与余票浮动，演示数据仅供参考。"),
]

KB_EN = [
    ("refund", "Refunds in 'My Orders': 10% fee 24h+ before departure, 20% within 24h. Demo site, no real charge."),
    ("rebook", "Same-cabin rebooking free once; cross-cabin pays fare difference. Demo, no real billing."),
    ("baggage", "Economy 20kg free checked; Business 30kg. Cabin bag max 5kg, 55x40x20cm."),
    ("check-in", "Online check-in opens 48h before departure; airport desk closes 45 min before."),
    ("member", "Mango membership: Silver/Gold/Black. Miles redeem upgrades and free tickets."),
    ("invoice", "Request e-invoice in 'My Orders -> Invoice', issued in 1-3 business days."),
    ("payment", "WeChat, Alipay, UnionPay supported. Demo environment, no real charge."),
    ("status", "Flight status here is simulated; trust official airline channels for real status."),
    ("contact", "Hotline 400-100-1157, 09:00-21:00 (demo)."),
    ("price", "Fares float with season and seat availability; demo data is for reference only."),
]

FALLBACK = {
    "zh": "这个问题我还在学习中，您可以换个说法，或拨打客服热线 400-100-1157（09:00-21:00，演示）。",
    "en": "I'm still learning that one. Try rephrasing, or call our hotline 400-100-1157 (09:00-21:00, demo).",
}


def local_answer(text: str, lang: str = "zh") -> str:
    t = (text or "").lower()
    kb = KB_EN if lang == "en" else KB_ZH
    for kw, ans in kb:
        if kw.lower() in t:
            return ans
    return FALLBACK.get(lang, FALLBACK["zh"])
