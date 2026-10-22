import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    service_role_key: str
    docs_bucket: str
    covers_bucket: str
    admin_user_ids: frozenset[str]
    frontend_origins: tuple[str, ...]
    max_upload_bytes: int
    max_docx_uncompressed_bytes: int
    max_cover_bytes: int
    generation_rate_limit: int
    generation_rate_window_seconds: int
    libreoffice_timeout_seconds: int

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY", ""),
            service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
            docs_bucket=os.getenv("SUPABASE_DOCS_BUCKET", "practical-documents"),
            covers_bucket=os.getenv("SUPABASE_COVERS_BUCKET", "practical-covers"),
            admin_user_ids=frozenset(
                value.strip()
                for value in os.getenv("ADMIN_USER_IDS", "").split(",")
                if value.strip()
            ),
            frontend_origins=tuple(
                value.strip().rstrip("/")
                for value in os.getenv(
                    "FRONTEND_ORIGINS", "http://localhost:3000"
                ).split(",")
                if value.strip()
            ),
            max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", "20971520")),
            max_docx_uncompressed_bytes=int(
                os.getenv("MAX_DOCX_UNCOMPRESSED_BYTES", "104857600")
            ),
            max_cover_bytes=int(os.getenv("MAX_COVER_BYTES", "5242880")),
            generation_rate_limit=int(os.getenv("GENERATION_RATE_LIMIT", "10")),
            generation_rate_window_seconds=int(
                os.getenv("GENERATION_RATE_WINDOW_SECONDS", "3600")
            ),
            libreoffice_timeout_seconds=int(
                os.getenv("LIBREOFFICE_TIMEOUT_SECONDS", "45")
            ),
        )


settings = Settings.from_environment()
