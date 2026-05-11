from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://thinktls:password@localhost:5432/thinktls_bid_desk"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SENDGRID_API_KEY: str = ""
    FROM_EMAIL: str = "bids@thinktls.com"
    FROM_NAME: str = "ThinkTLS Bid Desk"

    ANTHROPIC_API_KEY: str = ""

    FLUFF_PERCENTAGE: float = 3.5

    ADMIN_EMAIL: str = "admin@thinktls.com"
    ADMIN_PASSWORD: str = "changeme123"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
