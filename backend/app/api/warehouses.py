"""Warehouse endpoints"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import load_only

from app.core.database import get_db
from app.models.warehouse import Warehouse
from app.schemas.warehouse import WarehouseResponse, WarehouseListResponse

router = APIRouter()


@router.get("/", response_model=WarehouseListResponse)
async def list_warehouses(
    zip_code: Optional[str] = Query(None, description="Filter by ZIP code prefix"),
    metro_area: Optional[str] = Query(None, description="Filter by metro area"),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List warehouses, optionally filtered by ZIP code or metro area."""
    query = select(Warehouse)

    if zip_code:
        # Match ZIP prefix for nearby warehouses
        query = query.where(Warehouse.zip_code.startswith(zip_code[:3]))

    if metro_area:
        query = query.where(Warehouse.metro_area == metro_area)

    query = query.limit(limit)
    result = await db.execute(query)
    warehouses = result.scalars().all()

    return WarehouseListResponse(
        warehouses=[WarehouseResponse.model_validate(w) for w in warehouses],
        count=len(warehouses),
    )


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
async def get_warehouse(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific warehouse by ID."""
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    warehouse = result.scalar_one_or_none()

    if not warehouse:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Warehouse not found")

    return WarehouseResponse.model_validate(warehouse)
