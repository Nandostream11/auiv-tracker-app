from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from app.db import logs_col, jobs_col
from app.models.models import DailyLogCreate, DailyLogUpdate

router = APIRouter(prefix="/api/daily-logs", tags=["daily-logs"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _enrich_with_job_status(logs: list) -> list:
    """
    For every log that has no completed ai_eval, look up whether there's
    a matching job in ai_jobs and attach its status. This is the ONLY
    place the frontend should need to look to know whether an eval is:
      - completed (ai_eval is populated, eval_status='completed')
      - pending/running (queued for retry, eval_status='pending'/'running')
      - failed (exhausted all retries, eval_status='failed')
      - never_attempted (no log, no job — e.g. submitted with no API key)

    Without this, a log with ai_eval=None is structurally indistinguishable
    from "still queued", "permanently failed", or "no key was ever set" —
    which was the root cause of evals appearing to silently vanish.
    """
    if not logs:
        return logs

    device_id = logs[0]["device_id"]
    log_ids = [l["id"] for l in logs]

    cursor = jobs_col().find({"device_id": device_id, "log_id": {"$in": log_ids}})
    jobs_by_log_id = {}
    async for job in cursor:
        # If multiple jobs exist for the same log (shouldn't normally happen,
        # but defensively), prefer the most recently updated one.
        existing = jobs_by_log_id.get(job["log_id"])
        if not existing or job["updated_at"] > existing["updated_at"]:
            jobs_by_log_id[job["log_id"]] = job

    for log in logs:
        if log.get("ai_eval"):
            log["eval_status"] = "completed"
            continue

        job = jobs_by_log_id.get(log["id"])
        if job:
            log["eval_status"]   = job["status"]          # pending | running | failed
            log["eval_error"]    = job.get("error")
            log["eval_retry_at"] = job.get("next_retry_at")
            log["eval_retries"]  = job.get("retry_count", 0)
        else:
            log["eval_status"] = "never_attempted"

    return logs


@router.get("/{device_id}")
async def get_all_logs(device_id: str):
    cursor = logs_col().find({"device_id": device_id}).sort("date", -1)
    logs = [_serialize(l) async for l in cursor]
    return await _enrich_with_job_status(logs)


@router.get("/{device_id}/date/{date}")
async def get_log_by_date(device_id: str, date: str):
    doc = await logs_col().find_one({"device_id": device_id, "date": date})
    if not doc:
        return None
    serialized = _serialize(doc)
    enriched = await _enrich_with_job_status([serialized])
    return enriched[0]


@router.get("/{device_id}/task/{task_id}")
async def get_logs_for_task(device_id: str, task_id: str):
    cursor = logs_col().find({"device_id": device_id, "task_id": task_id}).sort("date", -1)
    logs = [_serialize(l) async for l in cursor]
    return await _enrich_with_job_status(logs)


@router.post("/")
async def create_or_update_log(body: DailyLogCreate):
    """Upsert by (device_id, date) — one log per day."""
    now = _now()
    existing = await logs_col().find_one({"device_id": body.device_id, "date": body.date})
    if existing:
        await logs_col().update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "task_id":      body.task_id,
                "week_num":     body.week_num,
                "checks":       body.checks,
                "blocker":      body.blocker or "",
                "next_action":  body.next_action or "",
                "tomorrow_task": body.tomorrow_task or "",
                "updated_at":   now,
            }}
        )
        doc = await logs_col().find_one({"_id": existing["_id"]})
        return _serialize(doc)
    else:
        doc = {
            "device_id":    body.device_id,
            "date":         body.date,
            "task_id":      body.task_id,
            "week_num":     body.week_num,
            "checks":       body.checks,
            "blocker":      body.blocker or "",
            "next_action":  body.next_action or "",
            "tomorrow_task": body.tomorrow_task or "",
            "ai_eval":      None,
            "created_at":   now,
            "updated_at":   now,
        }
        result = await logs_col().insert_one(doc)
        doc["id"] = str(result.inserted_id)
        doc.pop("_id", None)
        return doc


@router.patch("/{log_id}")
async def update_log(log_id: str, body: DailyLogUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    fields["updated_at"] = _now()
    result = await logs_col().update_one({"_id": ObjectId(log_id)}, {"$set": fields})
    if result.matched_count == 0:
        raise HTTPException(404, "Log not found")
    doc = await logs_col().find_one({"_id": ObjectId(log_id)})
    return _serialize(doc)


@router.delete("/{log_id}")
async def delete_log(log_id: str):
    result = await logs_col().delete_one({"_id": ObjectId(log_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Log not found")
    return {"deleted": log_id}
