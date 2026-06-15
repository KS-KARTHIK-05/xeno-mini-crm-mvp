"""
Seed Script — Aura Styles & Co
Generates 500 realistic Indian D2C fashion customers + ~2000 orders.

Usage:
    cd backend
    python scripts/seed.py

Requires DATABASE_URL in .env
"""

import asyncio
import json
import random
import sys
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Load .env FIRST before any app imports ────────────────────
# app.database reads DATABASE_URL on import, so we must set it first
sys.path.insert(0, str(Path(__file__).parent.parent))

_backend_env = Path(__file__).parent.parent / ".env"
_root_env = Path(__file__).parent.parent.parent / ".env"

from dotenv import load_dotenv
if _backend_env.exists():
    load_dotenv(_backend_env)
    print(f"Loaded .env from: {_backend_env}")
elif _root_env.exists():
    load_dotenv(_root_env)
    print(f"Loaded .env from: {_root_env}")
else:
    print("No .env found — make sure backend/.env exists with DATABASE_URL set.")

# ── Now safe to import app modules ────────────────────────────
from faker import Faker
from sqlalchemy import text
from app.database import AsyncSessionLocal

fake = Faker("en_IN")
random.seed(42)

# ── Brand-specific data ───────────────────────────────────────
CITIES = [
    "Delhi", "Mumbai", "Bangalore", "Hyderabad", "Chennai",
    "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Surat",
]
CITY_WEIGHTS = [20, 20, 15, 10, 10, 8, 7, 5, 3, 2]

PRODUCTS = [
    # (name, price_min, price_max)
    ("Silk Kurta", 1200, 4500),
    ("Linen Co-ord Set", 2800, 6500),
    ("Embroidered Anarkali", 3500, 9000),
    ("Cotton Palazzo Set", 1500, 3200),
    ("Chanderi Saree", 4000, 12000),
    ("Block Print Kurta", 900, 2800),
    ("Chikankari Kurti", 1800, 5500),
    ("Bandhani Dupatta", 600, 2200),
    ("Kaftan Dress", 2200, 5000),
    ("Phulkari Jacket", 3200, 8000),
    ("Ikat Jumpsuit", 2500, 5500),
    ("Linen Shirt (Men)", 1200, 3500),
    ("Mandarin Collar Kurta", 1500, 4000),
    ("Nehru Jacket", 2800, 6500),
    ("Printed Dhoti Pants", 1200, 2800),
    ("Handwoven Stole", 800, 2500),
    ("Batik Midi Dress", 1800, 4200),
    ("Tussar Silk Blouse", 1500, 3800),
    ("Ajrakh Print Set", 3200, 7500),
    ("Georgette Sharara", 2500, 6000),
]

CHANNELS = ["whatsapp", "sms", "email", "rcs"]


def assign_tags(total_spend: float, order_count: int, last_order_date: datetime) -> list[str]:
    """Assign realistic CRM tags based on customer behaviour."""
    tags = []
    now = datetime.now(timezone.utc)

    if total_spend >= 20000:
        tags.append("vip")
    elif total_spend >= 8000:
        tags.append("high-value")

    days_since_last = (now - last_order_date).days if last_order_date else 999

    if days_since_last > 90:
        tags.append("at-risk" if total_spend > 3000 else "lapsed")

    if order_count <= 1:
        tags.append("new")
    elif order_count >= 5:
        tags.append("frequent-buyer")

    if order_count >= 3 and days_since_last <= 60:
        tags.append("loyal")

    return tags


def make_customer_profile() -> dict:
    """
    Generate a customer with realistic spend distribution:
      - 10% high-value  (₹15k–₹40k)
      - 25% mid-value   (₹5k–₹15k)
      - 40% low-value   (₹1k–₹5k)
      - 25% new/one-off (₹500–₹2k)
    """
    segment = random.choices(
        ["high", "mid", "low", "new"],
        weights=[10, 25, 40, 25],
    )[0]

    if segment == "high":
        num_orders = random.randint(5, 15)
        spend_range = (15000, 40000)
    elif segment == "mid":
        num_orders = random.randint(3, 8)
        spend_range = (5000, 15000)
    elif segment == "low":
        num_orders = random.randint(1, 4)
        spend_range = (1000, 5000)
    else:
        num_orders = 1
        spend_range = (500, 2000)

    return {
        "segment": segment,
        "num_orders": num_orders,
        "spend_range": spend_range,
    }


