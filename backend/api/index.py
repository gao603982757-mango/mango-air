"""Vercel serverless 入口。

Vercel 的 Python Runtime 是「beta」，需用 Mangum 把 ASGI(FastAPI) 包成
Lambda 风格 handler。把 Vercel 项目的 Root Directory 设为 `backend`，
Vercel 会自动找到本文件与 backend/requirements.txt。

本地用 `uvicorn app.main:app` 跑时这个文件不会被用到，互不干扰。
"""

import sys
from pathlib import Path

# 确保能 import 到 backend/app 包（Vercel 运行时 cwd 不保证是 backend）
_BACKEND_ROOT = str(Path(__file__).resolve().parent.parent)
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app.main import app  # noqa: E402
from mangum import Mangum  # noqa: E402

# lifespan="off"：本项目没有 startup/shutdown 事件，关闭以避免 Vercel 下的兼容问题
handler = Mangum(app, lifespan="off")
