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
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
import httpx

from app.db import jobs_col
from app.models.models import (
    EvaluateRequest, SubtaskRequest,
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
    Server-side proxy to validate an Anthropic API key.
    Phones cannot reliably call api.anthropic.com directly (CORS / mobile
    HTTP client restrictions on some Android/iOS network configs), so we
    proxy the test call through our own backend and return the REAL
    error message instead of a generic 'invalid key or network error'.
    """
    api_key = body.get("api_key", "").strip()
    if not api_key:
        return {"valid": False, "message": "No API key provided"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
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
        return {"valid": False, "message": "Request to Anthropic timed out. Try again."}
    except Exception as e:
        return {"valid": False, "message": f"Network error reaching Anthropic: {e}"}

    if resp.status_code == 200:
        return {"valid": True, "message": "Key is valid"}

    try:
        err_body = resp.json()
        err_msg = err_body.get("error", {}).get("message", f"HTTP {resp.status_code}")
    except Exception:
        err_msg = f"HTTP {resp.status_code}"

    return {"valid": False, "message": err_msg}


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
        return {
            "status":        "pending",
            "job_id":        jq.job_id,
            "next_retry_at": job["next_retry_at"] if job else None,
            "retry_hours":   5,
            "message":       f"Claude unavailable ({jq.reason}). Eval queued — will retry in 5 hours.",
        }, 202


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
        return {
            "status":        "pending",
            "job_id":        jq.job_id,
            "next_retry_at": job["next_retry_at"] if job else None,
            "retry_hours":   5,
            "message":       "Claude unavailable. Subtask suggestions queued — will retry in 5 hours.",
        }, 202


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
