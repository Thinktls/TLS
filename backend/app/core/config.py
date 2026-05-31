from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://thinktls:password@localhost:5432/thinktls_bid_desk"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SENDGRID_API_KEY: str = ""
    SENDGRID_WEBHOOK_KEY: str = ""
    FROM_EMAIL: str = "bids@thinktls.com"
    FROM_NAME: str = "ThinkTLS Bid Desk"

    # SMTP fallback — used when SENDGRID_API_KEY is blank
    # Gmail example: SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=you@gmail.com SMTP_PASSWORD=<app-password>
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    ANTHROPIC_API_KEY: str = ""

    # Open-source / cloud LLM via any OpenAI-compatible endpoint
    # Local Ollama:  OLLAMA_BASE_URL=http://localhost:11434, OLLAMA_MODEL=llama3.2
    # Groq (free):   OLLAMA_BASE_URL=https://api.groq.com/openai, OLLAMA_MODEL=llama-3.1-8b-instant, OLLAMA_API_KEY=gsk_...
    # Together AI:   OLLAMA_BASE_URL=https://api.together.xyz, OLLAMA_MODEL=meta-llama/..., OLLAMA_API_KEY=...
    OLLAMA_BASE_URL: str = ""
    OLLAMA_MODEL: str = "llama3.2"
    OLLAMA_API_KEY: str = ""  # Optional Bearer token — required for Groq, Together AI, etc.

    FLUFF_PERCENTAGE: float = 3.5

    RAZOR_API_URL: str = ""
    RAZOR_API_KEY: str = ""
    AUTO_PUSH_RAZOR: bool = False

    FRONTEND_URL: str = "http://localhost:3000"
    ADMIN_EMAIL: str = "admin@thinktls.com"
    ADMIN_PASSWORD: str = "changeme123"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
