"""Scan request/response schemas - V2 with decision intelligence"""
from typing import Optional, List, Literal
from decimal import Decimal
from pydantic import BaseModel, Field


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


class PriceHistory(BaseModel):
    """Lightweight price history for display"""
    seen_at_price_count_60d: Optional[int] = Field(None, description="Times seen at current price in 60 days")
    lowest_observed_price_60d: Optional[float] = Field(None, description="Lowest price observed in 60 days")
    typical_outcome: Optional[Literal['TYPICALLY_DROPS', 'TYPICALLY_SELLS_OUT', 'UNKNOWN']] = Field(
        None, description="What usually happens with this item"
    )


class ScanRequest(BaseModel):
    """Manual price entry request"""
    warehouse_id: int
    item_number: str = Field(..., min_length=5, max_length=20)
    price: Decimal = Field(..., gt=0, le=10000)
    description: Optional[str] = None
    has_asterisk: Optional[bool] = False
    session_id: Optional[str] = None
    intent: Optional[Literal['NEED_IT', 'BARGAIN_HUNTING', 'BROWSING']] = 'BROWSING'


class ScanResponse(BaseModel):
    """Full scan response with V2 decision intelligence"""
    observation_id: str

    # Product info
    item_number: str
    description: Optional[str] = None
    price: float
    price_ending: Optional[str] = Field(None, description="Price ending like .97, .00, .99")
    unit_price: Optional[float] = None
    unit_measure: Optional[str] = None

    # Decision (V1 - core value)
    decision: Literal['BUY_NOW', 'OK_PRICE', 'WAIT_IF_YOU_CAN']
    decision_explanation: str  # Why this decision

    # Decision Intelligence (V2)
    decision_rationale: str = Field(default="", description="One-sentence WHY explanation")
    decision_factors: List[str] = Field(default_factory=list, description="Max 3 factors used in decision")

    # Scarcity (V2)
    scarcity_level: Optional[Literal['PLENTY', 'LIMITED', 'LAST_UNITS', 'UNKNOWN']] = Field(
        None, description="Inferred scarcity level"
    )
    scarcity_explanation: Optional[str] = None
    last_seen_days: Optional[int] = Field(None, description="Days since last seen at this warehouse")

    # Price History (V2)
    history: Optional[PriceHistory] = None

    # Price Drop Likelihood (V2)
    price_drop_likelihood: Optional[float] = Field(None, ge=0, le=1, description="0-1 probability")
    confidence_level: Optional[Literal['LOW', 'MED', 'HIGH']] = None

    # Intent feedback (V2)
    intent_applied: Optional[Literal['NEED_IT', 'BARGAIN_HUNTING', 'BROWSING']] = None

    # Product score WITH explanation (never naked numbers)
    product_score: Optional[int] = None  # 0-100
    product_score_explanation: Optional[str] = None  # Required if score present

    # Pricing signals
    price_signals: List[PriceSignal] = Field(default_factory=list)

    # Community signals (collapsed by default)
    community_signals: List[CommunitySignal] = Field(default_factory=list)

    # Quality indicators
    freshness: str  # 'fresh', 'warm', 'stale'
    confidence: float  # 0.0 to 1.0

    # Timestamps
    observed_at: Optional[str] = None


class WatchItemRequest(BaseModel):
    """Request to check status of watched items"""
    warehouse_id: int
    item_numbers: List[str] = Field(..., max_length=50)


class WatchItemStatus(BaseModel):
    """Status of a single watched item"""
    item_number: str
    current_price: Optional[float] = None
    previous_price: Optional[float] = None
    price_changed: bool = False
    decision_changed: bool = False
    became_clearance: bool = False
    disappeared: bool = False
    last_seen_days: Optional[int] = None
    current_decision: Optional[Literal['BUY_NOW', 'OK_PRICE', 'WAIT_IF_YOU_CAN']] = None


class WatchStatusResponse(BaseModel):
    """Response with status of all watched items"""
    warehouse_id: int
    items: List[WatchItemStatus]
    checked_at: str
