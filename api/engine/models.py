"""Pydantic models for query request and response (Cube.js format)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, field_validator

# Valid filter operators (Cube.js spec)
DIMENSION_OPS = {
    "equals", "notEquals", "contains", "notContains",
    "startsWith", "notStartsWith", "endsWith", "notEndsWith",
    "set", "notSet",
    "gt", "gte", "lt", "lte",
    "inDateRange", "notInDateRange",
    "beforeDate", "beforeOrOnDate", "afterDate", "afterOrOnDate",
}

MEASURE_OPS = {"equals", "notEquals", "gt", "gte", "lt", "lte", "set", "notSet"}


class FilterClause(BaseModel):
    """A single filter condition."""
    member: str
    operator: str
    values: list[str] = []

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, v: str) -> str:
        if v not in DIMENSION_OPS:
            raise ValueError(f"Unknown operator: {v}. Valid: {sorted(DIMENSION_OPS)}")
        return v


class BooleanFilter(BaseModel):
    """AND/OR wrapper for nested boolean logic."""
    and_: list[FilterClause | BooleanFilter] | None = None
    or_: list[FilterClause | BooleanFilter] | None = None

    model_config = {
        "alias_generator": lambda x: x.rstrip("_"),
        "populate_by_name": True,
    }


class TimeDimension(BaseModel):
    """Time dimension with optional granularity and date range."""
    dimension: str  # e.g. "sales.date"
    granularity: Literal["year", "quarter", "month", "week", "day", "hour"] | None = None
    dateRange: str | list[str] | None = None  # "last 20 weeks" or ["2025-01-01", "2025-12-31"]
    compareDateRange: list[str | list[str]] | None = None  # YoY comparison


class QueryRequest(BaseModel):
    """Cube.js-format query request."""
    measures: list[str] = []
    dimensions: list[str] = []
    filters: list[FilterClause | dict] = []  # FilterClause or {"and": [...]} / {"or": [...]}
    timeDimensions: list[TimeDimension] = []
    order: list[list[str]] | dict[str, str] | None = None
    limit: int | None = None
    offset: int | None = None
    savedFilters: list[str] = []  # slugs of saved filter-type queries to merge

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v: int | None) -> int | None:
        if v is not None and (v < 1 or v > 50000):
            raise ValueError("limit must be between 1 and 50000")
        return v


class MemberAnnotation(BaseModel):
    """Metadata about a returned member."""
    title: str
    type: str  # "number", "string", "time"
    format: str | None = None  # "currency", etc.


class QueryResponse(BaseModel):
    """Cube.js-format query response."""
    data: list[dict[str, Any]]
    annotation: dict[str, dict[str, MemberAnnotation]] = {}
    query: dict[str, Any] = {}
    totalRows: int | None = None
    warning: str | None = None
