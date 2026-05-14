from pydantic import BaseModel, Field


class QuestionGenerationRequest(BaseModel):
    company: str = Field(..., min_length=1)
    fiscal_year: int | None = None
    quarter: str | None = Field(None, description="Q1, Q2, Q3, or Q4")
    last_n_quarters: int | None = Field(None, ge=1, le=40, description="Window over recent quarters")
    year_from: int | None = None
    year_to: int | None = None
    document_type_filter: str | None = None
    source_category_filter: str | None = None
    persist: bool = Field(False, description="Insert generated rows into predicted_qa")
    num_questions: int | None = Field(
        None,
        ge=1,
        le=40,
        description=(
            "If omitted, the server uses the average number of analyst questions "
            "asked for this company across the last 4 quarters (min 3, max 20)."
        ),
    )
    analysis_id: str | None = Field(None, description="Use analysis context from document_analyses")


class GeneratedQuestionItem(BaseModel):
    id: str | None = None
    predicted_question: str
    suggested_answer: str
    category: str
    category_l1: str | None = None
    category_l2: str | None = None
    risk: str = "medium"
    likelihood: str | None = None
    catalyst_type: str | None = None
    reasoning: str | None = None
    source_refs: list[str] = Field(default_factory=list)


class QuestionGenerationResponse(BaseModel):
    questions: list[GeneratedQuestionItem]
    context_summary: str = ""
    resolved_num_questions: int | None = None
