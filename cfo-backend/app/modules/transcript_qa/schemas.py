from pydantic import BaseModel, Field


class ActualEarningsQACreate(BaseModel):
    company: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    answer: str | None = None
    answered_by: str | None = None
    category: str | None = None
    fiscal_year: int | None = None
    quarter: str | None = None
    period_label: str | None = None


class ActualEarningsQAUpdate(BaseModel):
    company: str | None = None
    question: str | None = None
    answer: str | None = None
    answered_by: str | None = None
    category: str | None = None
    fiscal_year: int | None = None
    quarter: str | None = None
    period_label: str | None = None
