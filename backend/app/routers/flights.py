from fastapi import APIRouter, Query

from ..services import flight_data

router = APIRouter(prefix="/api/flights", tags=["flights"])


@router.get("")
def list_flights(
    from_city: str = Query(None, alias="from", description="出发城市，如 北京"),
    to_city: str = Query(None, alias="to", description="到达城市，如 上海"),
    date: str = Query(None, description="日期 YYYY-MM-DD"),
):
    flights = flight_data.search_flights(from_city=from_city, to_city=to_city, date=date)
    return {"count": len(flights), "flights": flights}


@router.get("/cities")
def cities():
    return {"cities": flight_data.all_cities()}
