"""Sales data queries against MongoDB and SparkDB."""

from collections import defaultdict
from datetime import date, timedelta

from api.core.db import get_mongo_db, sparkdb_query

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

# Retail store IDs as ints (for SparkDB queries — histheader.SN is int)
RETAIL_STORE_SNS = [1, 25, 26, 40, 41, 54, 68, 77, 81]

# Categories to group as "Other" (accounting codes, internal)
_MAINCAT_OTHER = {"Cash Coupon", "優惠券類", "SUPPLIES", "Others"}


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
    group_key: str = "store_name",
) -> dict[str, dict[str, dict]]:
    """Bucket daily rows into period → group → {nr, tc, days}.

    group_key: which field in each row to group by (e.g. "store_name" or "maincat").
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

        b = buckets[period][row[group_key]]
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


# ---------------------------------------------------------------------------
# MainCat breakdown — SparkDB base tables (histheader + histdetail)
# ---------------------------------------------------------------------------


def _resolve_store_sns(same_store: bool) -> list[int]:
    """Resolve retail store SNs (int) for SparkDB queries."""
    sns = list(RETAIL_STORE_SNS)
    if same_store:
        exclude_sns = {int(sid) for sid in SAME_STORE_EXCLUDE}
        sns = [sn for sn in sns if sn not in exclude_sns]
    return sns


def _fetch_daily_by_maincat(
    start: date,
    end: date,
    store_sns: list[int],
) -> list[dict]:
    """Fetch daily NR from SparkDB base tables, grouped by date + MainCat."""
    sns_csv = ",".join(str(s) for s in store_sns)
    rows = sparkdb_query(
        f"""
        SELECT
            cm.D1L as maincat,
            DATE(hh.BSD) as bdate,
            SUM(CAST(((hd.VDA + hd.FCA3 + hd.FCA4 + hd.FCA5) * hd.SD * -1)
                     * IF(hd.DK < -10, 0, 1) - IFNULL(hd.RS7, 0) AS DECIMAL(24,4))) AS nr
        FROM histheader hh
        JOIN histdetail hd ON hd.RL = hh.RL
        JOIN productonsale p ON hd.BC = p.BC
        JOIN cat_main cm ON p.C1 = cm.KY
        WHERE hh.CF = false AND hh.XT IN (1,14)
          AND hd.XT IN (1,14) AND hd.CA = false AND hd.OFG = false AND hd.DK >= 0
          AND hh.SN IN ({sns_csv})
          AND hh.BSD >= %s AND hh.BSD <= %s
        GROUP BY cm.D1L, DATE(hh.BSD)
        """,
        (start.isoformat(), end.isoformat()),
        timeout=120,
    )
    result = []
    for r in rows:
        cat = r["maincat"]
        if cat in _MAINCAT_OTHER:
            cat = "Other"
        result.append(
            {
                "date": r["bdate"].isoformat() if hasattr(r["bdate"], "isoformat") else str(r["bdate"]),
                "maincat": cat,
                "nr": float(r["nr"]),
                "tc": 0,
            }
        )
    return result


def query_trend_by_maincat(
    granularity: str = "weekly",
    periods: int = 20,
    same_store: bool = False,
) -> dict:
    """Trend query broken down by MainCat (product category) with YoY, daily averages.

    Returns same shape as query_trend_yoy but with categories instead of stores.
    """
    store_sns = _resolve_store_sns(same_store)
    cy_start, cy_end, py_start, py_end = _compute_date_ranges(granularity, periods)

    cy_rows = _fetch_daily_by_maincat(cy_start, cy_end, store_sns)
    py_rows = _fetch_daily_by_maincat(py_start, py_end, store_sns)

    cy_buckets = _bucket_to_periods(cy_rows, granularity, group_key="maincat")
    py_buckets = _bucket_to_periods(py_rows, granularity, group_key="maincat")

    labels = _generate_period_labels(cy_start, cy_end, granularity)

    all_cats = sorted({s for b in [cy_buckets, py_buckets] for period_data in b.values() for s in period_data})

    def _avg_series(buckets: dict, labels: list[str]) -> dict[str, list[float]]:
        result = {}
        for cat in all_cats:
            vals = []
            for label in labels:
                entry = buckets.get(label, {}).get(cat)
                if entry and entry["days"]:
                    day_count = len(entry["days"])
                    vals.append(round(entry["nr"] / day_count, 2))
                else:
                    vals.append(0)
            result[cat] = vals
        return result

    cy_data = _avg_series(cy_buckets, labels)
    py_data = _avg_series(py_buckets, labels)

    return {
        "labels": labels,
        "cy": cy_data,
        "py": py_data,
        "period_cy": f"{cy_start.isoformat()} to {cy_end.isoformat()}",
        "period_py": f"{py_start.isoformat()} to {py_end.isoformat()}",
        "categories": all_cats,
        "granularity": granularity,
        "same_store": same_store,
        "daily_average": True,
    }
