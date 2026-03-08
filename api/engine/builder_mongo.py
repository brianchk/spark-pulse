"""MongoDB aggregation pipeline builder.

Builds a MongoDB aggregation pipeline from a ParsedQuery. Only works when
all requested dimensions are available in MongoDB (the auto-router checks this).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from api.engine.parser import ParsedFilter, ParsedQuery, ParsedTimeDimension
from api.engine.schema import DimensionDef, STORE_ID_TO_NAME, MAINCAT_OTHER


def can_use_mongo(pq: ParsedQuery) -> bool:
    """Check if all dimensions and measures in the query are available in MongoDB."""
    for dim in pq.dimensions:
        if dim.mongo is None:
            return False
    for meas in pq.measures:
        if meas.mongo is None:
            return False
    for f in pq.dimension_filters:
        if isinstance(f.member_def, DimensionDef) and f.member_def.mongo is None:
            return False
    for td in pq.time_dimensions:
        if td.member_def.mongo is None:
            return False
    return True


def build_pipeline(
    pq: ParsedQuery,
    date_start: date | None = None,
    date_end: date | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Build a MongoDB aggregation pipeline from a parsed query.

    Returns (collection_name, pipeline_stages).
    """
    collection = pq.cube.mongo_collection

    # --- $match stage ---
    match: dict[str, Any] = {}

    # Time dimension date range
    for td in pq.time_dimensions:
        start = date_start or td.cy_start
        end = date_end or td.cy_end
        if start and end:
            match[td.member_def.mongo.field] = {
                "$gte": start.isoformat(),
                "$lte": end.isoformat(),
            }

    # Dimension filters
    for f in pq.dimension_filters:
        mongo_field = _resolve_mongo_field(f)
        if mongo_field is None:
            continue
        values = _translate_filter_values(f)
        condition = _build_mongo_condition(f.operator, values)
        if condition is not None:
            if mongo_field in match:
                # Merge conditions on same field
                if isinstance(match[mongo_field], dict):
                    match[mongo_field].update(condition if isinstance(condition, dict) else {"$eq": condition})
                else:
                    match[mongo_field] = {"$eq": match[mongo_field], **condition}
            else:
                match[mongo_field] = condition

    stages: list[dict[str, Any]] = []
    if match:
        stages.append({"$match": match})

    # --- $group stage ---
    group_id: dict[str, str] = {}

    # Group by dimensions
    for dim in pq.dimensions:
        if dim.mongo:
            group_id[dim.name] = f"${dim.mongo.field}"

    # Group by time granularity
    for td in pq.time_dimensions:
        if td.granularity and td.member_def.mongo:
            group_id["_date"] = f"${td.member_def.mongo.field}"

    accumulators: dict[str, Any] = {}
    for meas in pq.measures:
        if meas.mongo:
            accumulators[meas.name] = meas.mongo.accumulator

    if group_id or accumulators:
        stages.append({
            "$group": {
                "_id": group_id if group_id else None,
                **accumulators,
            }
        })

    # --- $sort stage ---
    if pq.order:
        sort: dict[str, int] = {}
        for member_name, direction in pq.order:
            field_name = member_name.split(".")[-1]
            sort[field_name] = 1 if direction == "asc" else -1
        stages.append({"$sort": sort})
    else:
        # Default: sort by date if present
        if "_date" in group_id:
            stages.append({"$sort": {"_id._date": 1}})

    # --- $limit stage ---
    if pq.limit:
        if pq.offset:
            stages.append({"$skip": pq.offset})
        stages.append({"$limit": pq.limit})

    return collection, stages


