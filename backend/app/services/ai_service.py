"""
ai_service.py — Persistent AI job queue with 5-hour retry.

Flow:
  1. Frontend calls POST /api/ai/evaluate
  2. We attempt Claude immediately (30s timeout)
  3. On success  → write result to daily_log + return 200
  4. On timeout/error → create ai_jobs doc (status=pending), return 202
  5. APScheduler runs _retry_loop() every 5 min, picks up jobs whose
     next_retry_at <= now, attempts Claude again
  6. On retry success → write result to daily_log, mark job completed
  7. Frontend polls GET /api/ai/jobs/{device_id}?status=completed&since=<iso>
     and hydrates the store
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

import httpx
from bson import ObjectId

from app.db import jobs_col, logs_col, projects_col
from app.models.seed_data import CHECKLIST_ITEMS, RED_FLAGS

logger = logging.getLogger("ai_service")

ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages"
GEMINI_URL      = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENROUTER_URL  = "https://openrouter.ai/api/v1/chat/completions"
CLAUDE_MODEL    = "claude-sonnet-4-20250514"
GEMINI_MODEL    = "gemini-2.5-flash"
OPENROUTER_MODEL = "openrouter/free"
TIMEOUT_S       = 28          # slightly under 30 so we catch it cleanly
RETRY_HOURS     = 5
MAX_RETRIES     = 5


def detect_provider(api_key: str) -> str:
    """
    Anthropic keys start with 'sk-ant-'.
    Gemini (Google AI Studio) keys start with 'AIza'.
    OpenRouter keys start with 'sk-or-v1-'.
    Defaults to anthropic if the format is unrecognized, since that was
    the original/only supported provider.
    """
    key = (api_key or "").strip()
    if key.startswith("AIza"):
        return "gemini"
    if key.startswith("sk-or-v1-"):
        return "openrouter"
    return "anthropic"


# ── Prompt builders ───────────────────────────────────────────────────────

async def _get_sprint_context(device_id: str, week_num: Optional[int], task_due_date: Optional[str]) -> str:
    """
    Builds a short block of sprint-position context the AI eval can use to
    give genuinely situational advice instead of generic encouragement —
    e.g. "you have 2 days left in Week 3 and the red-flag trigger for
    this week is X" instead of just "good progress, keep going."

    Returns an empty string if project start date or week_num is unavailable,
    so this degrades gracefully rather than failing the whole eval.
    """
    if not week_num:
        return ""

    proj = await projects_col().find_one({"device_id": device_id})
    if not proj or not proj.get("created_at"):
        return ""

    try:
        project_start = datetime.fromisoformat(proj["created_at"])
    except Exception:
        return ""

    now = datetime.now(timezone.utc)
    week_end = project_start + timedelta(weeks=week_num)
    days_left_in_week = max(0, (week_end - now).days)
    total_sprint_days_left = max(0, (project_start + timedelta(weeks=6) - now).days)

    lines = [
        f"SPRINT POSITION: Week {week_num} of 6. {days_left_in_week} day(s) left in this week, "
        f"{total_sprint_days_left} day(s) left in the entire 6-week sprint.",
    ]

    red_flag = next((rf for rf in RED_FLAGS if rf["week"] == week_num), None)
    if red_flag:
        lines.append(
            f"RED-FLAG TRIGGER FOR THIS WEEK: {red_flag['text']}. "
            f"If the engineer's standup suggests this condition is being hit, "
            f"flag it explicitly as the top_concern and recommend the stated scope cut."
        )

    if task_due_date:
        try:
            due = datetime.fromisoformat(task_due_date).replace(tzinfo=timezone.utc)
            days_overdue = (now - due).days
            if days_overdue > 0:
                lines.append(f"THIS TASK IS {days_overdue} DAY(S) OVERDUE (due {task_due_date}).")
            elif days_overdue == 0:
                lines.append("THIS TASK IS DUE TODAY.")
        except Exception:
            pass

    return "\n".join(lines)


def _build_evaluate_prompt(payload: Dict[str, Any]) -> str:
    check_labels = {item["id"]: item["label"] for item in CHECKLIST_ITEMS}
    check_summary = "\n".join(
        f"{'✓' if payload['checks'].get(cid) else '✗'} {label}"
        for cid, label in check_labels.items()
    )
    sprint_context = payload.get("sprint_context", "")
    sprint_block = f"\n{sprint_context}\n" if sprint_context else ""

    return f"""You are a senior robotics engineering lead reviewing a daily standup for the AUIV Simulator project.
{sprint_block}
TASK: {payload['task_title']}
DONE CRITERIA: {payload['done_criteria']}
PREVIOUS NOTES: {payload.get('previous_notes') or 'None'}

ENGINEER CHECKLIST:
{check_summary}

BLOCKING ISSUE: {payload.get('blocker') or 'None stated'}
NEXT ACTION: {payload.get('next_action') or 'None stated'}
TOMORROW FIRST TASK: {payload.get('tomorrow_task') or 'None stated'}

