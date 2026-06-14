from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from app.db import projects_col, tasks_col
from app.models.models import ProjectInit, ProjectResponse
from app.models.seed_data import PROJECT_CHARTER, WEEKS_SEED, RED_FLAGS, CHECKLIST_ITEMS

router = APIRouter(prefix="/api/project", tags=["project"])


def _fmt_id(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post("/init")
async def init_project(body: ProjectInit):
    """
    Idempotent — safe to call on every app launch.
    Seeds project + 34 tasks for the device_id if not already present.
    Returns full charter + week structure.
    """
    device_id = body.device_id
    now = datetime.now(timezone.utc).isoformat()

    # Upsert project document
    existing = await projects_col().find_one({"device_id": device_id})
    if not existing:
        await projects_col().insert_one({
            "device_id": device_id,
            "mission":   PROJECT_CHARTER["mission"],
            "name":      PROJECT_CHARTER["name"],
            "total_weeks": PROJECT_CHARTER["total_weeks"],
            "created_at": now,
        })

    # Seed tasks only if none exist for this device
    task_count = await tasks_col().count_documents({"device_id": device_id})
    if task_count == 0:
        docs = []
        for week in WEEKS_SEED:
            for t in week["tasks"]:
                docs.append({
                    "device_id":    device_id,
                    "week_num":     week["num"],
                    "week_title":   week["title"],
                    "week_hours":   week["hours"],
                    "task_id":      t["task_id"],
                    "title":        t["title"],
                    "detail":       t["detail"],
                    "done_criteria": t["done_criteria"],
                    "status":       "todo",
                    "notes":        "",
                    "subtasks":     [],
                    "created_at":   now,
                    "updated_at":   now,
                })
        await tasks_col().insert_many(docs)

    return {
        "device_id":   device_id,
        "charter":     PROJECT_CHARTER,
        "weeks":       [{"num": w["num"], "title": w["title"], "hours": w["hours"]} for w in WEEKS_SEED],
        "red_flags":   RED_FLAGS,
        "checklist_items": CHECKLIST_ITEMS,
    }


@router.get("/charter/{device_id}")
async def get_charter(device_id: str):
    proj = await projects_col().find_one({"device_id": device_id})
    if not proj:
        raise HTTPException(404, "Device not initialised — call /api/project/init first")
    return {
        "charter":   PROJECT_CHARTER,
        "weeks":     [{"num": w["num"], "title": w["title"], "hours": w["hours"]} for w in WEEKS_SEED],
        "red_flags": RED_FLAGS,
        "checklist_items": CHECKLIST_ITEMS,
    }
