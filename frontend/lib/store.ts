import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TaskStatus = 'todo' | 'inprogress' | 'done' | 'blocked';

export interface Task {
  id: string;          // MongoDB _id
  device_id: string;
  week_num: number;
  task_id: string;     // e.g. "1.1"
  title: string;
  detail: string;
  done_criteria: string;
  status: TaskStatus;
  notes: string;
  subtasks: string[];
  start_date?: string | null;  // ISO date "YYYY-MM-DD"
  due_date?: string | null;    // ISO date "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
}

export interface DailyLog {
  id: string;
  device_id: string;
  date: string;
  task_id: string;
  week_num: number;
  checks: Record<string, boolean>;
  blocker: string;
  next_action: string;
  tomorrow_task: string;
  ai_eval: any | null;
  eval_status?: 'completed' | 'pending' | 'running' | 'failed' | 'never_attempted';
  eval_error?: string | null;
  eval_retry_at?: string | null;
  eval_retries?: number;
  created_at: string;
  updated_at: string;
}

export interface Week {
  id: string;
  device_id: string;
  num: number;
  title: string;
  hours: number;
  start_date?: string | null;
  due_date?: string | null;
  agenda?: string | null;   // free-text description of what this week is about
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppState {
  deviceId: string;
  initialized: boolean;
  tasks: Task[];
  logs: DailyLog[];
  weeks: Week[];
  activeWeek: number;
  charter: any | null;
  checklistItems: any[];

  setDeviceId: (id: string) => void;
  setInitialized: (v: boolean) => void;
  setTasks: (tasks: Task[]) => void;
  setLogs: (logs: DailyLog[]) => void;
  setWeeks: (weeks: Week[]) => void;
  setActiveWeek: (w: number) => void;
  setCharter: (c: any) => void;
  setChecklistItems: (items: any[]) => void;
  upsertTask: (task: Task) => void;
  upsertLog: (log: DailyLog) => void;
  removeTask: (id: string) => void;
  upsertWeek: (week: Week) => void;
  removeWeek: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  deviceId:      '',
  initialized:   false,
  tasks:         [],
  logs:          [],
  activeWeek:    1,
  charter:       null,
  checklistItems: [],
  weeks:         [],

  setDeviceId:       (id)    => set({ deviceId: id }),
  setInitialized:    (v)     => set({ initialized: v }),
  setTasks:          (tasks) => set({ tasks }),
  setLogs:           (logs)  => set({ logs }),
  setWeeks:          (weeks) => set({ weeks }),
  setActiveWeek:     (w)     => set({ activeWeek: w }),
  setCharter:        (c)     => set({ charter: c }),
  setChecklistItems: (items) => set({ checklistItems: items }),

  upsertTask: (task) => set((s) => {
    const idx = s.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      const updated = [...s.tasks];
      updated[idx] = task;
      return { tasks: updated };
    }
    return { tasks: [...s.tasks, task] };
  }),

  upsertLog: (log) => set((s) => {
    const idx = s.logs.findIndex((l) => l.id === log.id);
    if (idx >= 0) {
      const updated = [...s.logs];
      updated[idx] = log;
      return { logs: updated };
    }
    return { logs: [log, ...s.logs] };
  }),

  removeTask: (id) => set((s) => ({
    tasks: s.tasks.filter((t) => t.id !== id),
  })),

  upsertWeek: (week) => set((s) => {
    const idx = s.weeks.findIndex((w) => w.id === week.id);
    if (idx >= 0) {
      const updated = [...s.weeks];
      updated[idx] = week;
      return { weeks: updated };
    }
    return { weeks: [...s.weeks, week].sort((a, b) => a.num - b.num) };
  }),

  removeWeek: (id) => set((s) => ({
    weeks: s.weeks.filter((w) => w.id !== id),
  })),
}));

// ── Derived helpers ───────────────────────────────────────────────────────
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getWeekProgress(tasks: Task[], weekNum: number) {
  const wt = tasks.filter((t) => t.week_num === weekNum);
  const done = wt.filter((t) => t.status === 'done').length;
  return { done, total: wt.length, pct: wt.length ? Math.round((done / wt.length) * 100) : 0 };
}

export function calcStreak(logs: DailyLog[]): number {
  const keys = logs.map((l) => l.date).sort((a, b) => b.localeCompare(a));
  if (!keys.length) return 0;
  let streak = 0;
  const msPerDay = 86400000;
  let check = new Date(todayKey());
  for (const k of keys) {
    const diff = Math.round((check.getTime() - new Date(k).getTime()) / msPerDay);
    if (diff === 0 || diff === 1) { streak++; check = new Date(k); }
    else break;
  }
  return streak;
}