def make_order(customer_id: str, max_amount: float) -> dict:
    """Generate a single order with 1–3 items."""
    num_items = random.randint(1, 3)
    items = []
    total = 0.0

    for _ in range(num_items):
        product = random.choice(PRODUCTS)
        price = round(random.uniform(product[1], product[2]), 2)
        qty = 1
        items.append({"name": product[0], "qty": qty, "price": price})
        total += price * qty

    # Spread orders over last 18 months
    days_ago = random.randint(1, 540)
    created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)

    return {
        "customer_id": customer_id,
        "amount": round(total, 2),
        "items": items,
        "created_at": created_at,
    }


async def seed():
    print("🌱 Starting seed for Aura Styles & Co...")

    customers_data = []
    orders_data = []

    for i in range(500):
        profile = make_customer_profile()

        # Build orders first to compute spend/dates
        customer_id = f"temp_{i}"
        order_list = []
        total_spend = 0.0

        for _ in range(profile["num_orders"]):
            order = make_order(customer_id, profile["spend_range"][1])
            total_spend += order["amount"]
            order_list.append(order)

        # Sort orders by date for last_order_date accuracy
        order_list.sort(key=lambda o: o["created_at"])
        last_order_date = order_list[-1]["created_at"] if order_list else None

        tags = assign_tags(total_spend, profile["num_orders"], last_order_date)

        gender = random.choice(["male", "female"])
        name = fake.name_male() if gender == "male" else fake.name_female()

        customer = {
            "name": name,
            "email": fake.unique.email(),
            "phone": f"+91{random.randint(7000000000, 9999999999)}",
            "city": random.choices(CITIES, weights=CITY_WEIGHTS)[0],
            "total_spend": round(total_spend, 2),
            "order_count": profile["num_orders"],
            "last_order_date": last_order_date,
            "tags": tags,
            "created_at": (
                order_list[0]["created_at"] - timedelta(days=random.randint(1, 30))
                if order_list else datetime.now(timezone.utc) - timedelta(days=random.randint(30, 200))
            ),
        }

        customers_data.append((customer, order_list))

    print(f"  📦 Generated {len(customers_data)} customers in memory")

    async with AsyncSessionLocal() as session:
        # Clear existing seed data
        await session.execute(text("DELETE FROM communications"))
        await session.execute(text("DELETE FROM campaigns"))
        await session.execute(text("DELETE FROM orders"))
        await session.execute(text("DELETE FROM customers"))
        await session.commit()
        print("  🧹 Cleared existing data")

        # Insert customers and capture real UUIDs
        inserted_count = 0
        for customer_dict, order_list in customers_data:
            # Insert customer
            result = await session.execute(
                text("""
                    INSERT INTO customers (name, email, phone, city, total_spend, order_count,
                                          last_order_date, tags, created_at)
                    VALUES (:name, :email, :phone, :city, :total_spend, :order_count,
                            :last_order_date, :tags, :created_at)
                    RETURNING id
                """),
                {**customer_dict, "tags": customer_dict["tags"]},
            )
            real_id = result.scalar_one()

            # Insert orders with the real UUID
            for order in order_list:
                await session.execute(
                    text("""
                        INSERT INTO orders (customer_id, amount, items, created_at)
                        VALUES (:customer_id, :amount, CAST(:items AS jsonb), :created_at)
                    """),
                    {
                        "customer_id": str(real_id),
                        "amount": order["amount"],
                        "items": json.dumps(order["items"]),
                        "created_at": order["created_at"],
                    },
                )

            inserted_count += 1
            if inserted_count % 100 == 0:
                print(f"  ✅ Inserted {inserted_count}/500 customers...")
                await session.commit()

        await session.commit()

    # Print summary stats
    async with AsyncSessionLocal() as session:
        stats = await session.execute(text("""
            SELECT
                COUNT(*) AS customers,
                SUM(order_count) AS total_orders,
                ROUND(AVG(total_spend)::numeric, 2) AS avg_spend,
                COUNT(*) FILTER (WHERE 'vip' = ANY(tags)) AS vip,
                COUNT(*) FILTER (WHERE 'at-risk' = ANY(tags)) AS at_risk,
                COUNT(*) FILTER (WHERE 'lapsed' = ANY(tags)) AS lapsed,
                COUNT(*) FILTER (WHERE 'new' = ANY(tags)) AS new_customers
            FROM customers
        """))
        row = stats.mappings().one()
        print("\n📊 Seed Summary:")
        print(f"   Customers:    {row['customers']}")
        print(f"   Total orders: {row['total_orders']}")
        print(f"   Avg spend:    ₹{row['avg_spend']}")
        print(f"   VIP:          {row['vip']}")
        print(f"   At-risk:      {row['at_risk']}")
        print(f"   Lapsed:       {row['lapsed']}")
        print(f"   New:          {row['new_customers']}")
        print("\n✅ Seed complete! Aura Styles & Co is ready for demo.")


if __name__ == "__main__":
    asyncio.run(seed())
