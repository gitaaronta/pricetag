"""Observation Service - Event-sourced price data ingestion"""
import uuid
from decimal import Decimal
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.observation import PriceObservation
from app.models.product import Product
from app.models.snapshot import PriceSnapshot
from app.services.ocr import OCRExtraction
from app.core.config import settings


class ObservationService:
    """
    Service for creating and managing price observations.

    Implements event-sourced pattern:
    - Observations are immutable
    - Snapshots are derived from observations
    - Quarantine system for suspicious data
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_observation(
        self,
        warehouse_id: int,
        extraction: OCRExtraction,
        session_id: Optional[str],
        client_ip_hash: str,
    ) -> PriceObservation:
        """
        Create a new price observation from OCR extraction.

        Applies quality checks and may quarantine suspicious data.
        """
        # Check for duplicate via pHash
        is_duplicate = await self._check_duplicate(extraction.image_phash, warehouse_id)

        # Look up or create product
        product = await self._get_or_create_product(
            extraction.item_number,
            extraction.description,
        )

        # Create observation
        observation = PriceObservation(
            observation_id=str(uuid.uuid4()),
            warehouse_id=warehouse_id,
            product_id=product.id if product else None,
            raw_item_number=extraction.item_number,
            raw_price=extraction.price,
            raw_unit_price=extraction.unit_price,
            raw_unit_measure=extraction.unit_measure,
            raw_description=extraction.description,
            price_ending=extraction.price_ending,
            has_asterisk=extraction.has_asterisk,
            source_type='user_scan',
            extraction_confidence=Decimal(str(extraction.confidence)),
            image_phash=extraction.image_phash,
            session_id=session_id,
            client_ip_hash=client_ip_hash,
            observed_at=datetime.utcnow(),
        )

        # Apply quarantine rules
        quarantine_reason = self._check_quarantine_rules(observation, is_duplicate)
        if quarantine_reason:
            observation.is_quarantined = True
            observation.quarantine_reason = quarantine_reason

        self.db.add(observation)
        await self.db.commit()
        await self.db.refresh(observation)

        # Update snapshot if not quarantined
        if not observation.is_quarantined and product:
            await self._update_snapshot(observation, product.id)

        return observation

    async def create_manual_observation(
        self,
        warehouse_id: int,
        item_number: str,
        price: Decimal,
        description: Optional[str],
        session_id: Optional[str],
        client_ip_hash: str,
    ) -> PriceObservation:
        """Create observation from manual entry (lower confidence)."""
        # Look up or create product
        product = await self._get_or_create_product(item_number, description)

        # Determine price ending
        price_str = f"{price:.2f}"
        price_ending = "." + price_str[-2:]

        observation = PriceObservation(
            observation_id=str(uuid.uuid4()),
            warehouse_id=warehouse_id,
            product_id=product.id if product else None,
            raw_item_number=item_number,
            raw_price=price,
            raw_description=description,
            price_ending=price_ending,
            source_type='manual',
            extraction_confidence=Decimal('0.70'),  # Manual = lower confidence
            session_id=session_id,
            client_ip_hash=client_ip_hash,
            observed_at=datetime.utcnow(),
        )

        self.db.add(observation)
        await self.db.commit()
        await self.db.refresh(observation)

        # Update snapshot
        if product:
            await self._update_snapshot(observation, product.id)

        return observation

    async def _check_duplicate(self, phash: Optional[str], warehouse_id: int) -> bool:
        """Check if this image was recently submitted (pHash similarity)."""
        if not phash:
            return False

        # Look for exact pHash match in last 24 hours
        result = await self.db.execute(
            select(PriceObservation).where(
                PriceObservation.image_phash == phash,
                PriceObservation.warehouse_id == warehouse_id,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _get_or_create_product(
        self, item_number: str, description: Optional[str]
    ) -> Optional[Product]:
        """Get existing product or create new one."""
        result = await self.db.execute(
            select(Product).where(Product.item_number == item_number)
        )
        product = result.scalar_one_or_none()

        if not product and item_number:
            product = Product(
                item_number=item_number,
                description=description or f"Item {item_number}",
            )
            self.db.add(product)
            await self.db.flush()

        return product

    def _check_quarantine_rules(
        self, observation: PriceObservation, is_duplicate: bool
    ) -> Optional[str]:
        """
        Check if observation should be quarantined.

        Quarantine reasons:
        - Duplicate image
        - Price outside reasonable range
        - Low extraction confidence
        """
        # Duplicate check
        if is_duplicate:
            return "duplicate_image"

        # Confidence check
        if observation.extraction_confidence < Decimal('0.50'):
            return "low_confidence"

        # Price sanity checks
        if observation.raw_price:
            price = float(observation.raw_price)
            if price < 0.01:
                return "price_too_low"
            if price > 5000:
                return "price_too_high"

        return None

    async def _update_snapshot(self, observation: PriceObservation, product_id: int):
        """Update or create price snapshot from new observation."""
        # Get existing snapshot
        result = await self.db.execute(
            select(PriceSnapshot).where(
                PriceSnapshot.warehouse_id == observation.warehouse_id,
                PriceSnapshot.product_id == product_id,
            )
        )
        snapshot = result.scalar_one_or_none()

        # Calculate quality score
        source_weight = {
            'user_scan': settings.SOURCE_WEIGHT_USER_SCAN,
            'manual': settings.SOURCE_WEIGHT_MANUAL,
            'api': settings.SOURCE_WEIGHT_API,
        }.get(observation.source_type, 0.8)

        quality_score = Decimal(str(
            source_weight * float(observation.extraction_confidence)
        ))

        if snapshot:
            # Update existing snapshot
            snapshot.current_price = observation.raw_price
            snapshot.current_unit_price = observation.raw_unit_price
            snapshot.unit_measure = observation.raw_unit_measure
            snapshot.price_ending = observation.price_ending
            snapshot.has_asterisk = observation.has_asterisk
            snapshot.quality_score = quality_score
            snapshot.observation_count += 1
            snapshot.last_observed_at = observation.observed_at
            snapshot.freshness_status = 'fresh'
        else:
            # Create new snapshot
            snapshot = PriceSnapshot(
                warehouse_id=observation.warehouse_id,
                product_id=product_id,
                current_price=observation.raw_price,
                current_unit_price=observation.raw_unit_price,
                unit_measure=observation.raw_unit_measure,
                price_ending=observation.price_ending,
                has_asterisk=observation.has_asterisk,
                quality_score=quality_score,
                observation_count=1,
                freshness_status='fresh',
                last_observed_at=observation.observed_at,
            )
            self.db.add(snapshot)

        await self.db.commit()
