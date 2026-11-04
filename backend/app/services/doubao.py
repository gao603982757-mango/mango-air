import httpx

from ..config import settings

SYSTEM_PROMPT = (
    "你是芒果航空（Mango Air）的官方客服助手。芒果航空是一个演示航司："
    "票价、退改、行李、会员均为演示设定，无真实支付。"
    "请用用户所用语言，简要回答关于预订、退改、行李、值机、发票、会员、支付、航班动态的问题；"
    "不确定时建议演示热线 400-100-1157（09:00-21:00）。回答不超过 100 字。"
)


async def chat(messages: list, lang: str = "zh") -> str:
    """调用豆包（OpenAI 兼容 chat completions）。Key 来自服务端环境变量，前端无 Key。"""
    if not settings.has_doubao_key:
        raise RuntimeError("未配置 DOUBAO_API_KEY")

    url = settings.doubao_endpoint.rstrip("/") + "/chat/completions"
    payload = {
        "model": settings.doubao_model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "max_tokens": 300,
        "temperature": 0.6,
        "stream": False,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.doubao_api_key}",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"豆包接口返回 {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