export function calcBestStreak(logs: DailyLog[]): number {
  const dates = [...new Set(logs.map((l) => l.date))].sort();
  if (!dates.length) return 0;
  const msPerDay = 86400000;
  let best = 1, current = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / msPerDay);
    if (diff === 1) { current++; best = Math.max(best, current); }
    else { current = 1; }
  }
  return best;
}

export function statusColor(status: TaskStatus, C: any) {
  return status === 'done' ? C.green : status === 'inprogress' ? C.orange : status === 'blocked' ? C.red : C.textDim;
}

export function statusLabel(s: TaskStatus) {
  return s === 'done' ? 'DONE' : s === 'inprogress' ? 'IN PROGRESS' : s === 'blocked' ? 'BLOCKED' : 'TODO';
}

export type TimelineUrgency = 'overdue' | 'due_today' | 'due_soon' | 'on_track' | 'done' | 'no_date';

export function getTimelineUrgency(task: Task): TimelineUrgency {
  if (task.status === 'done') return 'done';
  if (!task.due_date) return 'no_date';

  const today = new Date(todayKey());
  const due = new Date(task.due_date);
  const msPerDay = 86400000;
  const diffDays = Math.round((due.getTime() - today.getTime()) / msPerDay);

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due_today';
  if (diffDays <= 2) return 'due_soon';
  return 'on_track';
}

export function timelineUrgencyColor(u: TimelineUrgency, C: any): string {
  switch (u) {
    case 'overdue':   return C.red;
    case 'due_today': return C.amber;
    case 'due_soon':  return C.amber;
    case 'done':      return C.green;
    case 'on_track':  return C.textSecondary;
    default:          return C.textDim;
  }
}

