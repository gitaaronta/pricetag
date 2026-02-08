"""Community Signal model"""
from sqlalchemy import Column, Integer, BigInteger, String, Numeric, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class CommunitySignal(Base):
    __tablename__ = "community_signals"

    id = Column(BigInteger, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    raw_item_number = Column(String(20))

    signal_type = Column(String(50), nullable=False)  # price_drop, clearance, out_of_stock, new_item
    signal_value = Column(String)

    # Verification status
    verification_count = Column(Integer, default=0)
    is_verified = Column(Boolean, default=False)

    # Quality
    source_quality = Column(Numeric(3, 2), default=0.50)

    reported_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True))

    session_id = Column(String(36))
