"""Decision Engine V2 - BUY NOW / OK PRICE / WAIT IF YOU CAN with intelligence"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional, Literal
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.snapshot import PriceSnapshot
from app.models.signal import CommunitySignal
from app.models.product import Product
from app.models.observation import PriceObservation
from app.schemas.scan import PriceSignal, CommunitySignal as CommunitySignalSchema, PriceHistory


@dataclass
class Decision:
    """Decision result with full V2 context"""
    verdict: str  # 'BUY_NOW', 'OK_PRICE', 'WAIT_IF_YOU_CAN'
    explanation: str

    # V2: Decision Intelligence
    rationale: str = ""  # One-sentence WHY
    factors: List[str] = field(default_factory=list)  # Max 3 factors

    # V2: Scarcity
    scarcity_level: Optional[str] = None  # PLENTY, LIMITED, LAST_UNITS, UNKNOWN
    scarcity_explanation: Optional[str] = None
    last_seen_days: Optional[int] = None

    # V2: Price History
    history: Optional[PriceHistory] = None

    # V2: Price Drop Likelihood
    price_drop_likelihood: Optional[float] = None  # 0-1
    confidence_level: Optional[str] = None  # LOW, MED, HIGH

    # V2: Intent
    intent_applied: Optional[str] = None

    # Legacy
    product_score: Optional[int] = None
    product_score_explanation: Optional[str] = None
    price_signals: List[PriceSignal] = field(default_factory=list)
    community_signals: List[CommunitySignalSchema] = field(default_factory=list)
    freshness: str = "fresh"


class DecisionEngine:
    """
    Deterministic decision engine for price recommendations.

    V2 adds:
    - Decision rationale (WHY sentence)
    - Decision factors (max 3)
    - Scarcity inference
    - Price history
    - Price drop likelihood
    - Intent-aware adjustments
    """

    # Price ending signals
    PRICE_SIGNALS = {
        '.97': PriceSignal(
            type='ending_97',
            label='Clearance Price',
            meaning='Manager markdown - often the lowest price you\'ll see',
        ),
        '.00': PriceSignal(
            type='ending_00',
            label='Regular Price',
            meaning='Full price with no discount applied',
        ),
        '.49': PriceSignal(
            type='ending_49',
            label="Manufacturer Discount",
            meaning='Temporary manufacturer rebate or promotion',
        ),
        '.99': PriceSignal(
            type='ending_99',
            label='Standard Price',
            meaning='Normal Costco pricing',
        ),
        'asterisk': PriceSignal(
            type='asterisk',
            label='Being Discontinued',
            meaning='Item won\'t be restocked - last chance to buy',
        ),
    }

    # Decision rationale templates
    RATIONALES = {
        'discontinued': "Discontinued item — no restock expected.",
        'clearance': "Clearance price — manager markdown won't last long.",
        'price_drop': "Price dropped significantly — good buying opportunity.",
        'price_up': "Price is up from recent levels — may drop back.",
        'regular_price': "Regular price with no discount — promotions likely.",
        'mfr_discount': "Manufacturer discount active — limited time offer.",
        'standard': "Standard Costco pricing — fair value for warehouse club.",
        'good_value': "Good value based on multiple positive signals.",
        'scarcity_buy': "Limited availability — buy now if you need it.",
    }

    async def get_decision(
        self,
        db: AsyncSession,
        warehouse_id: int,
        item_number: str,
        current_price: Decimal,
        price_ending: Optional[str],
        has_asterisk: bool,
        intent: Optional[Literal['NEED_IT', 'BARGAIN_HUNTING', 'BROWSING']] = 'BROWSING',
    ) -> Decision:
        """
        Generate buy/wait decision with V2 intelligence.
        """
        # Collect price signals
        signals = []
        if price_ending:
            signal = self.PRICE_SIGNALS.get(price_ending)
            if signal:
                signals.append(signal)

        if has_asterisk:
            signals.append(self.PRICE_SIGNALS['asterisk'])

        # Look up historical data
        snapshot = await self._get_snapshot(db, warehouse_id, item_number)
        community_sigs = await self._get_community_signals(db, warehouse_id, item_number)

        # V2: Get price history and scarcity
        history = await self._get_price_history(db, warehouse_id, item_number, current_price)
        scarcity_level, scarcity_explanation, last_seen_days = await self._compute_scarcity(
            db, warehouse_id, item_number, has_asterisk
        )

        # V2: Calculate price drop likelihood
        likelihood, confidence = self._compute_price_drop_likelihood(
            price_ending, has_asterisk, snapshot, history, scarcity_level
        )

        # Determine freshness
        freshness = self._calculate_freshness(snapshot)

        # Calculate product score
        product_score, score_explanation = self._calculate_product_score(
            current_price, snapshot, price_ending, has_asterisk
        )

        # Make decision with V2 factors
        verdict, explanation, rationale, factors = self._make_decision_v2(
            current_price=current_price,
            price_ending=price_ending,
            has_asterisk=has_asterisk,
            snapshot=snapshot,
            signals=signals,
            scarcity_level=scarcity_level,
            intent=intent,
        )

        return Decision(
            verdict=verdict,
            explanation=explanation,
            rationale=rationale,
            factors=factors[:3],  # Max 3 factors
            scarcity_level=scarcity_level,
            scarcity_explanation=scarcity_explanation,
            last_seen_days=last_seen_days,
            history=history,
            price_drop_likelihood=likelihood,
            confidence_level=confidence,
            intent_applied=intent,
            product_score=product_score,
            product_score_explanation=score_explanation,
            price_signals=signals,
            community_signals=community_sigs,
            freshness=freshness,
        )

    def _make_decision_v2(
        self,
        current_price: Decimal,
        price_ending: Optional[str],
        has_asterisk: bool,
        snapshot: Optional[PriceSnapshot],
        signals: List[PriceSignal],
        scarcity_level: Optional[str],
        intent: Optional[str],
    ) -> tuple[str, str, str, List[str]]:
        """
        Core decision logic with V2 rationale and factors.

        Returns (verdict, explanation, rationale, factors) tuple.
        """
        factors = []

        # Strong BUY NOW signals
        if has_asterisk:
            factors.append("Item marked discontinued")
            return (
                'BUY_NOW',
                "This item is being discontinued and won't be restocked. If you want it, buy it now.",
                self.RATIONALES['discontinued'],
                factors,
            )

        if price_ending == '.97':
            factors.append("Clearance pricing (.97)")
            return (
                'BUY_NOW',
                "Clearance price - this is typically the lowest price Costco will offer. "
                "Manager markdowns like this don't last long.",
                self.RATIONALES['clearance'],
                factors,
            )

        # Check historical context if available
        if snapshot:
            price_diff = current_price - snapshot.current_price
            pct_change = (price_diff / snapshot.current_price * 100) if snapshot.current_price else 0

            # Price dropped significantly
            if pct_change <= -10:
                factors.append(f"Price down {abs(pct_change):.0f}%")
                return (
                    'BUY_NOW',
                    f"Price dropped {abs(pct_change):.0f}% from recent levels. Good time to buy.",
                    self.RATIONALES['price_drop'],
                    factors,
                )

            # Price increased significantly
            if pct_change >= 15:
                factors.append(f"Price up {pct_change:.0f}%")
                return (
                    'WAIT_IF_YOU_CAN',
                    f"Price is up {pct_change:.0f}% from recent levels. May drop back down.",
                    self.RATIONALES['price_up'],
                    factors,
                )

            # Check 30/90 day history
            if snapshot.price_30d_ago and current_price < snapshot.price_30d_ago:
                factors.append("Below 30-day average")
            if snapshot.price_90d_ago and current_price < snapshot.price_90d_ago:
                factors.append("Below 90-day average")

        # Scarcity check - V2 intent-aware
        if scarcity_level == 'LAST_UNITS':
            factors.append("Inventory declining")
            if intent == 'NEED_IT':
                return (
                    'BUY_NOW',
                    "Very limited stock remaining. Buy now if you need this item.",
                    self.RATIONALES['scarcity_buy'],
                    factors,
                )
        elif scarcity_level == 'LIMITED':
            factors.append("Limited availability")

        # Moderate signals
        if price_ending == '.49':
            factors.append("Manufacturer discount active")
            if len(factors) >= 2:
                return (
                    'BUY_NOW',
                    f"Good value: manufacturer discount with {factors[0].lower()}.",
                    self.RATIONALES['mfr_discount'],
                    factors,
                )

        if price_ending == '.00':
            factors.append("Regular full price")
            # Bargain hunters should always wait on .00
            if intent == 'BARGAIN_HUNTING':
                return (
                    'WAIT_IF_YOU_CAN',
                    "Regular price with no discount. As a bargain hunter, wait for clearance.",
                    self.RATIONALES['regular_price'],
                    factors,
                )
            return (
                'WAIT_IF_YOU_CAN',
                "Regular price with no discount. Costco often runs promotions - "
                "consider waiting for a better price unless you need it now.",
                self.RATIONALES['regular_price'],
                factors,
            )

        # Default decisions based on accumulated factors
        if len(factors) >= 2:
            return (
                'BUY_NOW',
                f"Good value: {', '.join(f.lower() for f in factors[:2])}.",
                self.RATIONALES['good_value'],
                factors,
            )

        if factors:
            return (
                'OK_PRICE',
                f"Fair value: {factors[0].lower()}.",
                self.RATIONALES['standard'],
                factors,
            )

        # Standard .99 pricing with no special signals
        factors.append("Standard pricing")
        return (
            'OK_PRICE',
            "Standard Costco pricing. Fair value for a warehouse club.",
            self.RATIONALES['standard'],
            factors,
        )

    async def _compute_scarcity(
        self,
        db: AsyncSession,
        warehouse_id: int,
        item_number: str,
        has_asterisk: bool,
    ) -> tuple[Optional[str], Optional[str], Optional[int]]:
        """
        Infer scarcity level from observation patterns.

        Returns (scarcity_level, explanation, last_seen_days)
        """
        # Get recent observations
        cutoff_30d = datetime.utcnow() - timedelta(days=30)
        cutoff_7d = datetime.utcnow() - timedelta(days=7)

        result = await db.execute(
            select(
                func.count(PriceObservation.id).label('total_30d'),
                func.max(PriceObservation.observed_at).label('last_seen'),
            ).where(
                PriceObservation.raw_item_number == item_number,
                PriceObservation.warehouse_id == warehouse_id,
                PriceObservation.observed_at >= cutoff_30d,
                PriceObservation.is_quarantined == False,
            )
        )
        row = result.one_or_none()

        if not row or not row.last_seen:
            return ('UNKNOWN', None, None)

        total_30d = row.total_30d or 0
        last_seen = row.last_seen

        # Calculate days since last seen
        days_ago = (datetime.utcnow() - last_seen).days if last_seen else None

        # Count recent (7 day) observations
        result_7d = await db.execute(
            select(func.count(PriceObservation.id)).where(
                PriceObservation.raw_item_number == item_number,
                PriceObservation.warehouse_id == warehouse_id,
                PriceObservation.observed_at >= cutoff_7d,
                PriceObservation.is_quarantined == False,
            )
        )
        total_7d = result_7d.scalar() or 0

        # Scarcity heuristics
        if has_asterisk:
            return ('LAST_UNITS', "Item marked for discontinuation", days_ago)

        if days_ago and days_ago > 14:
            return ('LAST_UNITS', f"Not seen in {days_ago} days", days_ago)

        if total_30d <= 2 and days_ago and days_ago > 7:
            return ('LIMITED', "Few recent sightings", days_ago)

        if total_7d == 0 and total_30d > 0:
            return ('LIMITED', "Not seen this week", days_ago)

        if total_30d >= 5:
            return ('PLENTY', "Frequently observed", days_ago)

        return ('UNKNOWN', None, days_ago)

    async def _get_price_history(
        self,
        db: AsyncSession,
        warehouse_id: int,
        item_number: str,
        current_price: Decimal,
    ) -> Optional[PriceHistory]:
        """
        Build lightweight price history for display.
        """
        cutoff_60d = datetime.utcnow() - timedelta(days=60)

        # Get all observations in last 60 days
        result = await db.execute(
            select(PriceObservation.raw_price).where(
                PriceObservation.raw_item_number == item_number,
                PriceObservation.warehouse_id == warehouse_id,
                PriceObservation.observed_at >= cutoff_60d,
                PriceObservation.is_quarantined == False,
            )
        )
        prices = [float(row[0]) for row in result.all() if row[0]]

        if not prices:
            return None

        # Count times seen at current price (within $0.05)
        current_float = float(current_price)
        seen_at_price = sum(1 for p in prices if abs(p - current_float) < 0.05)

        # Find lowest
        lowest = min(prices)

        # Determine typical outcome based on price trajectory
        # If price tends to end in .97, it typically drops
        # If item has asterisk patterns, it typically sells out
        typical_outcome = 'UNKNOWN'
        if len(prices) >= 3:
            # Check if we've seen .97 pricing (clearance)
            has_clearance = any(str(p).endswith('97') or str(p).endswith('.97') for p in prices)
            if has_clearance:
                typical_outcome = 'TYPICALLY_DROPS'
            elif len(set(prices)) == 1:
                # Stable pricing - unknown outcome
                typical_outcome = 'UNKNOWN'

        return PriceHistory(
            seen_at_price_count_60d=seen_at_price,
            lowest_observed_price_60d=round(lowest, 2),
            typical_outcome=typical_outcome,
        )

    def _compute_price_drop_likelihood(
        self,
        price_ending: Optional[str],
        has_asterisk: bool,
        snapshot: Optional[PriceSnapshot],
        history: Optional[PriceHistory],
        scarcity_level: Optional[str],
    ) -> tuple[Optional[float], Optional[str]]:
        """
        Compute price drop likelihood (0-1) with confidence level.
        """
        # Not enough data
        if not history and not snapshot:
            return (None, None)

        # Discontinued items don't drop - they disappear
        if has_asterisk:
            return (0.1, 'HIGH')

        # Already clearance - unlikely to drop further
        if price_ending == '.97':
            return (0.15, 'HIGH')

        # Scarcity inverse correlation
        scarcity_penalty = 0
        if scarcity_level == 'LAST_UNITS':
            scarcity_penalty = 0.3
        elif scarcity_level == 'LIMITED':
            scarcity_penalty = 0.15

        # Base likelihood by price ending
        base = 0.5
        if price_ending == '.00':
            base = 0.7  # Regular prices often drop
        elif price_ending == '.49':
            base = 0.4  # Already discounted
        elif price_ending == '.99':
            base = 0.5  # Standard

        # History adjustment
        if history and history.typical_outcome == 'TYPICALLY_DROPS':
            base += 0.15
        elif history and history.typical_outcome == 'TYPICALLY_SELLS_OUT':
            base -= 0.2

        # Combine
        likelihood = max(0, min(1, base - scarcity_penalty))

        # Confidence based on data availability
        confidence = 'LOW'
        if history and history.seen_at_price_count_60d and history.seen_at_price_count_60d >= 3:
            confidence = 'MED'
        if snapshot and snapshot.observation_count and snapshot.observation_count >= 5:
            confidence = 'HIGH'

        return (round(likelihood, 2), confidence)

    def _calculate_product_score(
        self,
        current_price: Decimal,
        snapshot: Optional[PriceSnapshot],
        price_ending: Optional[str],
        has_asterisk: bool,
    ) -> tuple[Optional[int], Optional[str]]:
        """Calculate product score (0-100) WITH explanation."""
        if not snapshot:
            return None, None

        base_score = 50
        factors = []

        if price_ending == '.97':
            base_score += 30
            factors.append("clearance pricing (+30)")
        elif price_ending == '.49':
            base_score += 15
            factors.append("manufacturer discount (+15)")
        elif price_ending == '.00':
            base_score -= 15
            factors.append("full regular price (-15)")

        if has_asterisk:
            base_score += 20
            factors.append("last chance to buy (+20)")

        if snapshot.price_30d_ago:
            pct_vs_30d = ((snapshot.price_30d_ago - current_price) / snapshot.price_30d_ago * 100)
            if pct_vs_30d > 10:
                base_score += 15
                factors.append(f"{pct_vs_30d:.0f}% below 30-day price (+15)")
            elif pct_vs_30d < -10:
                base_score -= 10
                factors.append(f"{abs(pct_vs_30d):.0f}% above 30-day price (-10)")

        if snapshot.freshness_status == 'stale':
            base_score -= 10
            factors.append("data is older than 3 weeks (-10)")

        final_score = max(0, min(100, base_score))

        if factors:
            explanation = f"Score of {final_score}: " + ", ".join(factors) + "."
        else:
            explanation = f"Score of {final_score} based on standard Costco pricing with limited history."

        return final_score, explanation

    def _calculate_freshness(self, snapshot: Optional[PriceSnapshot]) -> str:
        """Calculate data freshness status."""
        if not snapshot:
            return "fresh"
        return snapshot.freshness_status or "fresh"

    async def _get_snapshot(
        self, db: AsyncSession, warehouse_id: int, item_number: str
    ) -> Optional[PriceSnapshot]:
        """Get existing price snapshot for this product/warehouse."""
        product_result = await db.execute(
            select(Product).where(Product.item_number == item_number)
        )
        product = product_result.scalar_one_or_none()

        if not product:
            return None

        result = await db.execute(
            select(PriceSnapshot).where(
                PriceSnapshot.warehouse_id == warehouse_id,
                PriceSnapshot.product_id == product.id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_community_signals(
        self, db: AsyncSession, warehouse_id: int, item_number: str
    ) -> List[CommunitySignalSchema]:
        """Get community signals for this product."""
        now = datetime.utcnow()
        result = await db.execute(
            select(CommunitySignal).where(
                CommunitySignal.warehouse_id == warehouse_id,
                CommunitySignal.raw_item_number == item_number,
                (CommunitySignal.expires_at.is_(None) | (CommunitySignal.expires_at > now)),
            ).limit(5)
        )
        signals = result.scalars().all()

        return [
            CommunitySignalSchema(
                type=s.signal_type,
                message=s.signal_value or f"Early signal: {s.signal_type}",
                reported_ago=self._time_ago(s.reported_at),
                verification_count=s.verification_count or 0,
            )
            for s in signals
        ]

    def _time_ago(self, dt: datetime) -> str:
        """Convert datetime to human-readable 'X ago' string."""
        if not dt:
            return "recently"

        now = datetime.utcnow()
        diff = now - dt

        if diff < timedelta(hours=1):
            mins = int(diff.total_seconds() / 60)
            return f"{mins} minute{'s' if mins != 1 else ''} ago"
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        else:
            days = diff.days
            return f"{days} day{'s' if days != 1 else ''} ago"