If sprint position context above shows few days remaining in the week or
sprint, or shows a red-flag trigger condition being hit, or shows this
task is overdue, weight that heavily in top_concern and momentum —
deadline pressure should not be buried under generic encouragement.

Respond ONLY with valid JSON, no markdown, no backticks:
{{"completion_pct":<0-100 int>,"momentum":"strong"|"ok"|"at_risk","remaining":["<2-4 short strings>"],"blocker_assessment":"clear"|"vague"|"none","top_concern":"<one sentence>","green_signals":["<1-3 things going well>"]}}"""


def _build_subtask_prompt(payload: Dict[str, Any]) -> str:
    return f"""You are a senior robotics engineering lead breaking down a sprint task for the AUIV Simulator project.

TASK ID: {payload['task_id']}
TASK TITLE: {payload['task_title']}
DONE CRITERIA: {payload['done_criteria']}
CURRENT NOTES: {payload.get('current_notes') or 'None'}

Generate exactly 4-6 concrete, actionable sub-steps. Each starts with an imperative verb and references a specific file, command, or parameter.

Respond ONLY with valid JSON, no markdown, no backticks:
{{"subtasks":["<step 1>","<step 2>","<step 3>","<step 4>"]}}"""


def _build_prompt(job_type: str, payload: Dict[str, Any]) -> str:
    if job_type == "evaluate":
        return _build_evaluate_prompt(payload)
    return _build_subtask_prompt(payload)


# ── Raw Claude call ───────────────────────────────────────────────────────

async def _call_claude(api_key: str, prompt: str, max_tokens: int = 800) -> Dict[str, Any]:
    """Call Claude. Returns parsed dict on success. Raises on any failure."""
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        resp = await client.post(ANTHROPIC_URL, headers=headers, json=body)

    if resp.status_code != 200:
        err = resp.json()
        raise RuntimeError(
            err.get("error", {}).get("message", f"HTTP {resp.status_code}")
        )

    data = resp.json()
    raw = "".join(b.get("text", "") for b in data.get("content", []))
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(clean)


async def _call_gemini(api_key: str, prompt: str, max_tokens: int = 800) -> Dict[str, Any]:
    """
    Call Google Gemini (free tier, Google AI Studio).
    Uses responseMimeType=application/json to force valid JSON output
    directly from the model, rather than relying on prompt instructions
    alone (which is what we have to do for Claude).
    """
    url = GEMINI_URL.format(model=GEMINI_MODEL)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
        },
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        resp = await client.post(url, headers=headers, json=body)

    if resp.status_code != 200:
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", f"HTTP {resp.status_code}")
        except Exception:
            msg = f"HTTP {resp.status_code}"
        raise RuntimeError(msg)

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no candidates (possibly blocked by safety filters)")

    parts = candidates[0].get("content", {}).get("parts", [])
    raw = "".join(p.get("text", "") for p in parts)
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(clean)


async def _call_openrouter(api_key: str, prompt: str, max_tokens: int = 800) -> Dict[str, Any]:
    """
    Call OpenRouter (free tier, openrouter.ai).
    OpenAI-compatible schema: standard Bearer auth, response in
    choices[0].message.content. Uses response_format json_object to
    request valid JSON output directly, same pattern as Gemini.
    Uses the 'openrouter/free' auto-router so it always resolves to
    *some* currently-available free model rather than a specific slug
    that might get deprecated or rate-limited.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {
        "model": OPENROUTER_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        resp = await client.post(OPENROUTER_URL, headers=headers, json=body)

    if resp.status_code != 200:
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", f"HTTP {resp.status_code}")
        except Exception:
            msg = f"HTTP {resp.status_code}"
        raise RuntimeError(msg)

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenRouter returned no choices")

    raw = choices[0].get("message", {}).get("content", "")
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(clean)


async def _call_llm(api_key: str, prompt: str, max_tokens: int = 800) -> Dict[str, Any]:
    """
    Dispatches to the correct provider based on API key format.
    This is the ONLY function the rest of this module should call —
    attempt_evaluation() and run_pending_retries() both go through here,
    so a key pasted into Settings works regardless of which provider
    it belongs to, with zero frontend changes required.
    """
    provider = detect_provider(api_key)
    if provider == "gemini":
        return await _call_gemini(api_key, prompt, max_tokens)
    if provider == "openrouter":
        return await _call_openrouter(api_key, prompt, max_tokens)
    return await _call_claude(api_key, prompt, max_tokens)


# ── Job persistence ───────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _next_retry_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=RETRY_HOURS)).isoformat()


async def create_job(
    device_id: str,
    log_id: str,
    job_type: str,
    api_key: str,
    payload: Dict[str, Any],
) -> str:
    """Persist a pending job. Returns the job _id as str."""
    now = _now_iso()
    doc = {
        "device_id":          device_id,
        "log_id":             log_id,
        "job_type":           job_type,
        "status":             "pending",
        "api_key":            api_key,
        "payload":            payload,
        "result":             None,
        "error":              None,
        "retry_count":        0,
        "next_retry_at":      _next_retry_iso(),
        "created_at":         now,
        "updated_at":         now,
    }
    result = await jobs_col().insert_one(doc)
    return str(result.inserted_id)


async def _mark_completed(job_id: ObjectId, result: Dict[str, Any]):
    now = _now_iso()
    await jobs_col().update_one(
        {"_id": job_id},
        {"$set": {
            "status":     "completed",
            "result":     result,
            "error":      None,
            "updated_at": now,
        }}
    )


async def _mark_failed(job_id: ObjectId, error: str, exhausted: bool):
    now = _now_iso()
    await jobs_col().update_one(
        {"_id": job_id},
        {"$set": {
            "status":         "failed" if exhausted else "pending",
            "error":          error,
            "next_retry_at":  None if exhausted else _next_retry_iso(),
            "updated_at":     now,
        },
        "$inc": {"retry_count": 1}}
    )


async def _write_eval_to_log(log_id: str, result: Dict[str, Any]):
    """Patch the daily_log document with the completed AI eval."""
    try:
        await logs_col().update_one(
            {"_id": ObjectId(log_id)},
            {"$set": {"ai_eval": result, "updated_at": _now_iso()}}
        )
    except Exception as e:
        logger.warning(f"Could not patch log {log_id}: {e}")


# ── Attempt (used both on first call and on retry) ────────────────────────

async def attempt_evaluation(
    device_id: str,
    log_id: str,
    api_key: str,
    payload: Dict[str, Any],
    job_type: str = "evaluate",
) -> Dict[str, Any]:
    """
    Try Claude immediately.
    - Success → returns result dict, also patches log if log_id given
    - Timeout/error → creates a pending job, raises AIJobQueued
    """
    if job_type == "evaluate" and ("sprint_context" not in payload):
        payload = {
            **payload,
            "sprint_context": await _get_sprint_context(
                device_id, payload.get("week_num"), payload.get("task_due_date")
            ),
        }

    prompt = _build_prompt(job_type, payload)
    max_tokens = 800 if job_type == "evaluate" else 600
    provider = detect_provider(api_key)

    try:
        result = await _call_llm(api_key, prompt, max_tokens)
        if log_id:
            await _write_eval_to_log(log_id, result)
        return result

    except (httpx.TimeoutException, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
        logger.warning(f"{provider} timeout for device={device_id} log={log_id}: {e}")
        job_id = await create_job(device_id, log_id, job_type, api_key, payload)
        raise AIJobQueued(job_id=job_id, reason="timeout")

    except Exception as e:
        logger.error(f"{provider} error for device={device_id}: {e}")
        job_id = await create_job(device_id, log_id, job_type, api_key, payload)
        raise AIJobQueued(job_id=job_id, reason=str(e))


class AIJobQueued(Exception):
    """Raised when Claude call fails and job has been queued for retry."""
    def __init__(self, job_id: str, reason: str):
        self.job_id = job_id
        self.reason = reason
        super().__init__(f"Job queued [{job_id}]: {reason}")


# ── Retry loop (called by APScheduler every 5 min) ────────────────────────

async def run_pending_retries():
    """
    Called by APScheduler. Picks up all pending jobs whose
    next_retry_at <= now and attempts Claude again.
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    cursor = jobs_col().find({
        "status": "pending",
        "next_retry_at": {"$lte": now_iso},
    })

    async for job in cursor:
        job_id   = job["_id"]
        log_id   = job.get("log_id", "")
        job_type = job.get("job_type", "evaluate")
        api_key  = job.get("api_key", "")
        payload  = job.get("payload", {})
        retries  = job.get("retry_count", 0)

        logger.info(f"Retrying job {job_id} (attempt {retries + 1})")

        # Mark running
        await jobs_col().update_one(
            {"_id": job_id},
            {"$set": {"status": "running", "updated_at": now_iso}}
        )

        prompt     = _build_prompt(job_type, payload)
        max_tokens = 800 if job_type == "evaluate" else 600

        try:
            result = await _call_llm(api_key, prompt, max_tokens)
            await _write_eval_to_log(log_id, result)
            await _mark_completed(job_id, result)
            logger.info(f"Job {job_id} completed on retry {retries + 1}")

        except Exception as e:
            exhausted = (retries + 1) >= MAX_RETRIES
            await _mark_failed(job_id, str(e), exhausted)
            if exhausted:
                logger.error(f"Job {job_id} exhausted after {MAX_RETRIES} retries: {e}")
            else:
                logger.warning(f"Job {job_id} retry {retries + 1} failed, will retry in {RETRY_HOURS}h: {e}")
