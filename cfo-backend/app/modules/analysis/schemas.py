"""Schemas for the document analysis pipeline."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ThemeItem(BaseModel):
    name: str
    description: str
    evidence: list[str] = Field(default_factory=list)
    importance: str = "medium"  # high, medium, low


class DeltaItem(BaseModel):
    theme: str
    direction: str  # improved, declined, stable
    current_summary: str
    previous_summary: str = ""
    magnitude: str = ""  # significant, moderate, marginal


class SignalItem(BaseModel):
    type: str  # risk, driver, confidence, forward_looking
    description: str
    severity: str = "medium"  # high, medium, low
    evidence: str = ""


class QuestionPatternItem(BaseModel):
    theme: str
    pattern_description: str
    example_questions: list[str] = Field(default_factory=list)
    frequency: str = "occasional"  # frequent, occasional, rare


class AnalysisResult(BaseModel):
    id: str | None = None
    document_id: str
    company: str
    fiscal_year: int
    quarter: str
    detected_company: str | None = None
    detected_period: str | None = None
    themes: list[ThemeItem] = Field(default_factory=list)
    deltas: list[DeltaItem] = Field(default_factory=list)
    signals: list[SignalItem] = Field(default_factory=list)
    question_patterns: list[QuestionPatternItem] = Field(default_factory=list)
    status: str = "pending"
    error_message: str | None = None
    created_at: str | None = None


class RunAnalysisRequest(BaseModel):
    document_id: str
    force: bool = Field(False, description="Re-run even if analysis already exists")


class RunAnalysisResponse(BaseModel):
    analysis: AnalysisResult
    context_summary: str = ""
