import os
from typing import Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    # Application settings
    app_name: str = os.getenv("APP_NAME", "RyteAI Backend")
    app_version: str = os.getenv("APP_VERSION", "1.0.0")
    debug: bool = os.getenv("DEBUG", False)

    # Server settings
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = os.getenv("PORT", 8000)

    # Database settings
    mongodb_url: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    database_name: str = os.getenv("DATABASE_NAME", "ryteai_db")

    # CORS settings
    allowed_origins: list[str] = os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000, http://127.0.0.1:3000"
    ).split(",")

    # AI/LLM settings
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY", None)

    # Supabase settings
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
