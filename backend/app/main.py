"""PriceTag V1 - FastAPI Backend"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

from app.api import scan, warehouses, health
from app.core.config import settings
from app.core.database import engine, Base

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - initialize database
    from app.core.database import init_db
    await init_db()

    # Seed sample data
    from app.services.seed_service import seed_data
    await seed_data()

    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="PriceTag API",
    description="Camera-first price intelligence for Costco members",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, tags=["Health"])
app.include_router(warehouses.router, prefix="/api/v1/warehouses", tags=["Warehouses"])
app.include_router(scan.router, prefix="/api/v1/scan", tags=["Scan"])
