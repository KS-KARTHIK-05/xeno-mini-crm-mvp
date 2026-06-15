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


from fastapi.responses import JSONResponse

app = FastAPI(
    title="Xeno Mini CRM",
    description="AI-native CRM for reaching shoppers — by Aura Styles & Co",
    version="1.0.0",
    lifespan=lifespan,
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    import logging
    from app.config import get_settings
    
    db_url = get_settings().database_url
    try:
        if "@" in db_url:
            parts = db_url.split("@")
            prefix = parts[0]
            suffix = "@".join(parts[1:])
            if ":" in prefix:
                subparts = prefix.split(":")
                prefix = ":".join(subparts[:-1]) + ":***"
            db_url = f"{prefix}@{suffix}"
    except Exception:
        pass

    logging.getLogger("fastapi").exception(exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": exc.__class__.__name__,
            "message": str(exc),
            "database_url": db_url,
            "traceback": traceback.format_exception(type(exc), exc, exc.__traceback__)
        }
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
