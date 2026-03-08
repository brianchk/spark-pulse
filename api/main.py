"""Spark Pulse API — FastAPI backend for PB BI/KPI Dashboard."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.core.config import settings
from api.core.db import close_mongo
from api.routers import sales


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Spark Pulse API starting (env={settings.env})")
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


app.include_router(sales.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.env}
