import threading
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings

_cache: dict[str, FAISS] = {}
_cache_lock = threading.Lock()


def _embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        base_url=settings.embedding_base_url,
        api_key=settings.embedding_api_key,
        model=settings.embedding_model,
    )


def build_index(text: str, index_path: str) -> None:
    """Chunk text, build FAISS index, save to disk, warm the in-memory cache."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_text(text)
    store = FAISS.from_texts(chunks, _embeddings())
    Path(index_path).mkdir(parents=True, exist_ok=True)
    store.save_local(index_path)
    with _cache_lock:
        _cache[index_path] = store


def query_index(index_path: str, query: str, k: int = 4) -> list[str]:
    """Return up to k relevant text chunks. Returns [] if index not found."""
    # Fast path — check cache without lock
    store = _cache.get(index_path)
    if store is None:
        with _cache_lock:
            store = _cache.get(index_path)  # double-check
            if store is None:
                if not Path(index_path).exists():
                    return []
                store = FAISS.load_local(
                    index_path, _embeddings(), allow_dangerous_deserialization=True
                )
                _cache[index_path] = store
    docs = store.similarity_search(query, k=k)
    return [d.page_content for d in docs]
