# 芒果航空后端 · Mango Air Backend

芒果航空演示站的服务端（Python / FastAPI）。与仓库根目录的静态前端（`index.html`，已部署到 GitHub Pages）配套，构成一个完整项目。

- **航班查询 API**：基于演示数据的航班检索。
- **客服 AI 代理**：服务端调用豆包（火山方舟）等 OpenAI 兼容模型；**API Key 只存在于服务端环境变量，前端永不接触**，从根本上解决前端暴露密钥的问题。
- **本地兜底**：未配置 Key 或在线模型失败时，自动用本地知识库应答，对话不中断。
- **独立 CLI 演示工具**：不依赖 Web 服务，直接命令行运行。

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口 + CORS
│   ├── config.py            # 配置（读环境变量）
│   ├── models.py            # Pydantic 模型
│   ├── routers/
│   │   ├── health.py        # GET  /  与  /api/health
│   │   ├── flights.py       # GET  /api/flights
│   │   └── assistant.py     # POST /api/assistant/chat
│   └── services/
│       ├── flight_data.py   # 航班查询
│       ├── doubao.py        # 豆包/OpenAI 兼容客户端（Key 走服务端）
│       └── kb.py            # 本地知识库兜底
├── data/flights.json        # 演示航班数据
├── scripts/demo.py          # 独立 CLI 演示工具
├── requirements.txt
├── Dockerfile
└── .env.example
```

## 快速开始（本地运行）

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # 可选，建虚拟环境
pip install -r requirements.txt

cp .env.example .env        # 然后按需填入 DOUBAO_API_KEY（不填也能跑，走本地兜底）
uvicorn app.main:app --reload --port 8000
```

启动后访问：

- `http://127.0.0.1:8000/` → 服务信息
- `http://127.0.0.1:8000/docs` → 自动生成的 Swagger 接口文档
- `http://127.0.0.1:8000/api/health` → 健康检查（含 `ai_enabled` 状态）
- `http://127.0.0.1:8000/api/flights?from=北京&to=上海` → 航班查询

## 环境变量（.env）

| 变量 | 说明 | 默认 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包/火山方舟 Key（服务端专用） | 空（空则走本地兜底） |
| `DOUBAO_ENDPOINT` | OpenAI 兼容端点 | `https://ark.cn-beijing.volces.com/api/v3` |
| `DOUBAO_MODEL` | 模型名 | `doubao-seed-2-1-pro-260915` |
| `CORS_ORIGINS` | 允许跨域的前端域名，逗号分隔，`*` 为全部 | `*` |

## API 一览

### GET /api/flights
查询航班。参数：`from`（出发城市）、`to`（到达城市）、`date`（YYYY-MM-DD）。
```bash
curl "http://127.0.0.1:8000/api/flights?from=北京&to=上海"
```

### POST /api/assistant/chat
客服对话。配了 Key 走在线 AI，否则本地兜底。
```bash
curl -X POST "http://127.0.0.1:8000/api/assistant/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"怎么退票？","history":[],"lang":"zh"}'
```
返回：`{"reply":"...","mode":"ai" | "local"}`

### GET /api/health
健康检查，返回 `ai_enabled`（是否已配置 Key）与所用模型。

## 独立 CLI 演示工具

无需启动 Web 服务，直接跑：

```bash
python scripts/demo.py cities
python scripts/demo.py flights --from 北京 --to 上海 --date 2026-11-10
python scripts/demo.py price 北京 上海
```

## 与前端对接（可选）

前端（GitHub Pages）若要调用本后端，把请求发到后端公网地址，并让 `CORS_ORIGINS` 包含你的 Pages 域名：

```js
const res = await fetch('https://你的后端域名/api/assistant/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '怎么退票？', history: [], lang: 'zh' }),
});
const { reply, mode } = await res.json();
```

## 部署（可选，免费托管）

**Docker**
```bash
docker build -t mango-air-backend ./backend
docker run -p 8000:8000 --env-file ./backend/.env mango-air-backend
```

**Render / Railway**：连此仓库，Build Command `pip install -r requirements.txt`，Start Command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`，并在平台环境变量里配置 `DOUBAO_API_KEY`。
