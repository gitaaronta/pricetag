"""Scan Feedback and Artifact models for user feedback loop"""
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Text,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from datetime import datetime, timedelta

from app.core.database import Base


class ScanFeedback(Base):
    """
    User feedback on scan accuracy.
    Stores both positive (thumbs up) and negative (thumbs down) feedback
    with reasons and optional corrections.
    """
    __tablename__ = "scan_feedback"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Client-generated UUID for offline-first sync
    client_feedback_id = Column(String(36), unique=True, nullable=False, index=True)

    # Link to observation (client-side ID, may reconcile to server observation later)
    observation_id = Column(String(36), nullable=False, index=True)

    # Core feedback
    is_positive = Column(Boolean, nullable=False)  # True = thumbs up, False = thumbs down

    # Reasons (only for negative feedback)
    # Values: wrong_price, wrong_item_number, missed_asterisk, blurry, bad_lighting, cropped_wrong, other
    reasons = Column(JSON, nullable=True)  # Array of reason codes
    other_text = Column(Text, nullable=True)  # Free text if 'other' reason selected

    # User-provided corrections (optional)
    corrections = Column(JSON, nullable=True)
    # Structure: { corrected_price?: float, corrected_item_number?: str, corrected_has_asterisk?: bool }

    # OCR snapshots for learning/debugging
    client_ocr_snapshot = Column(JSON, nullable=True)
    server_ocr_snapshot = Column(JSON, nullable=True)
    # Structure: { item_number, price, price_ending, has_asterisk, confidence, description }

    # Artifact reference (if user opted in)
    artifact_id = Column(String(36), nullable=True)
    artifact_sha256 = Column(String(64), nullable=True)

    # Metadata
    warehouse_id = Column(Integer, nullable=False)
    app_version = Column(String(20), nullable=False)
    pipeline_version = Column(String(20), nullable=False)

    # Timestamps
    client_created_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('ix_feedback_warehouse_created', 'warehouse_id', 'created_at'),
        Index('ix_feedback_is_positive', 'is_positive'),
    )


class ScanArtifact(Base):
    """
    Cropped tag image artifacts uploaded with negative feedback.
    Only stored when user explicitly consents to "Help improve scanning".

    Privacy notes:
    - Only cropped tag images, NOT full shelf photos
    - Retention policy: 90 days default, then deleted
    - User consent required for each upload
    """
    __tablename__ = "scan_artifacts"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Client-generated UUID
    client_artifact_id = Column(String(36), unique=True, nullable=False, index=True)

    # Links
    feedback_id = Column(String(36), nullable=False, index=True)
    observation_id = Column(String(36), nullable=False, index=True)

    # Storage location (local path for now, will be S3 key later)
    storage_key = Column(String(255), nullable=False)

    # Image metadata
    sha256 = Column(String(64), nullable=False, index=True)  # For deduplication
    mime_type = Column(String(50), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    bytes = Column(Integer, nullable=False)
    crop_type = Column(String(20), nullable=False)  # 'tag_roi' or 'full_capture'

    # Timestamps and retention
    client_created_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    retention_expires_at = Column(DateTime(timezone=True), nullable=False)

    # Verification
    sha256_verified = Column(Boolean, default=False)  # Server computed hash matches client

    __table_args__ = (
        Index('ix_artifact_sha256', 'sha256'),
        Index('ix_artifact_retention', 'retention_expires_at'),
    )

    @staticmethod
    def default_retention_days() -> int:
        return 90

    @staticmethod
    def compute_retention_expiry(days: int = 90) -> datetime:
        return datetime.utcnow() + timedelta(days=days)
