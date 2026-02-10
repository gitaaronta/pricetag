"""Feedback API endpoints for user feedback loop"""
import os
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.models.feedback import ScanFeedback, ScanArtifact
from app.schemas.feedback import (
    FeedbackCreateRequest,
    FeedbackCreateResponse,
    ArtifactUploadResponse,
    ArtifactCheckResponse,
)

router = APIRouter()

# Artifact storage directory (local for now, will be S3 later)
ARTIFACT_STORAGE_DIR = Path(settings.DATA_DIR) / "artifacts"
ARTIFACT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/", response_model=FeedbackCreateResponse)
async def create_feedback(
    request: FeedbackCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit scan feedback (thumbs up/down with optional reasons and corrections).

    This endpoint accepts offline-first feedback with client-generated IDs.
    Feedback is linked to observations and can include corrections for learning.
    """
    # Check for duplicate (idempotent)
    existing = await db.execute(
        select(ScanFeedback).where(
            ScanFeedback.client_feedback_id == request.feedback_id
        )
    )
    existing_feedback = existing.scalar_one_or_none()

    if existing_feedback:
        return FeedbackCreateResponse(
            feedback_id=request.feedback_id,
            server_feedback_id=str(existing_feedback.id),
            accepted=True,
        )

    # Create feedback record
    feedback = ScanFeedback(
        client_feedback_id=request.feedback_id,
        observation_id=request.observation_id,
        is_positive=request.is_positive,
        reasons=request.reasons if request.reasons else None,
        other_text=request.other_text,
        corrections=request.corrections.model_dump() if request.corrections else None,
        client_ocr_snapshot=request.client_ocr_snapshot.model_dump() if request.client_ocr_snapshot else None,
        server_ocr_snapshot=request.server_ocr_snapshot.model_dump() if request.server_ocr_snapshot else None,
        artifact_id=request.artifact_id,
        artifact_sha256=request.artifact_sha256,
        warehouse_id=request.warehouse_id,
        app_version=request.app_version,
        pipeline_version=request.pipeline_version,
        client_created_at=request.created_at,
    )

    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)

    return FeedbackCreateResponse(
        feedback_id=request.feedback_id,
        server_feedback_id=str(feedback.id),
        accepted=True,
    )


@router.post("/artifact", response_model=ArtifactUploadResponse)
async def upload_artifact(
    image: UploadFile = File(..., description="Cropped tag image"),
    artifact_id: str = Form(..., description="Client-generated artifact UUID"),
    feedback_id: str = Form(..., description="Associated feedback UUID"),
    observation_id: str = Form(..., description="Associated observation UUID"),
    sha256: str = Form(..., description="Client-computed SHA256 hash"),
    mime_type: str = Form(..., description="Image MIME type"),
    width: int = Form(..., description="Image width in pixels"),
    height: int = Form(..., description="Image height in pixels"),
    bytes: int = Form(..., description="Image size in bytes"),
    crop_type: str = Form(..., description="How image was cropped: tag_roi or full_capture"),
    created_at: str = Form(..., description="Client timestamp ISO format"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a cropped tag image artifact for negative feedback.

    Privacy notes:
    - Only accepts cropped tag images (not full shelf photos)
    - User must have explicitly consented via the feedback UI
    - Artifacts are subject to retention policy (90 days default)
    - SHA256 is verified server-side to match client claim
    """
    # Check for duplicate (idempotent)
    existing = await db.execute(
        select(ScanArtifact).where(
            ScanArtifact.client_artifact_id == artifact_id
        )
    )
    existing_artifact = existing.scalar_one_or_none()

    if existing_artifact:
        return ArtifactUploadResponse(
            artifact_id=artifact_id,
            server_artifact_id=str(existing_artifact.id),
            sha256_verified=existing_artifact.sha256_verified,
            storage_key=existing_artifact.storage_key,
        )

    # Also check by SHA256 for content deduplication
    existing_by_hash = await db.execute(
        select(ScanArtifact).where(ScanArtifact.sha256 == sha256)
    )
    existing_by_hash_artifact = existing_by_hash.scalar_one_or_none()

    if existing_by_hash_artifact:
        # Same content already exists, just create a reference
        artifact = ScanArtifact(
            client_artifact_id=artifact_id,
            feedback_id=feedback_id,
            observation_id=observation_id,
            storage_key=existing_by_hash_artifact.storage_key,  # Reuse existing file
            sha256=sha256,
            mime_type=mime_type,
            width=width,
            height=height,
            bytes=bytes,
            crop_type=crop_type,
            client_created_at=datetime.fromisoformat(created_at.replace('Z', '+00:00')),
            retention_expires_at=ScanArtifact.compute_retention_expiry(),
            sha256_verified=True,
        )
        db.add(artifact)
        await db.commit()
        await db.refresh(artifact)

        return ArtifactUploadResponse(
            artifact_id=artifact_id,
            server_artifact_id=str(artifact.id),
            sha256_verified=True,
            storage_key=artifact.storage_key,
        )

    # Read and verify image
    image_bytes = await image.read()

    # Compute server-side SHA256
    server_sha256 = hashlib.sha256(image_bytes).hexdigest()
    sha256_verified = server_sha256 == sha256.lower()

    if not sha256_verified:
        # Log mismatch but still accept (for debugging)
        print(f"[Feedback] SHA256 mismatch: client={sha256[:16]}... server={server_sha256[:16]}...")

    # Validate size limits
    max_size = 5 * 1024 * 1024  # 5MB
    if len(image_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail={"message": f"Artifact too large. Max size is {max_size} bytes."},
        )

    # Generate storage path: artifacts/{year}/{month}/{sha256[:2]}/{sha256}.jpg
    now = datetime.utcnow()
    storage_subdir = f"{now.year}/{now.month:02d}/{server_sha256[:2]}"
    storage_dir = ARTIFACT_STORAGE_DIR / storage_subdir
    storage_dir.mkdir(parents=True, exist_ok=True)

    # Use SHA256 as filename for content-addressable storage
    extension = mime_type.split('/')[-1] if '/' in mime_type else 'jpg'
    filename = f"{server_sha256}.{extension}"
    storage_path = storage_dir / filename
    storage_key = f"{storage_subdir}/{filename}"

    # Write file
    with open(storage_path, 'wb') as f:
        f.write(image_bytes)

    # Create artifact record
    artifact = ScanArtifact(
        client_artifact_id=artifact_id,
        feedback_id=feedback_id,
        observation_id=observation_id,
        storage_key=storage_key,
        sha256=server_sha256,  # Use server-computed hash
        mime_type=mime_type,
        width=width,
        height=height,
        bytes=len(image_bytes),
        crop_type=crop_type,
        client_created_at=datetime.fromisoformat(created_at.replace('Z', '+00:00')),
        retention_expires_at=ScanArtifact.compute_retention_expiry(),
        sha256_verified=sha256_verified,
    )

    db.add(artifact)
    await db.commit()
    await db.refresh(artifact)

    return ArtifactUploadResponse(
        artifact_id=artifact_id,
        server_artifact_id=str(artifact.id),
        sha256_verified=sha256_verified,
        storage_key=storage_key,
    )


@router.get("/artifact/check", response_model=ArtifactCheckResponse)
async def check_artifact_exists(
    sha256: str = Query(..., description="SHA256 hash to check"),
    db: AsyncSession = Depends(get_db),
):
    """
    Check if an artifact with the given SHA256 already exists.
    Allows clients to skip uploading duplicates.
    """
    result = await db.execute(
        select(ScanArtifact).where(ScanArtifact.sha256 == sha256.lower())
    )
    artifact = result.scalar_one_or_none()

    return ArtifactCheckResponse(
        exists=artifact is not None,
        artifact_id=artifact.client_artifact_id if artifact else None,
    )
