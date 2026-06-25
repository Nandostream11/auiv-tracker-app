"""
AI routes — evaluate, suggest-subtasks, job status polling.

POST /api/ai/evaluate
  → tries Claude immediately
  → 200 {result} on success
  → 202 {job_id, status:"pending", next_retry_at} on timeout/error

POST /api/ai/suggest-subtasks
  → same pattern

GET /api/ai/jobs/{device_id}
  → returns all jobs (optionally filtered by status, since)

GET /api/ai/jobs/{device_id}/{job_id}
  → single job status (for polling)
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
import httpx

from app.db import jobs_col
from app.models.models import (
    EvaluateRequest, SubtaskRequest, WeekPlanRequest,
)
from app.services.ai_service import attempt_evaluation, AIJobQueued

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _serialize_job(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    doc.pop("api_key", None)   # never expose the key in responses
    return doc


# ── Test key ──────────────────────────────────────────────────────────────

@router.post("/test-key")
async def test_key(body: dict):
    """
    Server-side proxy to validate an API key — works for Anthropic,
    Gemini (Google AI Studio), and OpenRouter free-tier keys, auto-detected
    by prefix. Phones cannot reliably call provider APIs directly (CORS /
    mobile HTTP client restrictions on some Android/iOS network configs),
    so we proxy the test call through our own backend and return the REAL
    error message instead of a generic 'invalid key or network error'.

    Deliberately does NOT reuse _call_llm() from ai_service — that function
    expects the model to return parseable JSON matching our eval schema,
    which a simple "ping" test won't satisfy. This just checks auth.
    """
    from app.services.ai_service import detect_provider

    api_key = body.get("api_key", "").strip()
    if not api_key:
        return {"valid": False, "message": "No API key provided", "provider": None}

    provider = detect_provider(api_key)
    provider_labels = {
        "gemini":     "Gemini (free tier)",
        "openrouter": "OpenRouter (free tier)",
        "anthropic":  "Claude",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if provider == "gemini":
                resp = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                    json={
                        "contents": [{"parts": [{"text": "ping"}]}],
                        "generationConfig": {"maxOutputTokens": 5},
                    },
                )
            elif provider == "openrouter":
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                    json={
                        "model": "openrouter/free",
                        "max_tokens": 5,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
            else:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": "claude-sonnet-4-20250514",
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
    except httpx.TimeoutException:
        return {"valid": False, "message": f"Request to {provider} timed out. Try again.", "provider": provider}
    except Exception as e:
        return {"valid": False, "message": f"Network error reaching {provider}: {e}", "provider": provider}

    if resp.status_code == 200:
        label = provider_labels.get(provider, provider)
        return {"valid": True, "message": f"Key is valid — {label}", "provider": provider}

    try:
        err_body = resp.json()
        err_msg = err_body.get("error", {}).get("message", f"HTTP {resp.status_code}")
    except Exception:
        err_msg = f"HTTP {resp.status_code}"

    return {"valid": False, "message": err_msg, "provider": provider}


# ── Evaluate ──────────────────────────────────────────────────────────────

@router.post("/evaluate")
async def evaluate_standup(body: EvaluateRequest):
    """
    Attempts Claude immediately.
    Returns 200 {result} on success.
    Returns 202 {job_id, status, next_retry_at, message} on timeout/error.
    """
    payload = {
        "task_title":     body.task_title,
        "done_criteria":  body.done_criteria,
        "checks":         body.checks,
        "blocker":        body.blocker or "",
        "next_action":    body.next_action or "",
        "tomorrow_task":  body.tomorrow_task or "",
        "previous_notes": body.previous_notes or "",
        "week_num":       body.week_num,
        "task_due_date":  body.task_due_date,
    }

    # log_id comes from the saved daily log — passed in device_id field here
    # We store it separately: the client should send the log mongo id
    log_id = getattr(body, "log_id", "") or ""

    try:
        result = await attempt_evaluation(
            device_id=body.device_id,
            log_id=log_id,
            api_key=body.api_key,
            payload=payload,
            job_type="evaluate",
        )
        return {"status": "completed", "result": result}

    except AIJobQueued as jq:
        # Fetch the created job for response metadata
        job = await jobs_col().find_one({"_id": ObjectId(jq.job_id)})
        from app.services.ai_service import detect_provider
        provider_label = {"gemini": "Gemini", "openrouter": "OpenRouter", "anthropic": "Claude"}.get(
            detect_provider(body.api_key), "AI provider"
        )
        return JSONResponse(
            status_code=202,
            content={
                "status":        "pending",
                "job_id":        jq.job_id,
                "next_retry_at": job["next_retry_at"] if job else None,
                "retry_hours":   5,
                "message":       f"{provider_label} unavailable ({jq.reason}). Eval queued — will retry in 5 hours.",
            },
        )


# ── Suggest subtasks ──────────────────────────────────────────────────────

@router.post("/suggest-subtasks")
async def suggest_subtasks(body: SubtaskRequest):
    payload = {
        "task_id":       body.task_id,
        "task_title":    body.task_title,
        "done_criteria": body.done_criteria,
        "current_notes": body.current_notes or "",
    }

    log_id = getattr(body, "log_id", "") or ""

    try:
        result = await attempt_evaluation(
            device_id=body.device_id,
            log_id=log_id,
            api_key=body.api_key,
            payload=payload,
            job_type="suggest_subtasks",
        )
        return {"status": "completed", "result": result}

    except AIJobQueued as jq:
        job = await jobs_col().find_one({"_id": ObjectId(jq.job_id)})
        from app.services.ai_service import detect_provider
        provider_label = {"gemini": "Gemini", "openrouter": "OpenRouter", "anthropic": "Claude"}.get(
            detect_provider(body.api_key), "AI provider"
        )
        return JSONResponse(
            status_code=202,
            content={
                "status":        "pending",
                "job_id":        jq.job_id,
                "next_retry_at": job["next_retry_at"] if job else None,
                "retry_hours":   5,
                "message":       f"{provider_label} unavailable ({jq.reason}). Subtask suggestions queued — will retry in 5 hours.",
            },
        )


# ── Week plan ─────────────────────────────────────────────────────────────

@router.post("/suggest-week-plan")
async def suggest_week_plan(body: WeekPlanRequest):
    """
    AI triage for an entire sprint week — looks at every task's status
    and due date, the week's red-flag scope-cut trigger (if any), and
    days remaining, then returns what to focus on today, what's at risk,
    and sequencing advice. Same immediate-attempt + 5h-retry-queue
    pattern as /evaluate and /suggest-subtasks.
    """
    payload = {
        "week_num":   body.week_num,
        "week_title": body.week_title,
        "tasks":      [t.model_dump() for t in body.tasks],
    }

    try:
        result = await attempt_evaluation(
            device_id=body.device_id,
            log_id="",
            api_key=body.api_key,
            payload=payload,
            job_type="week_plan",
        )
        return {"status": "completed", "result": result}

    except AIJobQueued as jq:
        job = await jobs_col().find_one({"_id": ObjectId(jq.job_id)})
        return JSONResponse(
            status_code=202,
            content={
                "status":        "pending",
                "job_id":        jq.job_id,
                "next_retry_at": job["next_retry_at"] if job else None,
                "retry_hours":   5,
                "message":       "AI unavailable. Week plan queued — will retry in 5 hours.",
            },
        )


# ── Job polling ───────────────────────────────────────────────────────────

@router.get("/jobs/{device_id}")
async def list_jobs(
    device_id: str,
    status: Optional[str] = Query(None, description="pending | running | completed | failed"),
    since: Optional[str]  = Query(None, description="ISO datetime — only jobs updated after this"),
    limit: int            = Query(50, le=200),
):
    """
    Poll for job updates. Typical frontend call:
      GET /api/ai/jobs/{device_id}?status=completed&since=2024-01-01T00:00:00Z
    """
    query: dict = {"device_id": device_id}
    if status:
        query["status"] = status
    if since:
        query["updated_at"] = {"$gte": since}

    cursor = jobs_col().find(query).sort("updated_at", -1).limit(limit)
    jobs   = [_serialize_job(j) async for j in cursor]
    return jobs


@router.get("/jobs/{device_id}/{job_id}")
async def get_job(device_id: str, job_id: str):
    """Single job status — use for targeted polling after a 202 response."""
    try:
        doc = await jobs_col().find_one({
            "_id":       ObjectId(job_id),
            "device_id": device_id,
        })
    except Exception:
        raise HTTPException(400, "Invalid job_id")

    if not doc:
        raise HTTPException(404, "Job not found")

    return _serialize_job(doc)


@router.delete("/jobs/{device_id}/{job_id}")
async def cancel_job(device_id: str, job_id: str):
    """Cancel a pending job (e.g. user revoked API key)."""
    try:
        result = await jobs_col().update_one(
            {"_id": ObjectId(job_id), "device_id": device_id, "status": "pending"},
            {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception:
        raise HTTPException(400, "Invalid job_id")

    if result.matched_count == 0:
        raise HTTPException(404, "Pending job not found")
    return {"cancelled": job_id}
