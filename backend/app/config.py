import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """运行时配置，全部来自环境变量（.env）。Key 只在服务端存在，前端永不接触。"""

    def __init__(self):
        self.doubao_api_key: str = os.getenv("DOUBAO_API_KEY", "")
        self.doubao_endpoint: str = os.getenv(
            "DOUBAO_ENDPOINT", "https://ark.cn-beijing.volces.com/api/v3"
        )
        self.doubao_model: str = os.getenv("DOUBAO_MODEL", "doubao-seed-2-1-pro-260915")
        raw = os.getenv("CORS_ORIGINS", "*")
        self.cors_origins: list = [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def has_doubao_key(self) -> bool:
        return bool(self.doubao_api_key)


settings = Settings()
