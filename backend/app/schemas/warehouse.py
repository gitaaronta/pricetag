"""Warehouse schemas"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from decimal import Decimal


class WarehouseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    costco_id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    metro_area: Optional[str] = None


class WarehouseListResponse(BaseModel):
    warehouses: List[WarehouseResponse]
    count: int
