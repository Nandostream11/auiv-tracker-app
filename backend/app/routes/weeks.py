"""
weeks.py — CRUD for sprint weeks.

The original 6 weeks are seeded automatically on /api/project/init.
This router lets the user extend beyond 6 weeks (e.g. the sprint ran
long and needs a Week 7), or edit/delete weeks they've added themselves.
The original 6 seeded weeks are marked is_custom=False and protected
from deletion to avoid silently breaking the hardcoded red-flag/seed
data that's keyed to weeks 1-6.
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.db import weeks_col, tasks_col
from app.models.models import WeekCreate, WeekUpdate

router = APIRouter(prefix="/api/weeks", tags=["weeks"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/{device_id}")
async def get_all_weeks(device_id: str):
    cursor = weeks_col().find({"device_id": device_id}).sort("num", 1)
    return [_serialize(w) async for w in cursor]


@router.post("/")
async def create_week(body: WeekCreate):
    """
    Adds a new week after the highest-numbered existing week for this
    device — e.g. if weeks 1-6 exist, this creates week 7. Defaults
    start_date to the day after the previous week's due_date, and
    due_date to 7 days after that, if not explicitly provided.
    """
    existing = await weeks_col().find(
        {"device_id": body.device_id}
    ).sort("num", -1).to_list(length=1)

    next_num = (existing[0]["num"] + 1) if existing else 1
    now = _now()

    start_date = body.start_date
    due_date = body.due_date

    if not start_date:
        if existing and existing[0].get("due_date"):
            prev_due = datetime.fromisoformat(existing[0]["due_date"])
            start_date = (prev_due + timedelta(days=1)).date().isoformat()
        else:
            start_date = datetime.now(timezone.utc).date().isoformat()

    if not due_date:
        start_dt = datetime.fromisoformat(start_date)
        due_date = (start_dt + timedelta(days=7)).date().isoformat()

    doc = {
        "device_id":  body.device_id,
        "num":        next_num,
        "title":      body.title,
        "hours":      body.hours or 0,
        "start_date": start_date,
        "due_date":   due_date,
        "is_custom":  True,
        "created_at": now,
        "updated_at": now,
    }
    result = await weeks_col().insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.patch("/{week_id}")
async def update_week(week_id: str, body: WeekUpdate):
    update_fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(400, "No fields to update")
    update_fields["updated_at"] = _now()

    result = await weeks_col().update_one(
        {"_id": ObjectId(week_id)},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Week not found")

    doc = await weeks_col().find_one({"_id": ObjectId(week_id)})
    return _serialize(doc)


@router.delete("/{week_id}")
async def delete_week(week_id: str):
    week = await weeks_col().find_one({"_id": ObjectId(week_id)})
    if not week:
        raise HTTPException(404, "Week not found")

    if not week.get("is_custom", False):
        raise HTTPException(
            400,
            "Cannot delete one of the original 6 sprint weeks. "
            "Only weeks you've added yourself (Week 7+) can be deleted."
        )

    task_count = await tasks_col().count_documents({
        "device_id": week["device_id"], "week_num": week["num"]
    })
    if task_count > 0:
        raise HTTPException(
            400,
            f"This week has {task_count} task(s). Delete or reassign them first."
        )

    await weeks_col().delete_one({"_id": ObjectId(week_id)})
    return {"deleted": week_id}
