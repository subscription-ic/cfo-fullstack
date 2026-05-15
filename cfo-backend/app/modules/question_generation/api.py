from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.question_generation.schemas import QuestionGenerationRequest, QuestionGenerationResponse
from app.modules.question_generation.service import NoPeriodDocumentsError, run_question_generation

router = APIRouter()


@router.post("/question-generation", response_model=QuestionGenerationResponse)
def question_generation(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    body: QuestionGenerationRequest,
) -> QuestionGenerationResponse:
    try:
        return run_question_generation(supabase, body)
    except NoPeriodDocumentsError as exc:
        # 400: caller asked for POST-mode generation against a quarter that
        # has no documents. Refuse rather than silently fall back to thematic
        # cross-quarter content.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
