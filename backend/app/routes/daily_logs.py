from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from app.db import logs_col
from app.models.models import DailyLogCreate, DailyLogUpdate

router = APIRouter(prefix="/api/daily-logs", tags=["daily-logs"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/{device_id}")
async def get_all_logs(device_id: str):
    cursor = logs_col().find({"device_id": device_id}).sort("date", -1)
    return [_serialize(l) async for l in cursor]


@router.get("/{device_id}/date/{date}")
async def get_log_by_date(device_id: str, date: str):
    doc = await logs_col().find_one({"device_id": device_id, "date": date})
    if not doc:
        return None
    return _serialize(doc)


@router.get("/{device_id}/task/{task_id}")
async def get_logs_for_task(device_id: str, task_id: str):
    cursor = logs_col().find({"device_id": device_id, "task_id": task_id}).sort("date", -1)
    return [_serialize(l) async for l in cursor]


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
