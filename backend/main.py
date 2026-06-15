from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import customers, campaigns, receipts, copilot

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    print("[START] Xeno Mini CRM backend starting...")
    yield
    print("[STOP] Xeno Mini CRM backend shutting down.")


app = FastAPI(
    title="Xeno Mini CRM",
    description="AI-native CRM for reaching shoppers — by Aura Styles & Co",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "https://xeno-mini-crm-mvp.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(customers.router)
app.include_router(customers.orders_router)
app.include_router(campaigns.router)
app.include_router(receipts.router)
app.include_router(copilot.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "xeno-crm-backend"}
