from fastapi import APIRouter

from ..config import settings
from ..models import ChatRequest, ChatResponse
from ..services import doubao, kb

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat")
async def chat(req: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    history.append({"role": "user", "content": req.message})

    # 优先走在线 AI：Key 在服务端，前端永远看不到
    if settings.has_doubao_key:
        try:
            reply = await doubao.chat(history, lang=req.lang)
            return ChatResponse(reply=reply, mode="ai")
        except Exception:
            pass  # 失败自动降级本地

    # 本地知识库兜底，对话不中断
    return ChatResponse(reply=kb.local_answer(req.message, lang=req.lang), mode="local")
