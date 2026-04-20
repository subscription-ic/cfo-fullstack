"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.modules.analysis import api as analysis_api
from app.modules.auth import api as auth_api
from app.modules.documents import api as documents_api
from app.modules.historical import api as historical_api
from app.modules.ingestion import api as ingestion_api
from app.modules.predicted_qa import api as predicted_qa_api
from app.modules.question_generation import api as question_generation_api
from app.modules.simulator_rag import api as simulator_rag_api
from app.modules.transcript_qa import api as transcript_qa_api
from app.core.config import require_supabase_config
from app.infrastructure.db import get_supabase_client


def _log_schema_hints() -> None:
    """Lightweight check at startup: log if documents table is missing."""
    try:
        client = get_supabase_client()
        client.table("documents").select("id").limit(1).execute()
    except Exception as exc:
        print(
            f"[cfo-backend] Warning: could not query 'documents' table ({exc}). "
            "Run migrations (see README) before using POST /upload."
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    require_supabase_config()
    _log_schema_hints()
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="CFO Earnings Intelligence API",
        description="Authentication, document upload with embeddings, question generation, and predicted Q&A.",
        version="2.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000", "https://cfo-fullstack.vercel.app", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/")
    def root():
        return {"message": "CFO Earnings Intelligence API is running"}

    application.include_router(auth_api.router)
    application.include_router(ingestion_api.router)
    application.include_router(documents_api.router)
    application.include_router(question_generation_api.router)
    application.include_router(predicted_qa_api.router, prefix="/api")
    application.include_router(transcript_qa_api.router, prefix="/api")
    application.include_router(simulator_rag_api.router, prefix="/api")
    application.include_router(analysis_api.router, prefix="/api")
    application.include_router(historical_api.router, prefix="/api")
    return application


app = create_app()
