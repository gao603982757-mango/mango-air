import json
import os
from typing import List, Optional

from ..models import Flight

DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "flights.json"
)


def load_flights() -> List[Flight]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return [Flight(**row) for row in json.load(f)]


def search_flights(
    from_city: Optional[str] = None,
    to_city: Optional[str] = None,
    date: Optional[str] = None,
) -> List[Flight]:
    """按出发城市 / 到达城市 / 日期筛选航班（演示数据）。"""
    flights = load_flights()
    out = []
    for fl in flights:
        if from_city and fl.from_city != from_city:
            continue
        if to_city and fl.to_city != to_city:
            continue
        if date and fl.date != date:
            continue
        out.append(fl)
    return out


def all_cities() -> List[str]:
    flights = load_flights()
    cities = set()
    for fl in flights:
        cities.add(fl.from_city)
        cities.add(fl.to_city)
    return sorted(cities)
