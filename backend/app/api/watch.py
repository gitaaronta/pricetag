"""Watch endpoints - check status of watched items"""
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.core.config import settings
from app.models.observation import PriceObservation
from app.schemas.scan import WatchItemRequest, WatchStatusResponse, WatchItemStatus

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Days without seeing an item before it's considered "disappeared"
DISAPPEARED_THRESHOLD_DAYS = 14


@router.post("/status", response_model=WatchStatusResponse)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def check_watch_status(
    request: Request,
    data: WatchItemRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Check status of watched items for a warehouse.

    Returns deltas for each item:
    - price_changed: price differs from previous scan
    - decision_changed: recommendation changed
    - became_clearance: price now ends in .97
    - disappeared: not seen in 14+ days
    """
    items: List[WatchItemStatus] = []

    for item_number in data.item_numbers:
        status = await _get_item_status(db, data.warehouse_id, item_number)
        items.append(status)

    return WatchStatusResponse(
        warehouse_id=data.warehouse_id,
        items=items,
        checked_at=datetime.utcnow().isoformat(),
    )


async def _get_item_status(
    db: AsyncSession,
    warehouse_id: int,
    item_number: str,
) -> WatchItemStatus:
    """Get status for a single watched item."""
    # Get the two most recent observations for this item
    result = await db.execute(
        select(PriceObservation)
        .where(
            PriceObservation.raw_item_number == item_number,
            PriceObservation.warehouse_id == warehouse_id,
            PriceObservation.is_quarantined == False,
        )
        .order_by(PriceObservation.observed_at.desc())
        .limit(2)
    )
    observations = result.scalars().all()

    if not observations:
        return WatchItemStatus(
            item_number=item_number,
            disappeared=True,  # Never seen
        )

    latest = observations[0]
    previous = observations[1] if len(observations) > 1 else None

    # Calculate days since last seen
    days_ago = (datetime.utcnow() - latest.observed_at).days if latest.observed_at else None

    # Check if disappeared
    disappeared = days_ago is not None and days_ago >= DISAPPEARED_THRESHOLD_DAYS

    # Check price change
    price_changed = False
    previous_price = None
    if previous and latest.raw_price and previous.raw_price:
        previous_price = float(previous.raw_price)
        price_changed = abs(float(latest.raw_price) - previous_price) > 0.01

    # Check if became clearance (.97)
    became_clearance = False
    if latest.price_ending == '.97':
        if previous and previous.price_ending != '.97':
            became_clearance = True
        elif not previous:
            became_clearance = True  # First time seeing it and it's clearance

    # Determine current decision based on price ending
    current_decision = _infer_decision(latest.price_ending, latest.has_asterisk)

    # Check decision change
    decision_changed = False
    if previous:
        prev_decision = _infer_decision(previous.price_ending, previous.has_asterisk)
        decision_changed = current_decision != prev_decision

    return WatchItemStatus(
        item_number=item_number,
        current_price=float(latest.raw_price) if latest.raw_price else None,
        previous_price=previous_price,
        price_changed=price_changed,
        decision_changed=decision_changed,
        became_clearance=became_clearance,
        disappeared=disappeared,
        last_seen_days=days_ago,
        current_decision=current_decision,
    )


def _infer_decision(
    price_ending: str | None,
    has_asterisk: bool | None,
) -> str:
    """Infer decision from price signals (simplified)."""
    if has_asterisk:
        return 'BUY_NOW'
    if price_ending == '.97':
        return 'BUY_NOW'
    if price_ending == '.00':
        return 'WAIT_IF_YOU_CAN'
    return 'OK_PRICE'
