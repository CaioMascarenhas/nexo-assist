from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://nexo:nexo-local-only@127.0.0.1:5432/nexo?connect_timeout=10"
    agent_url: str = "http://localhost:4111"
    internal_agent_secret: str = ""
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    service_desk_timezone: str = "America/Fortaleza"
    ticket_failure_mode: str = "off"
    secure_cookies: bool = False


settings = Settings()
