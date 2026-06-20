from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId
from typing import List

from app.db import tasks_col
from app.models.models import TaskCreate, TaskUpdate, TaskResponse

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/{device_id}")
async def get_all_tasks(device_id: str):
    cursor = tasks_col().find({"device_id": device_id}).sort([("week_num", 1), ("task_id", 1)])
    tasks = [_serialize(t) async for t in cursor]
    return tasks


@router.get("/{device_id}/week/{week_num}")
async def get_week_tasks(device_id: str, week_num: int):
    cursor = tasks_col().find({"device_id": device_id, "week_num": week_num}).sort("task_id", 1)
    tasks = [_serialize(t) async for t in cursor]
    return tasks


@router.post("/")
async def create_task(body: TaskCreate):
    now = _now()
    doc = {
        "device_id":     body.device_id,
        "week_num":      body.week_num,
        "task_id":       body.task_id,
        "title":         body.title,
        "detail":        body.detail,
        "done_criteria": body.done_criteria,
        "status":        "todo",
        "notes":         "",
        "subtasks":      [],
        "start_date":    body.start_date,
        "due_date":      body.due_date,
        "created_at":    now,
        "updated_at":    now,
    }
    result = await tasks_col().insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.patch("/{task_mongo_id}")
async def update_task(task_mongo_id: str, body: TaskUpdate):
    update_fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(400, "No fields to update")
    update_fields["updated_at"] = _now()
    result = await tasks_col().update_one(
        {"_id": ObjectId(task_mongo_id)},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Task not found")
    doc = await tasks_col().find_one({"_id": ObjectId(task_mongo_id)})
    return _serialize(doc)


@router.delete("/{task_mongo_id}")
async def delete_task(task_mongo_id: str):
    result = await tasks_col().delete_one({"_id": ObjectId(task_mongo_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Task not found")
    return {"deleted": task_mongo_id}


@router.patch("/{task_mongo_id}/subtasks")
async def set_subtasks(task_mongo_id: str, subtasks: List[str]):
    result = await tasks_col().update_one(
        {"_id": ObjectId(task_mongo_id)},
        {"$set": {"subtasks": subtasks, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Task not found")
    return {"subtasks": subtasks}
