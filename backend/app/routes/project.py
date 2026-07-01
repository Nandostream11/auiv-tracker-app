from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.db import projects_col, tasks_col, weeks_col
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
    Seeds project + tasks + the original 6 weeks for the device_id if
    not already present. Weeks are real DB documents (not hardcoded)
    so the user can later add Week 7+ via /api/weeks.
    Returns full charter + week structure.
    """
    device_id = body.device_id
    now = datetime.now(timezone.utc).isoformat()

    existing = await projects_col().find_one({"device_id": device_id})
    if not existing:
        await projects_col().insert_one({
            "device_id": device_id,
            "mission":   PROJECT_CHARTER["mission"],
            "name":      PROJECT_CHARTER["name"],
            "total_weeks": PROJECT_CHARTER["total_weeks"],
            "created_at": now,
        })

    task_count = await tasks_col().count_documents({"device_id": device_id})
    if task_count == 0:
        project_start = datetime.now(timezone.utc)

        docs = []
        week_docs = []
        for week in WEEKS_SEED:
            week_due = (project_start + timedelta(weeks=week["num"])).date().isoformat()
            week_start = (project_start + timedelta(weeks=week["num"] - 1)).date().isoformat()

            week_docs.append({
                "device_id": device_id,
                "num":       week["num"],
                "title":     week["title"],
                "hours":     week["hours"],
                "start_date": week_start,
                "due_date":   week_due,
                "agenda":     "",
                "is_custom":  False,
                "created_at": now,
                "updated_at": now,
            })

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
                    "start_date":   week_start,
                    "due_date":     week_due,
                    "created_at":   now,
                    "updated_at":   now,
                })
        await tasks_col().insert_many(docs)

        week_count = await weeks_col().count_documents({"device_id": device_id})
        if week_count == 0:
            await weeks_col().insert_many(week_docs)

    weeks = await weeks_col().find({"device_id": device_id}).sort("num", 1).to_list(length=None)
    weeks_out = [{"num": w["num"], "title": w["title"], "hours": w["hours"],
                  "start_date": w.get("start_date"), "due_date": w.get("due_date"),
                  "is_custom": w.get("is_custom", False)} for w in weeks]

    return {
        "device_id":   device_id,
        "charter":     PROJECT_CHARTER,
        "weeks":       weeks_out,
        "red_flags":   RED_FLAGS,
        "checklist_items": CHECKLIST_ITEMS,
    }


@router.get("/charter/{device_id}")
async def get_charter(device_id: str):
    proj = await projects_col().find_one({"device_id": device_id})
    if not proj:
        raise HTTPException(404, "Device not initialised — call /api/project/init first")

    weeks = await weeks_col().find({"device_id": device_id}).sort("num", 1).to_list(length=None)
    weeks_out = [{"num": w["num"], "title": w["title"], "hours": w["hours"],
                  "start_date": w.get("start_date"), "due_date": w.get("due_date"),
                  "is_custom": w.get("is_custom", False)} for w in weeks]

    return {
        "charter":   PROJECT_CHARTER,
        "weeks":     weeks_out,
        "red_flags": RED_FLAGS,
        "checklist_items": CHECKLIST_ITEMS,
    }
