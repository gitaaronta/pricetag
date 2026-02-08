"""Scan schemas"""
from typing import List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal


class PriceSignal(BaseModel):
    """Costco pricing signal"""
    type: str  # 'ending_97', 'ending_00', 'asterisk', 'ending_49'
    label: str  # Human-readable label
    meaning: str  # What this signal typically means


class CommunitySignal(BaseModel):
    """Early signal from other members (collapsed by default)"""
    type: str  # 'price_drop', 'clearance', 'out_of_stock'
    message: str
    reported_ago: str  # "2 hours ago", "3 days ago"
    verification_count: int


class ScanRequest(BaseModel):
    """Manual price entry request"""
    warehouse_id: int
    item_number: str = Field(..., min_length=5, max_length=20)
    price: Decimal = Field(..., gt=0, le=10000)
    description: Optional[str] = None
    has_asterisk: Optional[bool] = False
    session_id: Optional[str] = None


class ScanResponse(BaseModel):
    """Scan result with decision"""
    observation_id: str

    # Product info
    item_number: str
    description: str
    price: float
    unit_price: Optional[float] = None
    unit_measure: Optional[str] = None

    # Decision (the core value)
    decision: str  # 'BUY_NOW', 'OK_PRICE', 'WAIT_IF_YOU_CAN'
    decision_explanation: str  # Why this decision

    # Product score WITH explanation (never naked numbers)
    product_score: Optional[int] = None  # 0-100
    product_score_explanation: Optional[str] = None  # Required if score present

    # Pricing signals
    price_signals: List[PriceSignal] = []

    # Community signals (collapsed by default)
    community_signals: List[CommunitySignal] = []

    # Quality indicators
    freshness: str  # 'fresh', 'warm', 'stale'
    confidence: float  # 0.0 to 1.0
