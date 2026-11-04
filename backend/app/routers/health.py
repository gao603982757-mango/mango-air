from fastapi import APIRouter

from ..config import settings

router = APIRouter()


@router.get("/")
def root():
    return {"service": "mango-air-backend", "status": "ok", "version": "1.0.0"}


@router.get("/api/health")
def health():
    return {
        "status": "ok",
        "ai_enabled": settings.has_doubao_key,
        "model": settings.doubao_model if settings.has_doubao_key else None,
    }
