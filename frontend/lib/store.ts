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
  created_at: string;
  updated_at: string;
}

export interface AppState {
  deviceId: string;
  initialized: boolean;
  tasks: Task[];
  logs: DailyLog[];
  activeWeek: number;
  charter: any | null;
  checklistItems: any[];

  setDeviceId: (id: string) => void;
  setInitialized: (v: boolean) => void;
  setTasks: (tasks: Task[]) => void;
  setLogs: (logs: DailyLog[]) => void;
  setActiveWeek: (w: number) => void;
  setCharter: (c: any) => void;
  setChecklistItems: (items: any[]) => void;
  upsertTask: (task: Task) => void;
  upsertLog: (log: DailyLog) => void;
  removeTask: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  deviceId:      '',
  initialized:   false,
  tasks:         [],
  logs:          [],
  activeWeek:    1,
  charter:       null,
  checklistItems: [],

  setDeviceId:       (id)    => set({ deviceId: id }),
  setInitialized:    (v)     => set({ initialized: v }),
  setTasks:          (tasks) => set({ tasks }),
  setLogs:           (logs)  => set({ logs }),
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
