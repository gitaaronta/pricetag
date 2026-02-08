"""Price Observation model (immutable event log)"""
from sqlalchemy import Column, Integer, BigInteger, String, Numeric, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
import uuid

from app.core.database import Base


class PriceObservation(Base):
    __tablename__ = "price_observations"

    id = Column(BigInteger, primary_key=True, index=True)
    observation_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)

    # Raw extracted data
    raw_item_number = Column(String(20), index=True)
    raw_price = Column(Numeric(10, 2), nullable=False)
    raw_unit_price = Column(Numeric(10, 4))
    raw_unit_measure = Column(String(20))
    raw_description = Column(String)

    # Costco pricing signals
    price_ending = Column(String(3))  # '.97', '.00', '.99', '.49'
    has_asterisk = Column(Boolean, default=False)

    # Quality metadata
    source_type = Column(String(20), nullable=False, default="user_scan")
    extraction_confidence = Column(Numeric(3, 2), nullable=False)
    image_phash = Column(String(64), index=True)

    # Quarantine status
    is_quarantined = Column(Boolean, default=False, index=True)
    quarantine_reason = Column(String(100))

    # Timestamps
    observed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Session tracking (strings for SQLite compatibility)
    session_id = Column(String(36))
    client_ip_hash = Column(String(64))