def transform_results(
    pq: ParsedQuery,
    raw_docs: list[dict[str, Any]],
    td: ParsedTimeDimension | None = None,
) -> list[dict[str, Any]]:
    """Transform raw MongoDB documents into Cube.js flat row format.

    MongoDB pipelines group by raw date. This transform buckets dates into
    the requested granularity (week, month, etc.) and re-aggregates.
    """
    # First pass: build raw rows
    raw_rows = []
    for doc in raw_docs:
        row: dict[str, Any] = {}
        _id = doc.get("_id", {})

        for dim in pq.dimensions:
            raw_val = _id.get(dim.name, "")
            if dim.display_map:
                row[dim.member] = dim.display_map.get(str(raw_val), str(raw_val))
            else:
                row[dim.member] = raw_val

        if td and td.granularity:
            raw_date = _id.get("_date", "")
            row[f"{td.member}.{td.granularity}"] = _bucket_date(raw_date, td.granularity)

        for meas in pq.measures:
            val = doc.get(meas.name, 0)
            row[meas.member] = round(float(val), 2) if val else 0

        raw_rows.append(row)

    # If no time dimension or day granularity, no re-aggregation needed
    if not td or not td.granularity or td.granularity == "day":
        return raw_rows

    # Re-aggregate: group by all dimensions + bucketed time period
    time_key = f"{td.member}.{td.granularity}"
    dim_keys = [d.member for d in pq.dimensions]
    group_keys = dim_keys + [time_key]
    measure_members = [m.member for m in pq.measures]

    aggregated: dict[tuple, dict[str, Any]] = {}
    for row in raw_rows:
        key = tuple(row.get(k, "") for k in group_keys)
        if key not in aggregated:
            aggregated[key] = {k: row.get(k, "") for k in group_keys}
            for mm in measure_members:
                aggregated[key][mm] = 0
        for mm in measure_members:
            aggregated[key][mm] += row.get(mm, 0)

    # Round measures
    result = list(aggregated.values())
    for row in result:
        for mm in measure_members:
            row[mm] = round(row[mm], 2)

    return result


def _bucket_date(date_str: str, granularity: str) -> str:
    """Bucket a date string into the requested granularity period."""
    if not date_str:
        return ""
    from datetime import date as date_type
    try:
        d = date_type.fromisoformat(date_str)
    except ValueError:
        return date_str

    if granularity == "day":
        return d.isoformat()
    elif granularity == "week":
        # Monday of the week
        monday = d - __import__("datetime").timedelta(days=d.weekday())
        return monday.isoformat()
    elif granularity == "month":
        return f"{d.year}-{d.month:02d}-01"
    elif granularity == "quarter":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    elif granularity == "year":
        return str(d.year)
    return date_str


def _resolve_mongo_field(f: ParsedFilter) -> str | None:
    """Get the MongoDB field path for a filter."""
    if isinstance(f.member_def, DimensionDef) and f.member_def.mongo:
        return f.member_def.mongo.field
    return None


def _translate_filter_values(f: ParsedFilter) -> list[str]:
    """Translate display values to raw values for MongoDB.

    e.g. store filter values ["QRC", "TST"] → ["41", "26"] (store IDs)
    """
    if isinstance(f.member_def, DimensionDef) and f.member_def.display_map:
        reverse_map = {v: k for k, v in f.member_def.display_map.items()}
        return [reverse_map.get(v, v) for v in f.values]
    return f.values


def _build_mongo_condition(operator: str, values: list[str]) -> Any:
    """Build a MongoDB condition from an operator and values."""
    if operator == "equals":
        return {"$in": values} if len(values) > 1 else values[0]
    elif operator == "notEquals":
        return {"$nin": values}
    elif operator == "contains":
        return {"$regex": values[0], "$options": "i"} if values else None
    elif operator == "notContains":
        return {"$not": {"$regex": values[0], "$options": "i"}} if values else None
    elif operator == "gt":
        return {"$gt": _maybe_numeric(values[0])} if values else None
    elif operator == "gte":
        return {"$gte": _maybe_numeric(values[0])} if values else None
    elif operator == "lt":
        return {"$lt": _maybe_numeric(values[0])} if values else None
    elif operator == "lte":
        return {"$lte": _maybe_numeric(values[0])} if values else None
    elif operator == "set":
        return {"$ne": None}
    elif operator == "notSet":
        return None
    return None


def _maybe_numeric(v: str) -> int | float | str:
    """Try to convert a string to a number for comparison operators."""
    try:
        if "." in v:
            return float(v)
        return int(v)
    except ValueError:
        return v
