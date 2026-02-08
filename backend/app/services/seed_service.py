"""Seed service for initial data"""
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.warehouse import Warehouse
from app.models.product import Product


async def seed_data():
    """Seed initial warehouses and products if empty"""
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        result = await db.execute(select(Warehouse).limit(1))
        if result.scalar_one_or_none():
            return  # Already seeded

        # SF Bay Area warehouses
        warehouses = [
            Warehouse(costco_id='143', name='San Francisco', address='450 10th Street', city='San Francisco', state='CA', zip_code='94103', metro_area='SF Bay Area'),
            Warehouse(costco_id='116', name='South San Francisco', address='2300 Junipero Serra Blvd', city='South San Francisco', state='CA', zip_code='94014', metro_area='SF Bay Area'),
            Warehouse(costco_id='119', name='Redwood City', address='2250 Middlefield Road', city='Redwood City', state='CA', zip_code='94063', metro_area='SF Bay Area'),
            Warehouse(costco_id='129', name='Mountain View', address='600 Showers Drive', city='Mountain View', state='CA', zip_code='94040', metro_area='SF Bay Area'),
            Warehouse(costco_id='124', name='Sunnyvale', address='1709 Automation Parkway', city='Sunnyvale', state='CA', zip_code='94089', metro_area='SF Bay Area'),
            Warehouse(costco_id='144', name='San Jose', address='1601 Coleman Avenue', city='San Jose', state='CA', zip_code='95110', metro_area='SF Bay Area'),
            Warehouse(costco_id='128', name='Almaden', address='5101 Almaden Expressway', city='San Jose', state='CA', zip_code='95118', metro_area='SF Bay Area'),
            Warehouse(costco_id='117', name='Foster City', address='1001 Metro Center Blvd', city='Foster City', state='CA', zip_code='94404', metro_area='SF Bay Area'),
            Warehouse(costco_id='474', name='San Leandro', address='1900 Davis Street', city='San Leandro', state='CA', zip_code='94577', metro_area='SF Bay Area'),
            Warehouse(costco_id='482', name='Richmond', address='4801 Central Avenue', city='Richmond', state='CA', zip_code='94804', metro_area='SF Bay Area'),
        ]

        products = [
            Product(item_number='1234567', description='Kirkland Signature Olive Oil Extra Virgin 2L', category='Grocery', brand='Kirkland Signature'),
            Product(item_number='7654321', description='Charmin Ultra Soft Toilet Paper 30 Mega Rolls', category='Household', brand='Charmin'),
            Product(item_number='1122334', description='Kirkland Signature Organic Eggs 24ct', category='Dairy', brand='Kirkland Signature'),
            Product(item_number='9988776', description='Bounty Advanced Paper Towels 12 Rolls', category='Household', brand='Bounty'),
            Product(item_number='5566778', description='Tide Pods Laundry Detergent 152ct', category='Household', brand='Tide'),
        ]

        db.add_all(warehouses)
        db.add_all(products)
        await db.commit()
        print("Database seeded with sample data")
