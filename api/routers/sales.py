"""Sales API endpoints."""

from datetime import date, timedelta

from fastapi import APIRouter, Query

from api.models.sales import DailySales, DailySalesResponse
from api.queries.sales import query_daily_sales, query_daily_sales_total

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.get("/daily", response_model=DailySalesResponse)
async def get_daily_sales(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    store: str | None = Query(None, description="Comma-separated store IDs (default: all retail)"),
):
    """Daily net revenue by store for the last N days."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    store_ids = store.split(",") if store else None

    rows = query_daily_sales(start_date, end_date, store_ids)

    active_stores = sorted({r["store_name"] for r in rows})

    return DailySalesResponse(
        data=[DailySales(**r) for r in rows],
        period=f"{start_date.isoformat()} to {end_date.isoformat()}",
        stores=active_stores,
    )


@router.get("/daily-total")
async def get_daily_sales_total(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    store: str | None = Query(None, description="Comma-separated store IDs (default: all retail)"),
):
    """Daily total net revenue (all stores summed) for the last N days."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    store_ids = store.split(",") if store else None

    rows = query_daily_sales_total(start_date, end_date, store_ids)

    return {
        "data": rows,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "total_revenue": round(sum(r["net_revenue"] for r in rows), 2),
        "total_transactions": sum(r["transaction_count"] for r in rows),
    }
