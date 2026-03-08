"""SparkDB SQL query builder.

Builds parameterized SQL from a ParsedQuery. Used when the query requires
dimensions or measures not available in MongoDB (maincat, brand, staff, etc.).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from api.engine.parser import ParsedFilter, ParsedQuery, ParsedTimeDimension
from api.engine.schema import DimensionDef, MeasureDef, STORE_NAME_TO_ID, MAINCAT_OTHER


def build_sql(
    pq: ParsedQuery,
    date_start: date | None = None,
    date_end: date | None = None,
) -> tuple[str, list[Any]]:
    """Build a parameterized SQL query from a parsed query.

    Returns (sql_string, params_list).
    """
    # Collect all required JOINs
    joins: list[str] = list(pq.cube.sql_base_joins)
    seen_joins: set[str] = set(joins)

    def add_joins(join_list: list[str]) -> None:
        for j in join_list:
            if j not in seen_joins:
                joins.append(j)
                seen_joins.add(j)

    # SELECT columns
    select_parts: list[str] = []
    group_parts: list[str] = []
    params: list[Any] = []

    # Add dimensions to SELECT + GROUP BY
    for dim in pq.dimensions:
        if dim.sql is None:
            continue
        add_joins(dim.sql.joins)
        alias = dim.name
        select_parts.append(f"{dim.sql.select_expr} AS {alias}")
        group_parts.append(dim.sql.select_expr)

    # Add time dimension to SELECT + GROUP BY (with granularity bucketing)
    for td in pq.time_dimensions:
        if td.member_def.sql is None:
            continue
        date_col = td.member_def.sql.select_expr  # e.g. "DATE(hh.BSD)"
        gran = td.granularity
        if gran == "week":
            # Monday of the week as ISO date
            expr = f"DATE({date_col} - INTERVAL WEEKDAY({date_col}) DAY)"
        elif gran == "month":
            expr = f"DATE_FORMAT({date_col}, '%Y-%m-01')"
        elif gran == "quarter":
            expr = f"CONCAT(YEAR({date_col}), '-Q', QUARTER({date_col}))"
        elif gran == "year":
            expr = f"CAST(YEAR({date_col}) AS CHAR)"
        else:
            # day or None — raw date
            expr = date_col
        select_parts.append(f"{expr} AS bdate")
        group_parts.append(expr)

    # Add measures to SELECT
    for meas in pq.measures:
        if meas.sql is None:
            continue
        alias = meas.name
        select_parts.append(f"{meas.sql.expression} AS {alias}")

    if not select_parts:
        raise ValueError("No SQL-compatible members in query")

    # FROM clause
    from_clause = pq.cube.sql_from

    # WHERE conditions
    where_parts: list[str] = []
    if pq.cube.sql_base_where:
        where_parts.append(pq.cube.sql_base_where)

    # Time dimension date range
    for td in pq.time_dimensions:
        start = date_start or td.cy_start
        end = date_end or td.cy_end
        if start and end and td.member_def.sql:
            where_parts.append(f"{td.member_def.sql.where_column} >= %s")
            params.append(start.isoformat())
            where_parts.append(f"{td.member_def.sql.where_column} <= %s")
            params.append(end.isoformat())

    # Dimension filters
    for f in pq.dimension_filters:
        clause, f_params = _build_sql_filter(f)
        if clause:
            where_parts.append(clause)
            params.extend(f_params)
            # Add joins for filter dimensions
            if isinstance(f.member_def, DimensionDef) and f.member_def.sql:
                add_joins(f.member_def.sql.joins)

    # HAVING conditions (measure filters)
    having_parts: list[str] = []
    for f in pq.measure_filters:
        clause, f_params = _build_sql_measure_filter(f)
        if clause:
            having_parts.append(clause)
            params.extend(f_params)

    # ORDER BY
    order_parts: list[str] = []
    for member_name, direction in pq.order:
        field_name = member_name.split(".")[-1]
        order_parts.append(f"{field_name} {direction.upper()}")

    # Build full SQL
    join_clause = " ".join(joins)
    sql = f"SELECT {', '.join(select_parts)} FROM {from_clause}"
    if join_clause:
        sql += f" {join_clause}"
    if where_parts:
        sql += f" WHERE {' AND '.join(where_parts)}"
    if group_parts:
        sql += f" GROUP BY {', '.join(group_parts)}"
    if having_parts:
        sql += f" HAVING {' AND '.join(having_parts)}"
    if order_parts:
        sql += f" ORDER BY {', '.join(order_parts)}"
    if pq.limit:
        sql += f" LIMIT {pq.limit}"
        if pq.offset:
            sql += f" OFFSET {pq.offset}"

    return sql, params


def transform_results(
    pq: ParsedQuery,
    raw_rows: list[dict[str, Any]],
    td: ParsedTimeDimension | None = None,
) -> list[dict[str, Any]]:
    """Transform raw SparkDB result rows into Cube.js flat row format."""
    rows = []
    for raw in raw_rows:
        row: dict[str, Any] = {}

        for dim in pq.dimensions:
            raw_val = raw.get(dim.name, "")
            if dim.display_map:
                row[dim.member] = dim.display_map.get(str(raw_val), str(raw_val))
            elif dim.name == "maincat" and raw_val in MAINCAT_OTHER:
                row[dim.member] = "Other"
            else:
                row[dim.member] = str(raw_val) if raw_val is not None else ""

        # Time dimension
        if td and td.granularity:
            bdate = raw.get("bdate")
            if bdate:
                dt = bdate if isinstance(bdate, date) else date.fromisoformat(str(bdate))
                row[f"{td.member}.{td.granularity}"] = dt.isoformat()

        for meas in pq.measures:
            val = raw.get(meas.name, 0)
            row[meas.member] = round(float(val), 2) if val else 0

        rows.append(row)

    return rows


def _build_sql_filter(f: ParsedFilter) -> tuple[str, list[Any]]:
    """Build a SQL WHERE clause fragment from a parsed filter."""
    if not isinstance(f.member_def, DimensionDef) or f.member_def.sql is None:
        return "", []

    col = f.member_def.sql.where_column
    values = _translate_filter_values(f)

    if f.operator == "equals":
        if len(values) == 1:
            return f"{col} = %s", values
        placeholders = ", ".join(["%s"] * len(values))
        return f"{col} IN ({placeholders})", values
    elif f.operator == "notEquals":
        if len(values) == 1:
            return f"{col} != %s", values
        placeholders = ", ".join(["%s"] * len(values))
        return f"{col} NOT IN ({placeholders})", values
    elif f.operator == "contains":
        return f"{col} LIKE %s", [f"%{values[0]}%"] if values else []
    elif f.operator == "notContains":
        return f"{col} NOT LIKE %s", [f"%{values[0]}%"] if values else []
    elif f.operator == "startsWith":
        return f"{col} LIKE %s", [f"{values[0]}%"] if values else []
    elif f.operator == "endsWith":
        return f"{col} LIKE %s", [f"%{values[0]}"] if values else []
    elif f.operator == "gt":
        return f"{col} > %s", [_maybe_numeric(values[0])] if values else []
    elif f.operator == "gte":
        return f"{col} >= %s", [_maybe_numeric(values[0])] if values else []
    elif f.operator == "lt":
        return f"{col} < %s", [_maybe_numeric(values[0])] if values else []
    elif f.operator == "lte":
        return f"{col} <= %s", [_maybe_numeric(values[0])] if values else []
    elif f.operator == "set":
        return f"{col} IS NOT NULL", []
    elif f.operator == "notSet":
        return f"{col} IS NULL", []
    return "", []


def _build_sql_measure_filter(f: ParsedFilter) -> tuple[str, list[Any]]:
    """Build a SQL HAVING clause fragment from a measure filter."""
    if not isinstance(f.member_def, MeasureDef) or f.member_def.sql is None:
        return "", []

    expr = f.member_def.sql.expression

    if f.operator == "gt":
        return f"{expr} > %s", [_maybe_numeric(f.values[0])] if f.values else []
    elif f.operator == "gte":
        return f"{expr} >= %s", [_maybe_numeric(f.values[0])] if f.values else []
    elif f.operator == "lt":
        return f"{expr} < %s", [_maybe_numeric(f.values[0])] if f.values else []
    elif f.operator == "lte":
        return f"{expr} <= %s", [_maybe_numeric(f.values[0])] if f.values else []
    elif f.operator == "equals":
        return f"{expr} = %s", [_maybe_numeric(f.values[0])] if f.values else []
    elif f.operator == "notEquals":
        return f"{expr} != %s", [_maybe_numeric(f.values[0])] if f.values else []
    return "", []


def _translate_filter_values(f: ParsedFilter) -> list[Any]:
    """Translate display values to raw DB values.

    e.g. store filter ["QRC"] → [41] (SN integer for SparkDB)
    """
    if isinstance(f.member_def, DimensionDef) and f.member_def.display_map:
        # Reverse the display map to get raw values
        reverse_map = {v: k for k, v in f.member_def.display_map.items()}
        translated = []
        for v in f.values:
            raw = reverse_map.get(v, v)
            translated.append(_maybe_numeric(str(raw)))
        return translated
    return [_maybe_numeric(v) for v in f.values]


def _maybe_numeric(v: str) -> int | float | str:
    """Try to convert a string to a number."""
    try:
        if "." in v:
            return float(v)
        return int(v)
    except (ValueError, TypeError):
        return v
