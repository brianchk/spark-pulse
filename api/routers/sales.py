"""Sales API endpoints."""

import asyncio
from functools import partial

from fastapi import APIRouter, Query

from api.core.cache import cache_get, cache_set
from api.queries.sales import query_trend_yoy

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.get("/trend")
async def get_sales_trend(
    granularity: str = Query("weekly", description="daily, weekly, or monthly"),
    periods: int = Query(20, ge=4, le=365, description="Number of periods"),
    same_store: bool = Query(False, description="Exclude new stores (PP, MG)"),
    store: str | None = Query(None, description="Comma-separated store IDs"),
):
    """Sales trend with YoY comparison. Values are daily averages."""
    cache_key = f"trend:{granularity}:{periods}:{same_store}:{store}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    store_ids = store.split(",") if store else None

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, partial(query_trend_yoy, granularity, periods, same_store, store_ids))

    cache_set(cache_key, result)
    return result
