"""Scan endpoints V2 - core camera-to-decision flow with intelligence"""
import hashlib
from typing import Optional, Literal
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.core.config import settings
from app.services.ocr import OCRService
from app.services.decision_engine import DecisionEngine
from app.services.observation_service import ObservationService
from app.schemas.scan import ScanResponse, ScanRequest

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
ocr_service = OCRService()
decision_engine = DecisionEngine()


@router.post("/", response_model=ScanResponse)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def scan_price_tag(
    request: Request,
    image: UploadFile = File(..., description="Photo of Costco shelf price tag"),
    warehouse_id: int = Form(..., description="Selected warehouse ID"),
    session_id: Optional[str] = Form(None, description="Client session UUID"),
    intent: Optional[Literal['NEED_IT', 'BARGAIN_HUNTING', 'BROWSING']] = Form('BROWSING', description="User intent"),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a price tag photo and return buy/wait decision with V2 intelligence.

    This is the core endpoint - camera capture → OCR → decision → response.
    Target: P95 latency < 2 seconds.
    """
    # Read image
    image_bytes = await image.read()

    # Hash client IP for rate limiting tracking
    client_ip = get_remote_address(request)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    # OCR extraction
    extraction = await ocr_service.extract_price_tag(image_bytes)

    if not extraction.success:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "ocr_failed",
                "message": "Could not read the price tag. Please try again with better lighting.",
                "tips": [
                    "Hold the camera steady",
                    "Ensure the full price tag is visible",
                    "Avoid glare and shadows",
                ],
            },
        )

    # Check confidence threshold
    if extraction.confidence < settings.OCR_CONFIDENCE_THRESHOLD:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "low_confidence",
                "message": "Price tag was partially readable. Please try again.",
                "partial_data": {
                    "item_number": extraction.item_number,
                    "price": str(extraction.price) if extraction.price else None,
                },
            },
        )

    # Store observation (event-sourced, immutable)
    observation_service = ObservationService(db)
    observation = await observation_service.create_observation(
        warehouse_id=warehouse_id,
        extraction=extraction,
        session_id=session_id,
        client_ip_hash=ip_hash,
    )

    # Get decision with V2 intelligence
    decision = await decision_engine.get_decision(
        db=db,
        warehouse_id=warehouse_id,
        item_number=extraction.item_number,
        current_price=extraction.price,
        price_ending=extraction.price_ending,
        has_asterisk=extraction.has_asterisk,
        intent=intent,
    )

    return ScanResponse(
        observation_id=str(observation.observation_id),
        item_number=extraction.item_number,
        description=extraction.description,
        price=float(extraction.price),
        price_ending=extraction.price_ending,
        unit_price=float(extraction.unit_price) if extraction.unit_price else None,
        unit_measure=extraction.unit_measure,
        # V1 Decision
        decision=decision.verdict,
        decision_explanation=decision.explanation,
        # V2 Intelligence
        decision_rationale=decision.rationale,
        decision_factors=decision.factors,
        scarcity_level=decision.scarcity_level,
        scarcity_explanation=decision.scarcity_explanation,
        last_seen_days=decision.last_seen_days,
        history=decision.history,
        price_drop_likelihood=decision.price_drop_likelihood,
        confidence_level=decision.confidence_level,
        intent_applied=decision.intent_applied,
        # Legacy
        product_score=decision.product_score,
        product_score_explanation=decision.product_score_explanation,
        price_signals=decision.price_signals,
        community_signals=decision.community_signals,
        freshness=decision.freshness,
        confidence=float(extraction.confidence),
        observed_at=datetime.utcnow().isoformat(),
    )


@router.post("/manual", response_model=ScanResponse)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def manual_price_entry(
    request: Request,
    data: ScanRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Manual price entry fallback when OCR fails.
    Lower quality score than camera scans.
    """
    client_ip = get_remote_address(request)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    # Create manual observation
    observation_service = ObservationService(db)
    observation = await observation_service.create_manual_observation(
        warehouse_id=data.warehouse_id,
        item_number=data.item_number,
        price=data.price,
        description=data.description,
        session_id=data.session_id,
        client_ip_hash=ip_hash,
    )

    # Determine price ending
    price_str = f"{data.price:.2f}"
    price_ending = "." + price_str[-2:]

    # Get decision with V2 intelligence
    decision = await decision_engine.get_decision(
        db=db,
        warehouse_id=data.warehouse_id,
        item_number=data.item_number,
        current_price=data.price,
        price_ending=price_ending,
        has_asterisk=data.has_asterisk or False,
        intent=data.intent or 'BROWSING',
    )

    return ScanResponse(
        observation_id=str(observation.observation_id),
        item_number=data.item_number,
        description=data.description or "Manual entry",
        price=float(data.price),
        price_ending=price_ending,
        unit_price=None,
        unit_measure=None,
        # V1 Decision
        decision=decision.verdict,
        decision_explanation=decision.explanation,
        # V2 Intelligence
        decision_rationale=decision.rationale,
        decision_factors=decision.factors,
        scarcity_level=decision.scarcity_level,
        scarcity_explanation=decision.scarcity_explanation,
        last_seen_days=decision.last_seen_days,
        history=decision.history,
        price_drop_likelihood=decision.price_drop_likelihood,
        confidence_level=decision.confidence_level,
        intent_applied=decision.intent_applied,
        # Legacy
        product_score=decision.product_score,
        product_score_explanation=decision.product_score_explanation,
        price_signals=decision.price_signals,
        community_signals=decision.community_signals,
        freshness=decision.freshness,
        confidence=0.70,  # Manual entries have lower confidence
        observed_at=datetime.utcnow().isoformat(),
    )
