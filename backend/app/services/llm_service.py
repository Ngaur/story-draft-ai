from langchain_community.embeddings import OllamaEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import SecretStr
from app.core.config import settings


def get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=SecretStr(settings.llm_api_key),
        temperature=settings.llm_temperature,
        streaming=True,
    )


def get_embeddings():
        return OllamaEmbeddings(
            model=settings.embedding_model,
            base_url=f"{settings.embedding_base_url}",
        )
        # return OpenAIEmbeddings(
        #     model=settings.embedding_model,
        #     base_url=settings.embedding_base_url,
        #     api_key=settings.embedding_api_key,
        #     async_client=_async_http_client(),
        #     http_client=_sync_http_client(),
        # )
