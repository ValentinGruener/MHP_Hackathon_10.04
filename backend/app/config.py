from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./data/pptx_checker.db"
    upload_dir: Path = Path("./data/uploads")
    thumbnail_dir: Path = Path("./data/thumbnails")
    max_file_size_mb: int = 100
    file_retention_hours: int = 24

    # LanguageTool
    languagetool_url: str = "http://localhost:8081/v2/check"

    # Claude Haiku 4.5
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    haiku_max_slides_per_batch: int = 15

    # Security
    max_decompress_ratio: int = 100
    max_zip_entries: int = 5000

    model_config = {"env_file": ".env", "env_prefix": "PPTX_"}


settings = Settings()
