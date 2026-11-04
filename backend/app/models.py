from typing import List, Literal

from pydantic import BaseModel, Field


class Flight(BaseModel):
    flight_no: str
    airline: str
    from_city: str
    to_city: str
    date: str
    depart: str
    arrive: str
    price: float
    duration_min: int
    status: str = "准点"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: List[ChatMessage] = []
    lang: str = "zh"


class ChatResponse(BaseModel):
    reply: str
    mode: str  # 'ai' | 'local'
