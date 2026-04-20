"""Schemas for the Historical Intelligence Hub."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Key Topics (word-cloud data across quarters)
# ---------------------------------------------------------------------------

class TopicWeight(BaseModel):
    text: str
    weight: float = 1.0  # relative importance / frequency


class KeyTopicsResponse(BaseModel):
    topics: list[TopicWeight] = Field(default_factory=list)
    quarters_used: int = 0
    company: str = ""


# ---------------------------------------------------------------------------
# Available quarters list
# ---------------------------------------------------------------------------

class QuarterSummary(BaseModel):
    fiscal_year: int
    quarter: str
    document_count: int = 0
    actual_qa_count: int = 0
    has_analysis: bool = False


class QuartersListResponse(BaseModel):
    quarters: list[QuarterSummary] = Field(default_factory=list)
    company: str = ""


# ---------------------------------------------------------------------------
# Quarter detail
# ---------------------------------------------------------------------------

class QuarterQuestion(BaseModel):
    id: str
    question: str
    answer: str | None = None
    answered_by: str | None = None
    category: str | None = None


class ThemeBadge(BaseModel):
    name: str
    importance: str = "medium"


class SentimentDetail(BaseModel):
    overall: str = "neutral"  # positive, neutral, negative
    positive_points: list[str] = Field(default_factory=list)
    negative_points: list[str] = Field(default_factory=list)


class CallAttendee(BaseModel):
    name: str
    role: str = "management"  # "management" | "analyst"


class QuarterDetailResponse(BaseModel):
    company: str
    fiscal_year: int
    quarter: str
    themes: list[ThemeBadge] = Field(default_factory=list)
    questions: list[QuarterQuestion] = Field(default_factory=list)
    sentiment: SentimentDetail = Field(default_factory=SentimentDetail)
    ai_summary: str = ""
    signals: list[dict] = Field(default_factory=list)
    attendees: list[CallAttendee] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AI Chat
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    company: str = Field(..., min_length=1)
    quarter: str | None = None
    fiscal_year: int | None = None
    history: list[dict] = Field(default_factory=list, description="Prior messages [{role, content}]")


class ChatResponse(BaseModel):
    reply: str
    sources: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AI Summary generation
# ---------------------------------------------------------------------------

class SummaryRequest(BaseModel):
    company: str = Field(..., min_length=1)
    fiscal_year: int
    quarter: str


class SummaryResponse(BaseModel):
    summary: str
    company: str
    fiscal_year: int
    quarter: str