export function timelineUrgencyLabel(u: TimelineUrgency, task: Task): string {
  if (u === 'no_date') return 'No due date';
  if (u === 'done') return 'Done';
  if (!task.due_date) return '';
  const today = new Date(todayKey());
  const due = new Date(task.due_date);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  return `Due in ${diffDays}d`;
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ── Focus Today ─────────────────────────────────────────────────────────
// Heuristic "what to actually work on right now" — same job as Things 3's
// Today view or Sunsama's daily plan, computed instantly and for free
// (no AI call needed). Priority order, highest first:
//   1. Blocked tasks — these need attention before anything else can move
//   2. In-progress tasks that are overdue or due very soon — finish what's started
//   3. Any other in-progress task — momentum matters more than starting fresh
//   4. Todo tasks that are overdue
//   5. Todo tasks due soon
// Returns at most 4 — a longer list stops being a "focus" list.
export interface FocusTask extends Task {
  focusReason: string;
}

export function getFocusTasks(tasks: Task[]): FocusTask[] {
  const active = tasks.filter((t) => t.status !== 'done');

  function score(task: Task): number {
    const urgency = getTimelineUrgency(task);
    if (task.status === 'blocked') return 1000;       // nothing moves until unblocked
    if (urgency === 'overdue') return 900;             // late is late, regardless of status
    if (urgency === 'due_today') return 800;
    if (task.status === 'inprogress' && urgency === 'due_soon') return 700;
    if (task.status === 'inprogress') return 600;      // momentum — finish what's started
    if (urgency === 'due_soon') return 500;             // todo, coming up soon
    return 0;                                            // todo, no pressing date — not shown
  }

  function reasonFor(task: Task): string {
    const urgency = getTimelineUrgency(task);
    if (task.status === 'blocked') return 'Blocked — needs attention';
    if (urgency === 'overdue') return `Overdue · ${timelineUrgencyLabel(urgency, task)}`;
    if (urgency === 'due_today') return 'Due today';
    if (task.status === 'inprogress' && urgency === 'due_soon') return `In progress · ${timelineUrgencyLabel(urgency, task)}`;
    if (task.status === 'inprogress') return 'In progress — keep momentum';
    if (urgency === 'due_soon') return timelineUrgencyLabel(urgency, task);
    return '';
  }

  const scored = active
    .map((t) => ({ task: t, score: score(t) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 4).map((x) => ({ ...x.task, focusReason: reasonFor(x.task) }));
}

// ── Sprint Burndown ────────────────────────────────────────────────────────
// Computed per-week-boundary rather than per-day, since we don't reliably
// track the exact historical date a task flipped to "done" (notes edits
// after completion would skew updated_at). Using week_num as the bucket
// is the same pattern Linear/Jira use for multi-iteration burndown —
// burn measured at iteration boundaries, not reconstructed day-by-day.
export interface BurndownPoint {
  weekNum: number;
  weekTitle: string;
  idealRemainingPct: number;   // 0-100, where 100 = nothing done yet
  actualRemainingPct: number;
  idealRemaining: number;      // raw task count
  actualRemaining: number;
  isFuture: boolean;           // week hasn't started yet (start_date in future)
}

export function getBurndownData(tasks: Task[], weeks: Week[]): BurndownPoint[] {
  const sorted = [...weeks].sort((a, b) => a.num - b.num);
  const total = tasks.length;
  if (total === 0 || sorted.length === 0) return [];

  const today = todayKey();
  const points: BurndownPoint[] = [];

  sorted.forEach((w, idx) => {
    const weeksElapsed = idx + 1;
    const idealRemaining = Math.max(0, total - Math.round((total / sorted.length) * weeksElapsed));

    // Actual: how many tasks due by the end of this week (or assigned to
    // weeks up to and including this one) are still not done
    const tasksUpToThisWeek = tasks.filter((t) => t.week_num <= w.num);
    const doneUpToThisWeek = tasksUpToThisWeek.filter((t) => t.status === 'done').length;
    const actualRemaining = Math.max(0, total - doneUpToThisWeek);

    const isFuture = !!w.start_date && w.start_date > today;

    points.push({
      weekNum: w.num,
      weekTitle: w.title,
      idealRemainingPct: Math.round((idealRemaining / total) * 100),
      actualRemainingPct: Math.round((actualRemaining / total) * 100),
      idealRemaining,
      actualRemaining,
      isFuture,
    });
  });

  return points;
}

export function getBurndownStatus(points: BurndownPoint[]): { label: string; color: 'green' | 'amber' | 'red'; delta: number } {
  // Find the most recent non-future week to compare against
  const current = [...points].reverse().find((p) => !p.isFuture) || points[0];
  if (!current) return { label: 'NO DATA', color: 'amber', delta: 0 };

  const delta = current.idealRemaining - current.actualRemaining; // positive = ahead of plan
  if (delta > 0) return { label: `${delta} ahead of plan`, color: 'green', delta };
  if (delta === 0) return { label: 'Exactly on plan', color: 'green', delta };
  if (delta >= -3) return { label: `${Math.abs(delta)} behind plan`, color: 'amber', delta };
  return { label: `${Math.abs(delta)} behind plan`, color: 'red', delta };
}

// ── XP / Levels ────────────────────────────────────────────────────────────
// Reward-only design, deliberately. Research on Habitica's HP-loss penalty
// mechanic shows post-streak-break recovery as low as 0.9% — punishment
// mechanics drive people away rather than back. This system only ever
// adds XP, never removes it, so a missed day costs you a streak (which
// resets and is visible) but never erases progress you already earned.
const XP_PER_TASK_DONE   = 10;
const XP_PER_STANDUP     = 5;
const XP_PER_AI_EVAL     = 5;
const XP_PER_STREAK_DAY  = 2;

export const LEVEL_TITLES = [
  'CADET',
  'OPERATOR',
  'FIELD ENGINEER',
  'SYSTEMS LEAD',
  'MISSION SPECIALIST',
  'CHIEF ENGINEER',
  'SQUADRON COMMANDER',
  'FLEET ARCHITECT',
];

export function calcXP(tasks: Task[], logs: DailyLog[]): number {
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const standupCount = logs.length;
  const evalCount = logs.filter((l) => !!l.ai_eval).length;
  const streak = calcStreak(logs);

  return (
    doneCount * XP_PER_TASK_DONE +
    standupCount * XP_PER_STANDUP +
    evalCount * XP_PER_AI_EVAL +
    streak * XP_PER_STREAK_DAY
  );
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
  progressPct: number;
}

// Cumulative XP needed to REACH level L (1-indexed): triangular-ish curve
// so each level takes meaningfully longer than the last, without becoming
// punishing — L1→L2 takes 100xp (~3 tasks + a few standups), L7→L8 takes
// 2800xp (a realistic full 6-week sprint's worth of work).
function cumulativeXpForLevel(level: number): number {
  return 50 * level * (level + 1);
}

export function getLevelInfo(xp: number): LevelInfo {
  let level = 1;
  while (cumulativeXpForLevel(level) <= xp && level < LEVEL_TITLES.length) {
    level++;
  }
  const floor = level === 1 ? 0 : cumulativeXpForLevel(level - 1);
  const ceiling = cumulativeXpForLevel(level);
  const atMaxLevel = level >= LEVEL_TITLES.length && xp >= ceiling;

  const xpForThisLevel = ceiling - floor;
  // Once XP exceeds the top tier's ceiling there's no "next level" to
  // measure progress toward — cap the bar at 100% instead of letting
  // xpIntoLevel grow past xpForThisLevel (which produced ratios like
  // 2200/800, a real bug caught by testing realistic high-XP values).
  const xpIntoLevel = atMaxLevel ? xpForThisLevel : xp - floor;
  const progressPct = xpForThisLevel > 0
    ? Math.min(100, Math.round((xpIntoLevel / xpForThisLevel) * 100))
    : 100;

  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xp,
    xpIntoLevel,
    xpForThisLevel,
    progressPct,
  };
}

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100];

export function nextStreakMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}
