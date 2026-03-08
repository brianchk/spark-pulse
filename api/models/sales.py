"""Sales data models."""

from pydantic import BaseModel


class DailySales(BaseModel):
    date: str
    store_id: str
    store_name: str
    net_revenue: float
    transaction_count: int


class DailySalesResponse(BaseModel):
    data: list[DailySales]
    period: str
    stores: list[str]
