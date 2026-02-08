"""Decision Engine - BUY NOW / OK PRICE / WAIT IF YOU CAN logic"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.snapshot import PriceSnapshot
from app.models.signal import CommunitySignal
from app.models.product import Product
from app.schemas.scan import PriceSignal, CommunitySignal as CommunitySignalSchema


@dataclass
class Decision:
    """Decision result with full context"""
    verdict: str  # 'BUY_NOW', 'OK_PRICE', 'WAIT_IF_YOU_CAN'
    explanation: str
    product_score: Optional[int] = None
    product_score_explanation: Optional[str] = None
    price_signals: List[PriceSignal] = field(default_factory=list)
    community_signals: List[CommunitySignalSchema] = field(default_factory=list)
    freshness: str = "fresh"


class DecisionEngine:
    """
    Deterministic decision engine for price recommendations.

    Decision Logic:
    - BUY NOW: Price ending in .97 (clearance), asterisk (discontinuing), or historically low
    - OK PRICE: Normal pricing (.99, .49), stable prices
    - WAIT IF YOU CAN: Prices ending in .00 (new/regular), trending up, or historically high

    Costco Price Endings:
    - .97 = Manager's markdown / clearance
    - .00 = Regular price (no discount)
    - .49 = Manufacturer's discount
    - .99 = Normal Costco price
    - * (asterisk) = Item being discontinued, won't be restocked
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

    async def get_decision(
        self,
        db: AsyncSession,
        warehouse_id: int,
        item_number: str,
        current_price: Decimal,
        price_ending: Optional[str],
        has_asterisk: bool,
    ) -> Decision:
        """
        Generate buy/wait decision based on price signals and history.

        Returns Decision with verdict, explanation, score, and signals.
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

        # Determine freshness
        freshness = self._calculate_freshness(snapshot)

        # Calculate product score
        product_score, score_explanation = self._calculate_product_score(
            current_price, snapshot, price_ending, has_asterisk
        )

        # Make decision
        verdict, explanation = self._make_decision(
            current_price=current_price,
            price_ending=price_ending,
            has_asterisk=has_asterisk,
            snapshot=snapshot,
            signals=signals,
        )

        return Decision(
            verdict=verdict,
            explanation=explanation,
            product_score=product_score,
            product_score_explanation=score_explanation,
            price_signals=signals,
            community_signals=community_sigs,
            freshness=freshness,
        )

    def _make_decision(
        self,
        current_price: Decimal,
        price_ending: Optional[str],
        has_asterisk: bool,
        snapshot: Optional[PriceSnapshot],
        signals: List[PriceSignal],
    ) -> tuple[str, str]:
        """
        Core decision logic.

        Returns (verdict, explanation) tuple.
        """
        reasons = []

        # Strong BUY NOW signals
        if has_asterisk:
            return (
                'BUY_NOW',
                "This item is being discontinued and won't be restocked. If you want it, buy it now.",
            )

        if price_ending == '.97':
            reasons.append("clearance pricing (.97 ending)")
            return (
                'BUY_NOW',
                "Clearance price - this is typically the lowest price Costco will offer. "
                "Manager markdowns like this don't last long.",
            )

        # Check historical context if available
        if snapshot:
            price_diff = current_price - snapshot.current_price
            pct_change = (price_diff / snapshot.current_price * 100) if snapshot.current_price else 0

            # Price dropped significantly
            if pct_change <= -10:
                return (
                    'BUY_NOW',
                    f"Price dropped {abs(pct_change):.0f}% from recent levels. Good time to buy.",
                )

            # Price increased significantly
            if pct_change >= 15:
                return (
                    'WAIT_IF_YOU_CAN',
                    f"Price is up {pct_change:.0f}% from recent levels. May drop back down.",
                )

            # Check 30/90 day history
            if snapshot.price_30d_ago and current_price < snapshot.price_30d_ago:
                reasons.append("below 30-day average")
            if snapshot.price_90d_ago and current_price < snapshot.price_90d_ago:
                reasons.append("below 90-day average")

        # Moderate signals
        if price_ending == '.49':
            reasons.append("manufacturer discount active")

        if price_ending == '.00':
            return (
                'WAIT_IF_YOU_CAN',
                "Regular price with no discount. Costco often runs promotions - "
                "consider waiting for a better price unless you need it now.",
            )

        # Default decisions based on accumulated reasons
        if reasons:
            return (
                'BUY_NOW' if len(reasons) >= 2 else 'OK_PRICE',
                f"Good value: {', '.join(reasons)}.",
            )

        # Standard .99 pricing with no special signals
        return (
            'OK_PRICE',
            "Standard Costco pricing. Fair value for a warehouse club.",
        )

    def _calculate_product_score(
        self,
        current_price: Decimal,
        snapshot: Optional[PriceSnapshot],
        price_ending: Optional[str],
        has_asterisk: bool,
    ) -> tuple[Optional[int], Optional[str]]:
        """
        Calculate product score (0-100) WITH explanation.

        Score factors:
        - Price ending signal (clearance = high, regular = low)
        - Historical comparison
        - Data freshness
        """
        if not snapshot:
            # No history - can't score accurately
            return None, None

        base_score = 50  # Start neutral

        factors = []

        # Price ending bonus/penalty
        if price_ending == '.97':
            base_score += 30
            factors.append("clearance pricing (+30)")
        elif price_ending == '.49':
            base_score += 15
            factors.append("manufacturer discount (+15)")
        elif price_ending == '.00':
            base_score -= 15
            factors.append("full regular price (-15)")

        # Asterisk bonus
        if has_asterisk:
            base_score += 20
            factors.append("last chance to buy (+20)")

        # Historical comparison
        if snapshot.price_30d_ago:
            pct_vs_30d = ((snapshot.price_30d_ago - current_price) / snapshot.price_30d_ago * 100)
            if pct_vs_30d > 10:
                base_score += 15
                factors.append(f"{pct_vs_30d:.0f}% below 30-day price (+15)")
            elif pct_vs_30d < -10:
                base_score -= 10
                factors.append(f"{abs(pct_vs_30d):.0f}% above 30-day price (-10)")

        # Freshness penalty
        if snapshot.freshness_status == 'stale':
            base_score -= 10
            factors.append("data is older than 3 weeks (-10)")

        # Clamp to 0-100
        final_score = max(0, min(100, base_score))

        # Build explanation (required - never show naked numbers)
        if factors:
            explanation = f"Score of {final_score}: " + ", ".join(factors) + "."
        else:
            explanation = f"Score of {final_score} based on standard Costco pricing with limited history."

        return final_score, explanation

    def _calculate_freshness(self, snapshot: Optional[PriceSnapshot]) -> str:
        """Calculate data freshness status."""
        if not snapshot:
            return "fresh"  # New observation, no history

        return snapshot.freshness_status or "fresh"

    async def _get_snapshot(
        self, db: AsyncSession, warehouse_id: int, item_number: str
    ) -> Optional[PriceSnapshot]:
        """Get existing price snapshot for this product/warehouse."""
        # First find product by item number
        product_result = await db.execute(
            select(Product).where(Product.item_number == item_number)
        )
        product = product_result.scalar_one_or_none()

        if not product:
            return None

        # Then get snapshot
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
        """Get community signals for this product (collapsed by default)."""
        # Find non-expired signals
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
