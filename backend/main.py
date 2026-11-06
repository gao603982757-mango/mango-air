"""Vercel FastAPI 部署的根目录入口。

Vercel 新版 Python Runtime 会自动在 main.py / app.py / index.py / app/main.py
等入口里查找名为 `app` 的 FastAPI 实例，并把整个应用作为一个 Function 托管，
所有 /api/* 路径由 FastAPI 路由自行处理（无需 vercel.json 的 rewrites，
也无需 Mangum 适配器）。

本文件把 app/main.py 中真正的 app 原样 re-export 出来；与 app/main.py
指向同一个实例，因此无论 Vercel 选中哪个入口，行为都一致。

本地 `uvicorn app.main:app` 运行不受影响。
"""

import os
import sys

# 保证以任意工作目录加载本文件时，都能 import 到 backend/app 包
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app.main import app  # noqa: E402

__all__ = ["app"]
