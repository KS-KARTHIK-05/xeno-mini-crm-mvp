import uuid
from typing import Optional, List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db
from app.models import Customer, Order
from app.schemas import CustomerOut, CustomerListOut, OrderOut

router = APIRouter(prefix="/api/customers", tags=["customers"])
orders_router = APIRouter(prefix="/api/orders", tags=["orders"])


# ── Orders CSV Import ─────────────────────────────────────────────────────────

class OrderImportRow(BaseModel):
    customer_id: str
    amount: float
    items: Any = []
    created_at: Optional[str] = None

class BulkOrderImportBody(BaseModel):
    orders: List[OrderImportRow]

@orders_router.post("/import")
async def import_orders(body: BulkOrderImportBody, db: AsyncSession = Depends(get_db)):
    """Bulk-insert orders from a CSV import. Skips rows with invalid customer_id."""
    if not body.orders:
        raise HTTPException(status_code=400, detail="No order rows provided")

    from datetime import timezone as tz
    import json

    # Pre-fetch all valid customer IDs to avoid FK violations
    incoming_cids = list({o.customer_id for o in body.orders})
    result = await db.execute(
        select(Customer.id).where(Customer.id.in_(incoming_cids))
    )
    valid_cids = {str(row[0]) for row in result.fetchall()}

    inserted = 0
    skipped = 0

    for o in body.orders:
        if o.customer_id not in valid_cids:
            skipped += 1
            continue

        try:
            ts = datetime.fromisoformat(o.created_at.replace('Z', '+00:00')) if o.created_at else datetime.now(tz.utc)
        except Exception:
            ts = datetime.now(tz.utc)

        parsed_items = o.items
        if isinstance(parsed_items, str):
            try:
                parsed_items = json.loads(parsed_items)
            except Exception:
                parsed_items = []

        if not isinstance(parsed_items, list):
            if isinstance(parsed_items, dict):
                parsed_items = [parsed_items]
            else:
                parsed_items = []

        order = Order(
            id=uuid.uuid4(),
            customer_id=o.customer_id,
            amount=o.amount,
            items=parsed_items,
            created_at=ts,
        )
        db.add(order)
        inserted += 1

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    return {
        "status": "success",
        "inserted": inserted,
        "skipped": skipped,
        "total": len(body.orders)
    }


# ── CSV Import schema ─────────────────────────────────────────────────────────

class CustomerImportRow(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    city: Optional[str] = None
    total_spend: float = 0
    order_count: int = 0
    tags: List[str] = []

class BulkImportBody(BaseModel):
    customers: List[CustomerImportRow]

@router.post("/import")
async def import_customers(body: BulkImportBody, db: AsyncSession = Depends(get_db)):
    """
    Bulk-insert customers from a CSV import.
    Duplicate emails (by unique constraint) are silently skipped.
    Returns counts of inserted and skipped rows.
    """
    if not body.customers:
        raise HTTPException(status_code=400, detail="No customer rows provided")

    rows = [
        {
            "id":           uuid.uuid4(),
            "name":         c.name,
            "email":        c.email.strip().lower(),
            "phone":        c.phone,
            "city":         c.city,
            "total_spend":  c.total_spend,
            "order_count":  c.order_count,
            "tags":         c.tags,
        }
        for c in body.customers
    ]

    stmt = pg_insert(Customer).values(rows).on_conflict_do_nothing(index_elements=["email"])
    result = await db.execute(stmt)
    await db.commit()

    inserted = result.rowcount if result.rowcount != -1 else len(rows)
    skipped  = len(rows) - inserted

    return {"inserted": inserted, "skipped": skipped, "total": len(rows)}



@router.get("", response_model=CustomerListOut)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    city: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List customers with optional filtering and pagination."""
    q = select(Customer)

    if city:
        q = q.where(Customer.city == city)
    if tag:
        from sqlalchemy import bindparam, text as sa_text
        pname = f"t_{abs(hash(tag)) % 99999}"
        q = q.where(sa_text(f":{pname} = ANY(customers.tags)").bindparams(**{pname: str(tag)}))
    if search:
        q = q.where(Customer.name.ilike(f"%{search}%"))

    # Total count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Paginated results
    q = q.order_by(Customer.total_spend.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    customers = result.scalars().all()

    return CustomerListOut(
        customers=[CustomerOut.model_validate(c) for c in customers],
        total=total,
    )


@router.get("/stats")
async def customer_stats(db: AsyncSession = Depends(get_db)):
    """High-level customer base stats for the dashboard."""
    stats = await db.execute(text("""
        SELECT
            COUNT(*)                                                    AS total_customers,
            ROUND(AVG(total_spend)::numeric, 2)                        AS avg_spend,
            SUM(total_spend)                                            AS total_revenue,
            COUNT(*) FILTER (WHERE 'vip' = ANY(tags))                  AS vip_count,
            COUNT(*) FILTER (WHERE 'at-risk' = ANY(tags))              AS at_risk_count,
            COUNT(*) FILTER (WHERE last_order_date < NOW() - INTERVAL '90 days'
                             OR last_order_date IS NULL)                AS lapsed_count
        FROM customers
    """))
    row = stats.mappings().one()
    return dict(row)


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single customer by ID."""
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerOut.model_validate(customer)


@router.get("/{customer_id}/orders", response_model=list[OrderOut])
async def get_customer_orders(customer_id: str, db: AsyncSession = Depends(get_db)):
    """Get all orders for a customer."""
    result = await db.execute(
        select(Order)
        .where(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    return [OrderOut.model_validate(o) for o in orders]
