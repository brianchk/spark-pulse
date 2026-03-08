"""Spark Pulse API — FastAPI backend for PB BI/KPI Dashboard."""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.core.config import settings
from api.core.db import close_mongo, init_mongo
from api.routers import query, sales


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Spark Pulse API starting (env={settings.env})")
    t0 = time.perf_counter()
    init_mongo()
    print(f"MongoDB connected ({time.perf_counter() - t0:.3f}s)")
    yield
    close_mongo()
    print("Spark Pulse API shutting down")


app = FastAPI(
    title="Spark Pulse API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    path = request.url.path
    qs = str(request.url.query)
    tag = "CACHED" if elapsed_ms < 50 else "QUERY"
    print(f"[{tag}] {request.method} {path}{'?' + qs if qs else ''} → {response.status_code} in {elapsed_ms:.0f}ms")
    # Expose timing to browser DevTools (Network tab → Timing → Server Timing)
    response.headers["X-Response-Time"] = f"{elapsed_ms:.0f}ms"
    response.headers["Server-Timing"] = f'api;dur={elapsed_ms:.1f};desc="API total"'
    return response


app.include_router(sales.router)
app.include_router(query.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.env}
