"""Warehouse model"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    costco_id = Column(String(10), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(String, nullable=False)
    city = Column(String(100), nullable=False)
    state = Column(String(2), nullable=False)
    zip_code = Column(String(10), nullable=False, index=True)
    latitude = Column(Numeric(10, 7))
    longitude = Column(Numeric(10, 7))
    metro_area = Column(String(100), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
