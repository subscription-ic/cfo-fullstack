"""Documents catalog + cascade delete HTTP routes."""

from fastapi import APIRouter, HTTPException, Response, status

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.documents import service as documents_service
from app.modules.documents.schemas import DocumentCatalogItem

router = APIRouter()


@router.get("/documents", response_model=list[DocumentCatalogItem])
def list_documents_catalog(_user: CurrentUserDep, supabase: SupabaseDep) -> list[DocumentCatalogItem]:
    """All ingested documents (admin catalog); newest first."""
    rows = documents_service.list_catalog(supabase)
    return [DocumentCatalogItem.model_validate(r) for r in rows]


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    document_id: str,
) -> Response:
    """Fully remove a document: storage object, chunks, analyses, extracted Q&A,
    and the documents row itself."""
    try:
        documents_service.delete_document_cascade(supabase, document_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
