"""Query executor — orchestrates parse → route → build → execute → format."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from api.core.cache import cache_get, cache_set
from api.core.db import get_mongo_db, sparkdb_query
from api.engine import builder_mongo, builder_sql
from api.engine.models import (
    MemberAnnotation,
    QueryRequest,
    QueryResponse,
)
from api.engine.parser import ParsedQuery, ParseError, parse_query


def execute_query(req: QueryRequest) -> QueryResponse:
    """Execute a Cube.js-format query and return results.

    This is the main entry point — called from the API endpoint.
    Runs synchronously (caller should use run_in_executor for async).
    """
    # Parse and validate
    try:
        pq = parse_query(req)
    except ParseError as e:
        return QueryResponse(data=[], warning=str(e))

    # Check cache
    cache_key = _cache_key(req)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # Route and execute
    use_mongo = builder_mongo.can_use_mongo(pq)

    if pq.has_comparison:
        result = _execute_with_comparison(pq, use_mongo)
    else:
        result = _execute_single(pq, use_mongo)

    # Build annotations
    annotations = _build_annotations(pq)
    response = QueryResponse(
        data=result,
        annotation=annotations,
        query=req.model_dump(exclude_none=True),
        totalRows=len(result),
        warning="no_data_matches" if not result else None,
    )

    cache_set(cache_key, response)
    return response


def _execute_single(pq: ParsedQuery, use_mongo: bool) -> list[dict[str, Any]]:
    """Execute a query without time comparison."""
    td = pq.time_dimensions[0] if pq.time_dimensions else None

    if use_mongo:
        collection_name, pipeline = builder_mongo.build_pipeline(pq)
        db = get_mongo_db()
        raw_docs = list(db[collection_name].aggregate(pipeline))
        return builder_mongo.transform_results(pq, raw_docs, td)
    else:
        sql, params = builder_sql.build_sql(pq)
        raw_rows = sparkdb_query(sql, tuple(params))
        return builder_sql.transform_results(pq, raw_rows, td)


def _execute_with_comparison(pq: ParsedQuery, use_mongo: bool) -> list[dict[str, Any]]:
    """Execute a query with time comparison (CY + PY).

    Returns rows with a _comparison field ("cy" or "py") to distinguish periods.
    """
    td = pq.time_dimensions[0] if pq.time_dimensions else None
    if not td or not td.cy_start or not td.py_start:
        return _execute_single(pq, use_mongo)

    if use_mongo:
        # CY
        _, cy_pipeline = builder_mongo.build_pipeline(pq, td.cy_start, td.cy_end)
        db = get_mongo_db()
        collection = pq.cube.mongo_collection
        cy_docs = list(db[collection].aggregate(cy_pipeline))
        cy_rows = builder_mongo.transform_results(pq, cy_docs, td)

        # PY
        _, py_pipeline = builder_mongo.build_pipeline(pq, td.py_start, td.py_end)
        py_docs = list(db[collection].aggregate(py_pipeline))
        py_rows = builder_mongo.transform_results(pq, py_docs, td)
    else:
        # CY
        cy_sql, cy_params = builder_sql.build_sql(pq, td.cy_start, td.cy_end)
        cy_raw = sparkdb_query(cy_sql, tuple(cy_params))
        cy_rows = builder_sql.transform_results(pq, cy_raw, td)

        # PY
        py_sql, py_params = builder_sql.build_sql(pq, td.py_start, td.py_end)
        py_raw = sparkdb_query(py_sql, tuple(py_params))
        py_rows = builder_sql.transform_results(pq, py_raw, td)

    # Tag rows with comparison period
    for row in cy_rows:
        row["_comparison"] = "cy"
    for row in py_rows:
        row["_comparison"] = "py"

    return cy_rows + py_rows


def _build_annotations(pq: ParsedQuery) -> dict[str, dict[str, MemberAnnotation]]:
    """Build response annotations for measures and dimensions."""
    annotations: dict[str, dict[str, MemberAnnotation]] = {
        "measures": {},
        "dimensions": {},
    }

    for meas in pq.measures:
        annotations["measures"][meas.member] = MemberAnnotation(
            title=meas.name.replace("_", " ").title(),
            type=meas.value_type,
            format=meas.format,
        )

    for dim in pq.dimensions:
        annotations["dimensions"][dim.member] = MemberAnnotation(
            title=dim.name.replace("_", " ").title(),
            type=dim.value_type,
        )

    for td in pq.time_dimensions:
        key = f"{td.member}.{td.granularity}" if td.granularity else td.member
        annotations["dimensions"][key] = MemberAnnotation(
            title=f"Date ({td.granularity})" if td.granularity else "Date",
            type="time",
        )

    return annotations


def _cache_key(req: QueryRequest) -> str:
    """Generate a deterministic cache key from the query request."""
    serialized = json.dumps(req.model_dump(exclude_none=True), sort_keys=True)
    h = hashlib.md5(serialized.encode()).hexdigest()[:12]
    return f"query:{h}"
