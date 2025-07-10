import os

from pydantic_settings import BaseSettings


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
    allowed_origins: list[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000, http://127.0.0.1:3000").split(",")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
