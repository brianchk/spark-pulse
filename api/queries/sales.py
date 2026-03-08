"""Sales data queries against MongoDB."""

from collections import defaultdict
from datetime import date, timedelta

from api.core.db import get_mongo_db

# Store ID → display name mapping
STORE_MAP: dict[str, str] = {
    "1": "QRE",
    "25": "LG2",
    "26": "K11",
    "40": "RB",
    "41": "QRC",
    "54": "HC",
    "68": "GLOW",
    "77": "MG",
    "81": "PP",
    "3": "Shopify",
    "7": "HKTV",
    "4": "Wholesale",
}

# Retail store IDs (default filter — excludes online/wholesale)
RETAIL_STORE_IDS = ["1", "25", "26", "40", "41", "54", "68", "77", "81"]

# Same-store: exclude new locations (MG opened May 2025, PP opened Oct 2025)
SAME_STORE_EXCLUDE = {"77", "81"}  # MG, PP


def _iso_week_label(d: date) -> str:
    return f"W{d.isocalendar()[1]}"


def _month_label(d: date) -> str:
    return d.strftime("%b %y")  # e.g. "Mar 26"


def _fetch_daily_by_store(
    start: date,
    end: date,
    store_ids: list[str],
) -> list[dict]:
    """Fetch daily data from MongoDB, grouped by date + store."""
    db = get_mongo_db()
    coll = db["transactioncacheaggregations"]
    pipeline = [
        {
            "$match": {
                "storeId": {"$in": store_ids},
                "transactionDate": {"$gte": start.isoformat(), "$lte": end.isoformat()},
            }
        },
        {
            "$group": {
                "_id": {"storeId": "$storeId", "date": "$transactionDate"},
                "nr": {"$sum": "$netSalesAll"},
                "tc": {"$sum": "$transactionCountAll"},
            }
        },
    ]
    rows = []
    for doc in coll.aggregate(pipeline):
        sid = doc["_id"]["storeId"]
        rows.append(
            {
                "date": doc["_id"]["date"],
                "store_id": sid,
                "store_name": STORE_MAP.get(sid, f"Store {sid}"),
                "nr": doc["nr"],
                "tc": doc["tc"],
            }
        )
    return rows


def _bucket_to_periods(
    rows: list[dict],
    granularity: str,
) -> dict[str, dict[str, dict]]:
    """Bucket daily rows into period → store → {nr, tc, days}.

    For daily granularity, period key is the ISO date.
    For weekly, period key is 'W10' etc.
    For monthly, period key is 'Mar 26' etc.
    """
    buckets: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"nr": 0.0, "tc": 0, "days": set()}))

    for row in rows:
        d = date.fromisoformat(row["date"])
        if granularity == "daily":
            period = row["date"]
        elif granularity == "weekly":
            period = _iso_week_label(d)
        else:  # monthly
            period = _month_label(d)

        b = buckets[period][row["store_name"]]
        b["nr"] += row["nr"]
        b["tc"] += row["tc"]
        b["days"].add(row["date"])

    return buckets


def _resolve_store_ids(same_store: bool, store_ids: list[str] | None) -> list[str]:
    ids = store_ids if store_ids is not None else list(RETAIL_STORE_IDS)
    if same_store:
        ids = [sid for sid in ids if sid not in SAME_STORE_EXCLUDE]
    return ids


def _compute_date_ranges(
    granularity: str,
    periods: int,
) -> tuple[date, date, date, date]:
    """Compute CY and PY date ranges based on granularity and period count."""
    today = date.today()

    if granularity == "daily":
        cy_end = today - timedelta(days=1)  # yesterday (today may be incomplete)
        cy_start = cy_end - timedelta(days=periods - 1)
    elif granularity == "weekly":
        days_since_sunday = (today.weekday() + 1) % 7
        cy_end = today - timedelta(days=days_since_sunday)
        cy_start = cy_end - timedelta(weeks=periods) + timedelta(days=1)
    else:  # monthly
        # Go back N months from current month
        cy_end = today.replace(day=1) - timedelta(days=1)  # end of last month
        m = cy_end.month - periods + 1
        y = cy_end.year
        while m < 1:
            m += 12
            y -= 1
        cy_start = date(y, m, 1)

    # PY: 52 weeks (364 days) back
    py_offset = timedelta(days=364)
    py_start = cy_start - py_offset
    py_end = cy_end - py_offset

    return cy_start, cy_end, py_start, py_end


def _generate_period_labels(
    start: date,
    end: date,
    granularity: str,
) -> list[str]:
    """Generate ordered period labels for the date range."""
    labels: list[str] = []
    cursor = start

    if granularity == "daily":
        while cursor <= end:
            labels.append(cursor.isoformat())
            cursor += timedelta(days=1)
    elif granularity == "weekly":
        while cursor <= end:
            wl = _iso_week_label(cursor)
            if not labels or labels[-1] != wl:
                labels.append(wl)
            cursor += timedelta(days=7)
    else:  # monthly
        while cursor <= end:
            ml = _month_label(cursor)
            if not labels or labels[-1] != ml:
                labels.append(ml)
            # Jump to next month
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)

    return labels


def query_trend_yoy(
    granularity: str = "weekly",
    periods: int = 20,
    same_store: bool = False,
    store_ids: list[str] | None = None,
) -> dict:
    """Unified trend query: daily/weekly/monthly with YoY, daily averages.

    Returns {labels, cy: {store: [avg_values]}, py: {store: [avg_values]}, ...}
    """
    store_ids = _resolve_store_ids(same_store, store_ids)
    cy_start, cy_end, py_start, py_end = _compute_date_ranges(granularity, periods)

    # Fetch raw daily data for both CY and PY
    cy_rows = _fetch_daily_by_store(cy_start, cy_end, store_ids)
    py_rows = _fetch_daily_by_store(py_start, py_end, store_ids)

    # Bucket into periods
    cy_buckets = _bucket_to_periods(cy_rows, granularity)
    py_buckets = _bucket_to_periods(py_rows, granularity)

    # Generate ordered labels from CY range
    labels = _generate_period_labels(cy_start, cy_end, granularity)

    # Collect all stores seen
    all_stores = sorted({s for b in [cy_buckets, py_buckets] for period_data in b.values() for s in period_data})

    # Build per-store arrays of daily averages
    def _avg_series(buckets: dict, labels: list[str]) -> dict[str, list[float]]:
        result = {}
        for store in all_stores:
            vals = []
            for label in labels:
                entry = buckets.get(label, {}).get(store)
                if entry and entry["days"]:
                    day_count = len(entry["days"])
                    vals.append(round(entry["nr"] / day_count, 2))
                else:
                    vals.append(0)
            result[store] = vals
        return result

    cy_data = _avg_series(cy_buckets, labels)
    py_data = _avg_series(py_buckets, labels)

    return {
        "labels": labels,
        "cy": cy_data,
        "py": py_data,
        "period_cy": f"{cy_start.isoformat()} to {cy_end.isoformat()}",
        "period_py": f"{py_start.isoformat()} to {py_end.isoformat()}",
        "stores": all_stores,
        "granularity": granularity,
        "same_store": same_store,
        "daily_average": True,
    }
