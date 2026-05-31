from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.bid_rounds import router as rounds_router
from app.api.routes.buyer import router as buyer_router
from app.api.routes.exceptions import router as exceptions_router
from app.api.routes.deals import router as deals_router
from app.api.routes.nlquery import router as nlquery_router
from app.api.routes.inbound_email import router as inbound_email_router
from app.api.routes.notifications import router as notifications_router
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="ThinkTLS Bid Desk API", version="1.0.0", lifespan=lifespan)

import os as _os

_frontend_url = _os.environ.get("FRONTEND_URL", "http://localhost:3000")
_cors_origins = list({
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    _frontend_url,
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(rounds_router, prefix="/api")
app.include_router(buyer_router, prefix="/api")
app.include_router(exceptions_router, prefix="/api")
app.include_router(deals_router, prefix="/api")
app.include_router(nlquery_router, prefix="/api")
app.include_router(inbound_email_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ThinkTLS Bid Desk"}


