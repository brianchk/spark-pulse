"""Query API endpoint — POST /api/query."""

import asyncio
from functools import partial

from fastapi import APIRouter

from api.engine.executor import execute_query
from api.engine.models import QueryRequest, QueryResponse

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def post_query(req: QueryRequest):
    """Execute a Cube.js-format query.

    Accepts measures, dimensions, filters, timeDimensions, order, limit.
    Auto-routes to MongoDB (fast pre-aggregated) or SparkDB (full detail).
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, partial(execute_query, req))
    return result
