from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://arcturus:arcturus@postgres:5432/arcturus"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    admin_username: str = "admin"
    admin_password: str = "admin"
    allowed_origins: list[str] = ["*"]


settings = Settings()
