"""Price Snapshot model (derived materialized view)"""
from sqlalchemy import Column, Integer, BigInteger, String, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id = Column(BigInteger, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)

    # Current best price estimate
    current_price = Column(Numeric(10, 2), nullable=False)
    current_unit_price = Column(Numeric(10, 4))
    unit_measure = Column(String(20))

    # Price signals
    price_ending = Column(String(3))
    has_asterisk = Column(Boolean, default=False)

    # Quality scoring
    quality_score = Column(Numeric(4, 3), nullable=False)
    observation_count = Column(Integer, nullable=False, default=1)

    # Freshness
    freshness_status = Column(String(10), nullable=False, default="fresh")
    last_observed_at = Column(DateTime(timezone=True), nullable=False)

    # Historical context
    price_30d_ago = Column(Numeric(10, 2))
    price_90d_ago = Column(Numeric(10, 2))
    price_trend = Column(String(10))  # rising, falling, stable

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("warehouse_id", "product_id", name="uq_snapshot_warehouse_product"),
    )
