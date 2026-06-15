from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Always resolve .env relative to the backend/ directory
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str
    gemini_api_key: str
    channel_service_url: str = "http://localhost:8001"
    crm_callback_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
