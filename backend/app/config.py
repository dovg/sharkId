from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8
    minio_endpoint: str
    minio_root_user: str
    minio_root_password: str
    minio_bucket: str
    ml_service_url: str
    photo_base_url: str = ""   # when set, photos served via nginx instead of presigned URLs

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
