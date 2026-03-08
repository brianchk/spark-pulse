"""Sales data queries against MongoDB."""

from datetime import date

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


def query_daily_sales(
    start_date: date,
    end_date: date,
    store_ids: list[str] | None = None,
) -> list[dict]:
    """Query daily net revenue + transaction count from MongoDB.

    Uses the transactioncacheaggregations collection (pre-aggregated daily data).
    """
    db = get_mongo_db()
    collection = db["transactioncacheaggregations"]

    if store_ids is None:
        store_ids = RETAIL_STORE_IDS

    pipeline = [
        {
            "$match": {
                "storeId": {"$in": store_ids},
                "transactionDate": {
                    "$gte": start_date.isoformat(),
                    "$lte": end_date.isoformat(),
                },
            }
        },
        {
            "$group": {
                "_id": {"storeId": "$storeId", "date": "$transactionDate"},
                "net_revenue": {"$sum": "$netSalesAll"},
                "transaction_count": {"$sum": "$transactionCountAll"},
            }
        },
        {"$sort": {"_id.date": 1, "_id.storeId": 1}},
    ]

    rows = []
    for doc in collection.aggregate(pipeline):
        sid = doc["_id"]["storeId"]
        rows.append(
            {
                "date": doc["_id"]["date"],
                "store_id": sid,
                "store_name": STORE_MAP.get(sid, f"Store {sid}"),
                "net_revenue": round(doc["net_revenue"], 2),
                "transaction_count": int(doc["transaction_count"]),
            }
        )

    return rows


def query_daily_sales_total(
    start_date: date,
    end_date: date,
    store_ids: list[str] | None = None,
) -> list[dict]:
    """Query daily total net revenue (all stores summed) from MongoDB."""
    db = get_mongo_db()
    collection = db["transactioncacheaggregations"]

    if store_ids is None:
        store_ids = RETAIL_STORE_IDS

    pipeline = [
        {
            "$match": {
                "storeId": {"$in": store_ids},
                "transactionDate": {
                    "$gte": start_date.isoformat(),
                    "$lte": end_date.isoformat(),
                },
            }
        },
        {
            "$group": {
                "_id": "$transactionDate",
                "net_revenue": {"$sum": "$netSalesAll"},
                "transaction_count": {"$sum": "$transactionCountAll"},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    rows = []
    for doc in collection.aggregate(pipeline):
        rows.append(
            {
                "date": doc["_id"],
                "net_revenue": round(doc["net_revenue"], 2),
                "transaction_count": int(doc["transaction_count"]),
            }
        )

    return rows
