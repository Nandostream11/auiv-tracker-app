import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import connect_db, close_db
from app.routes import project, tasks, daily_logs, ai, weeks
from app.services.ai_service import run_pending_retries

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()

    # ── Retry scheduler ────────────────────────────────────────────────
    # Runs every 5 minutes to pick up any pending AI jobs.
    # A job only fires when next_retry_at <= now (set to now+5h at creation),
    # so the actual retry cadence is 5 hours — this tight poll interval
    # just ensures we don't miss the window.
    scheduler.add_job(
        run_pending_retries,
        trigger="interval",
        minutes=5,
        id="ai_retry_loop",
        max_instances=1,          # never overlap
        misfire_grace_time=60,
    )
    scheduler.start()
    logger.info("APScheduler started — AI retry loop active (checks every 5 min, retries every 5 h)")

    yield

    scheduler.shutdown(wait=False)
    await close_db()


app = FastAPI(
    title="AUIV Tracker API",
    description="Sprint tracker with persistent AI job queue",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project.router)
app.include_router(tasks.router)
app.include_router(daily_logs.router)
app.include_router(ai.router)
app.include_router(weeks.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "auiv-tracker-api",
        "scheduler": scheduler.running,
    }
