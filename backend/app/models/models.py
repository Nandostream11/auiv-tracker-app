from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Project / Charter ──────────────────────────────────────────────────────
class ProjectInit(BaseModel):
    device_id: str


class ProjectResponse(BaseModel):
    device_id: str
    mission: str
    total_weeks: int
    created_at: str


# ── Task ──────────────────────────────────────────────────────────────────
class TaskCreate(BaseModel):
    device_id: str
    week_num: int
    task_id: str          # e.g. "1.1"
    title: str
    detail: str
    done_criteria: str
    start_date: Optional[str] = None   # ISO date "YYYY-MM-DD"
    due_date: Optional[str] = None     # ISO date "YYYY-MM-DD"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    detail: Optional[str] = None
    done_criteria: Optional[str] = None
    status: Optional[str] = None   # todo | inprogress | done | blocked
    notes: Optional[str] = None
    start_date: Optional[str] = None   # ISO date "YYYY-MM-DD"
    due_date: Optional[str] = None     # ISO date "YYYY-MM-DD"


class TaskResponse(BaseModel):
    id: str
    device_id: str
    week_num: int
    task_id: str
    title: str
    detail: str
    done_criteria: str
    status: str
    notes: str
    subtasks: List[str]
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    created_at: str
    updated_at: str


# ── Daily Log ────────────────────────────────────────────────────────────
class ChecklistItem(BaseModel):
    id: str
    checked: bool


class DailyLogCreate(BaseModel):
    device_id: str
    date: str           # YYYY-MM-DD
    task_id: str        # references task_id field e.g. "1.1"
    week_num: int
    checks: Dict[str, bool]
    blocker: Optional[str] = ""
    next_action: Optional[str] = ""
    tomorrow_task: Optional[str] = ""


class DailyLogUpdate(BaseModel):
    checks: Optional[Dict[str, bool]] = None
    blocker: Optional[str] = None
    next_action: Optional[str] = None
    tomorrow_task: Optional[str] = None
    ai_eval: Optional[Dict[str, Any]] = None


class DailyLogResponse(BaseModel):
    id: str
    device_id: str
    date: str
    task_id: str
    week_num: int
    checks: Dict[str, bool]
    blocker: str
    next_action: str
    tomorrow_task: str
    ai_eval: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str


# ── AI ───────────────────────────────────────────────────────────────────
class EvaluateRequest(BaseModel):
    device_id: str
    log_id: Optional[str] = ""          # mongo _id of the saved daily_log
    api_key: str
    task_title: str
    done_criteria: str
    checks: Dict[str, bool]
    blocker: Optional[str] = ""
    next_action: Optional[str] = ""
    tomorrow_task: Optional[str] = ""
    previous_notes: Optional[str] = ""
    week_num: Optional[int] = None      # which sprint week this task belongs to
    task_due_date: Optional[str] = None # ISO date — lets the AI flag overdue tasks


class EvaluateResponse(BaseModel):
    completion_pct: int
    momentum: str       # strong | ok | at_risk
    remaining: List[str]
    blocker_assessment: str  # clear | vague | none
    top_concern: str
    green_signals: List[str]


class SubtaskRequest(BaseModel):
    device_id: str
    log_id: Optional[str] = ""          # optional — used to link subtask job back to a log
    api_key: str
    task_id: str
    task_title: str
    done_criteria: str
    current_notes: Optional[str] = ""


class SubtaskResponse(BaseModel):
    subtasks: List[str]


# ── AI Job (persistent retry queue) ──────────────────────────────────────
class AIJobCreate(BaseModel):
    device_id: str
    log_id: str                        # daily_log._id as str
    job_type: str                      # "evaluate" | "suggest_subtasks"
    api_key: str                       # stored encrypted-at-rest would be ideal; plain for MVP
    payload: Dict[str, Any]           # full prompt payload, re-used on retry
    max_retries: int = 5
    retry_interval_hours: int = 5


class AIJobResponse(BaseModel):
    id: str
    device_id: str
    log_id: str
    job_type: str
    status: str                        # pending | running | completed | failed
    result: Optional[Dict[str, Any]]
    error: Optional[str]
    retry_count: int
    next_retry_at: Optional[str]
    created_at: str
    updated_at: str


# ── Key test ───────────────────────────────────────────────────────────────
class TestKeyRequest(BaseModel):
    api_key: str


class TestKeyResponse(BaseModel):
    valid: bool
    message: str
