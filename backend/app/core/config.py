import logging
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache

_log = logging.getLogger(__name__)

_DEFAULT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://thinktls:password@localhost:5432/thinktls_bid_desk"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def strip_database_url(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v

    SECRET_KEY: str = _DEFAULT_SECRET

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def warn_weak_secret(cls, v: str) -> str:
        if v == _DEFAULT_SECRET or len(v) < 32:
            _log.warning(
                "⚠️  SECRET_KEY is weak or uses the default — set a strong random value "
                "(e.g. openssl rand -hex 32) in your environment before going to production!"
            )
        return v
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SENDGRID_API_KEY: str = ""
    SENDGRID_WEBHOOK_KEY: str = ""

    # Gmail SMTP (App Password — requires 2FA on the Google account)
    GMAIL_USER: str = ""        # e.g. yourname@gmail.com
    GMAIL_APP_PASSWORD: str = ""  # 16-char App Password from myaccount.google.com/apppasswords

    # Vercel email relay (set when using the Next.js /api/send-email route as relay)
    EMAIL_RELAY_URL: str = ""   # e.g. https://thinktls-bid-desk.vercel.app
    EMAIL_RELAY_SECRET: str = "" # shared secret — set same value in Vercel env

    FROM_EMAIL: str = "bids@thinktls.com"
    FROM_NAME: str = "ThinkTLS Bid Desk"

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
