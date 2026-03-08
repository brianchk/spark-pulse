"""Application configuration loaded from environment."""

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings(BaseSettings):
    env: str = "dev"
    port: int = 8100
    cors_origins: list[str] = ["http://localhost:3000", "http://mini"]

    # SparkDB (MySQL)
    sparkdb_host: str = "spark.giselato.com"
    sparkdb_port: int = 3306
    sparkdb_name: str = "SparkDB"
    sparkdb_user: str = "spark_reader"
    sparkdb_password: str = ""

    # MongoDB
    mongodb_uri: str = ""
    mongodb_db: str = "astro-transactions"

    # NocoDB
    nocodb_host: str = "giselato.com"
    nocodb_port: int = 3306
    nocodb_name: str = "sparkdb_nocodb"
    nocodb_user: str = "nocodb_user"
    nocodb_password: str = ""

    model_config = {"env_prefix": "SPARK_PULSE_"}


settings = Settings()
