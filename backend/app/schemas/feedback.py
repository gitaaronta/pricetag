"""Pydantic schemas for feedback API"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# Feedback reason codes
FeedbackReason = Literal[
    'wrong_price',
    'wrong_item_number',
    'missed_asterisk',
    'blurry',
    'bad_lighting',
    'cropped_wrong',
    'other',
]


class OcrSnapshotSchema(BaseModel):
    """OCR extraction snapshot for learning/debugging"""
    item_number: Optional[str] = None
    price: Optional[float] = None
    price_ending: Optional[str] = None
    has_asterisk: bool = False
    confidence: float = 0.0
    description: Optional[str] = None


class CorrectionsSchema(BaseModel):
    """User-provided corrections for inaccurate scans"""
    corrected_price: Optional[float] = None
    corrected_item_number: Optional[str] = None
    corrected_has_asterisk: Optional[bool] = None


class FeedbackCreateRequest(BaseModel):
    """Request to create scan feedback"""
    feedback_id: str = Field(..., description="Client-generated UUID")
    observation_id: str = Field(..., description="Observation this feedback is for")
    is_positive: bool = Field(..., description="True = thumbs up, False = thumbs down")
    reasons: List[FeedbackReason] = Field(default=[], description="Reasons for negative feedback")
    corrections: Optional[CorrectionsSchema] = None
    other_text: Optional[str] = Field(None, max_length=500)

    # OCR snapshots
    client_ocr_snapshot: Optional[OcrSnapshotSchema] = None
    server_ocr_snapshot: Optional[OcrSnapshotSchema] = None

    # Artifact reference
    artifact_id: Optional[str] = None
    artifact_sha256: Optional[str] = None

    # Metadata
    app_version: str = Field(..., max_length=20)
    pipeline_version: str = Field(..., max_length=20)
    warehouse_id: int
    created_at: datetime


class FeedbackCreateResponse(BaseModel):
    """Response after creating feedback"""
    feedback_id: str
    server_feedback_id: str
    accepted: bool


class ArtifactUploadResponse(BaseModel):
    """Response after uploading artifact"""
    artifact_id: str
    server_artifact_id: str
    sha256_verified: bool
    storage_key: str


class ArtifactCheckResponse(BaseModel):
    """Response for artifact existence check"""
    exists: bool
    artifact_id: Optional[str] = None


# Analytics schemas
class FeedbackStats(BaseModel):
    """Aggregated feedback statistics"""
    total_feedback: int
    positive_count: int
    negative_count: int
    positive_rate: float

    # Reason breakdown
    reason_counts: dict[str, int]

    # Correction stats
    price_corrections: int
    item_corrections: int
    asterisk_corrections: int

    # Time range
    from_date: datetime
    to_date: datetime


class FeedbackDetail(BaseModel):
    """Detailed feedback record for analytics"""
    id: int
    client_feedback_id: str
    observation_id: str
    is_positive: bool
    reasons: Optional[List[str]]
    corrections: Optional[dict]
    warehouse_id: int
    created_at: datetime
