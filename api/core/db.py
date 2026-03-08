"""Database connection management for MongoDB and SparkDB."""

from pymongo import MongoClient
from pymongo.database import Database

from api.core.config import settings

_mongo_client: MongoClient | None = None


def get_mongo_db() -> Database:
    """Get the MongoDB astro-transactions database."""
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(settings.mongodb_uri)
    return _mongo_client[settings.mongodb_db]


def close_mongo():
    """Close MongoDB connection on shutdown."""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
