"""Application configuration"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./pricetag.db"
    ENVIRONMENT: str = "development"

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 30
    RATE_LIMIT_PER_HOUR: int = 200

    # OCR settings
    OCR_CONFIDENCE_THRESHOLD: float = 0.35

    # Quality scoring weights
    SOURCE_WEIGHT_USER_SCAN: float = 0.85
    SOURCE_WEIGHT_MANUAL: float = 1.0
    SOURCE_WEIGHT_API: float = 0.95

    # Freshness thresholds (days)
    FRESHNESS_FRESH_DAYS: int = 7
    FRESHNESS_WARM_DAYS: int = 21

    # Confidence decay half-life (days)
    CONFIDENCE_HALF_LIFE: int = 12

    class Config:
        env_file = ".env"


settings = Settings()
