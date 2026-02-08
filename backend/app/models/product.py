"""Product model"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    item_number = Column(String(20), unique=True, nullable=False, index=True)
    upc = Column(String(14), index=True)
    description = Column(String, nullable=False)
    category = Column(String(100), index=True)
    subcategory = Column(String(100))
    brand = Column(String(100))
    unit_size = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
