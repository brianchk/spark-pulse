"""Query parser — validates incoming Cube.js queries against the schema registry."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from api.engine.models import FilterClause, QueryRequest, TimeDimension
from api.engine.schema import (
    CubeDef,
    DimensionDef,
    MeasureDef,
    resolve_member,
)


@dataclass
class ParsedFilter:
    """A validated, resolved filter ready for query building."""
    member: str
    member_def: DimensionDef | MeasureDef
    operator: str
    values: list[str]
    is_measure: bool = False


@dataclass
class ParsedTimeDimension:
    """A validated time dimension with computed date ranges."""
    member: str
    member_def: DimensionDef
    granularity: str | None
    cy_start: date | None = None
    cy_end: date | None = None
    py_start: date | None = None  # for compareDateRange
    py_end: date | None = None


@dataclass
class ParsedQuery:
    """Fully validated and resolved query, ready for building."""
    cube: CubeDef
    measures: list[MeasureDef]
    dimensions: list[DimensionDef]
    dimension_filters: list[ParsedFilter] = field(default_factory=list)
    measure_filters: list[ParsedFilter] = field(default_factory=list)
    time_dimensions: list[ParsedTimeDimension] = field(default_factory=list)
    order: list[tuple[str, str]] = field(default_factory=list)
    limit: int | None = None
    offset: int | None = None
    has_comparison: bool = False


class ParseError(Exception):
    """Raised when query validation fails."""
    pass


def parse_query(req: QueryRequest) -> ParsedQuery:
    """Parse and validate a QueryRequest against the schema registry.

    Raises ParseError if validation fails.
    """
    # All members must belong to the same cube (for now)
    all_members = req.measures + req.dimensions + [td.dimension for td in req.timeDimensions]
    if not all_members:
        raise ParseError("Query must include at least one measure or dimension")

    cube_names = {m.split(".")[0] for m in all_members}
    if len(cube_names) > 1:
        raise ParseError(f"Cross-cube queries not supported. Found cubes: {cube_names}")

    # Resolve measures
    measures: list[MeasureDef] = []
    cube: CubeDef | None = None
    for m in req.measures:
        resolved = resolve_member(m)
        if resolved is None:
            raise ParseError(f"Unknown measure: {m}")
        cube, member = resolved
        if not isinstance(member, MeasureDef):
            raise ParseError(f"{m} is a dimension, not a measure")
        measures.append(member)

    # Resolve dimensions
    dimensions: list[DimensionDef] = []
    for d in req.dimensions:
        resolved = resolve_member(d)
        if resolved is None:
            raise ParseError(f"Unknown dimension: {d}")
        c, member = resolved
        if cube is None:
            cube = c
        if not isinstance(member, DimensionDef):
            raise ParseError(f"{d} is a measure, not a dimension")
        dimensions.append(member)

    if cube is None:
        raise ParseError("Could not determine cube from query members")

    # Parse filters
    dim_filters: list[ParsedFilter] = []
    meas_filters: list[ParsedFilter] = []
    for f in req.filters:
        if isinstance(f, dict):
            # Boolean filter (and/or) — flatten for P1, full nesting in P5
            if "and" in f:
                for sub in f["and"]:
                    pf = _parse_single_filter(sub if isinstance(sub, FilterClause) else FilterClause(**sub))
                    if pf.is_measure:
                        meas_filters.append(pf)
                    else:
                        dim_filters.append(pf)
            elif "or" in f:
                raise ParseError("OR filters not yet supported (coming in P5)")
            elif "member" in f:
                pf = _parse_single_filter(FilterClause(**f))
                if pf.is_measure:
                    meas_filters.append(pf)
                else:
                    dim_filters.append(pf)
            else:
                raise ParseError(f"Unknown filter format: {f}")
        elif isinstance(f, FilterClause):
            pf = _parse_single_filter(f)
            if pf.is_measure:
                meas_filters.append(pf)
            else:
                dim_filters.append(pf)
        else:
            raise ParseError(f"Unknown filter type: {type(f)}")

    # Parse time dimensions
    time_dims: list[ParsedTimeDimension] = []
    has_comparison = False
    for td in req.timeDimensions:
        ptd = _parse_time_dimension(td)
        if ptd.py_start is not None:
            has_comparison = True
        time_dims.append(ptd)

    # Parse order
    order: list[tuple[str, str]] = []
    if req.order:
        if isinstance(req.order, dict):
            order = [(k, v) for k, v in req.order.items()]
        elif isinstance(req.order, list):
            order = [(pair[0], pair[1]) for pair in req.order if len(pair) == 2]
        # Validate order members exist
        for member_name, direction in order:
            # Strip granularity suffix (e.g. "sales.date.week" → "sales.date")
            base = ".".join(member_name.split(".")[:2])
            if resolve_member(base) is None:
                raise ParseError(f"Unknown member in order: {member_name}")
            if direction not in ("asc", "desc"):
                raise ParseError(f"Invalid order direction: {direction}")

    return ParsedQuery(
        cube=cube,
        measures=measures,
        dimensions=dimensions,
        dimension_filters=dim_filters,
        measure_filters=meas_filters,
        time_dimensions=time_dims,
        order=order,
        limit=req.limit,
        offset=req.offset,
        has_comparison=has_comparison,
    )


def _parse_single_filter(f: FilterClause) -> ParsedFilter:
    """Validate and resolve a single filter clause."""
    resolved = resolve_member(f.member)
    if resolved is None:
        raise ParseError(f"Unknown member in filter: {f.member}")
    _, member = resolved
    is_measure = isinstance(member, MeasureDef)
    return ParsedFilter(
        member=f.member,
        member_def=member,
        operator=f.operator,
        values=f.values,
        is_measure=is_measure,
    )


def _parse_time_dimension(td: TimeDimension) -> ParsedTimeDimension:
    """Validate and resolve a time dimension, computing date ranges."""
    resolved = resolve_member(td.dimension)
    if resolved is None:
        raise ParseError(f"Unknown time dimension: {td.dimension}")
    _, member = resolved
    if not isinstance(member, DimensionDef) or member.value_type != "time":
        raise ParseError(f"{td.dimension} is not a time dimension")

    cy_start, cy_end = None, None
    py_start, py_end = None, None

    if td.dateRange:
        cy_start, cy_end = _resolve_date_range(td.dateRange, td.granularity)

    if td.compareDateRange:
        # compareDateRange: ["this year", "last year"] or [["2025-01-01", "2025-12-31"], ...]
        # For now, support the common case: 52-week offset (364 days)
        if cy_start and cy_end:
            py_offset = timedelta(days=364)
            py_start = cy_start - py_offset
            py_end = cy_end - py_offset

    return ParsedTimeDimension(
        member=td.dimension,
        member_def=member,
        granularity=td.granularity,
        cy_start=cy_start,
        cy_end=cy_end,
        py_start=py_start,
        py_end=py_end,
    )


def _resolve_date_range(
    date_range: str | list[str],
    granularity: str | None,
) -> tuple[date, date]:
    """Resolve a date range spec to concrete start/end dates."""
    today = date.today()

    if isinstance(date_range, list) and len(date_range) == 2:
        return date.fromisoformat(date_range[0]), date.fromisoformat(date_range[1])

    if isinstance(date_range, str):
        dr = date_range.lower().strip()

        # "last N <unit>" pattern
        if dr.startswith("last "):
            parts = dr.split()
            if len(parts) == 3:
                n = int(parts[1])
                unit = parts[2].rstrip("s")  # "weeks" → "week"

                if unit == "day":
                    end = today - timedelta(days=1)
                    start = end - timedelta(days=n - 1)
                    return start, end
                elif unit == "week":
                    # End at last completed week (Saturday)
                    days_since_sunday = (today.weekday() + 1) % 7
                    end = today - timedelta(days=days_since_sunday)
                    start = end - timedelta(weeks=n) + timedelta(days=1)
                    return start, end
                elif unit == "month":
                    end = today.replace(day=1) - timedelta(days=1)
                    m = end.month - n + 1
                    y = end.year
                    while m < 1:
                        m += 12
                        y -= 1
                    start = date(y, m, 1)
                    return start, end
                elif unit == "year":
                    return date(today.year - n, 1, 1), date(today.year - 1, 12, 31)

        # Named ranges
        if dr == "today":
            return today, today
        if dr == "yesterday":
            y = today - timedelta(days=1)
            return y, y
        if dr == "this week":
            start = today - timedelta(days=today.weekday())
            return start, today
        if dr == "this month":
            return today.replace(day=1), today
        if dr == "this year":
            return date(today.year, 1, 1), today

    raise ParseError(f"Cannot resolve date range: {date_range}")
