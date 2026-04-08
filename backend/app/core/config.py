from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore")

    llm_base_url: str = "http://localhost:4000"
    llm_api_key: str = "sk-litellm"
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.0

    # Embeddings (OpenAI-compatible endpoint)
    embedding_base_url: str = "http://localhost:11434"
    embedding_api_key: str = "sk-litellm"
    embedding_model: str = "text-embedding-3-small"

    upload_dir: str = "data/uploads"
    artifacts_dir: str = "data/artifacts"
    db_path: str = "data/story_draft.db"

    # Document ingestion limits
    max_upload_size_mb: int = 20       # HTTP 413 if file exceeds this
    max_doc_chars: int = 80_000        # above this, map-reduce extraction is used
    max_supporting_full_context_chars: int = 25_000  # total chars across ALL supporting docs
    # below this → inject summaries only (no FAISS); above → summaries + RAG

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
