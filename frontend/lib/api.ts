import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const BASE_URL_KEY = 'auiv_base_url';
const DEFAULT_BASE  = 'http://localhost:8000';

export async function getBaseUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(BASE_URL_KEY);
  return stored || DEFAULT_BASE;
}

export async function setBaseUrl(url: string) {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ''));
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Device ID ────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = 'auiv_device_id';

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ── API Key ───────────────────────────────────────────────────────────────
const API_KEY_STORE = 'auiv_anthropic_key';

export async function getApiKey(): Promise<string> {
  try { return (await SecureStore.getItemAsync(API_KEY_STORE)) || ''; }
  catch { return ''; }
}

export async function setApiKey(key: string) {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}

// ── Project ───────────────────────────────────────────────────────────────
export async function initProject(device_id: string) {
  return request<any>('POST', '/api/project/init', { device_id });
}

export async function getCharter(device_id: string) {
  return request<any>('GET', `/api/project/charter/${device_id}`);
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export async function getAllTasks(device_id: string) {
  return request<any[]>('GET', `/api/tasks/${device_id}`);
}

export async function getWeekTasks(device_id: string, week_num: number) {
  return request<any[]>('GET', `/api/tasks/${device_id}/week/${week_num}`);
}

export async function createTask(body: {
  device_id: string; week_num: number; task_id: string;
  title: string; detail: string; done_criteria: string;
  start_date?: string; due_date?: string;
}) {
  return request<any>('POST', '/api/tasks/', body);
}

export async function updateTask(mongoId: string, fields: {
  title?: string; detail?: string; done_criteria?: string;
  status?: string; notes?: string;
  start_date?: string; due_date?: string;
}) {
  return request<any>('PATCH', `/api/tasks/${mongoId}`, fields);
}

export async function deleteTask(mongoId: string) {
  return request<any>('DELETE', `/api/tasks/${mongoId}`);
}

export async function setSubtasks(mongoId: string, subtasks: string[]) {
  return request<any>('PATCH', `/api/tasks/${mongoId}/subtasks`, subtasks);
}

// ── Daily Logs ────────────────────────────────────────────────────────────
export async function getAllLogs(device_id: string) {
  return request<any[]>('GET', `/api/daily-logs/${device_id}`);
}

export async function getLogByDate(device_id: string, date: string) {
  return request<any>('GET', `/api/daily-logs/${device_id}/date/${date}`);
}

export async function getLogsForTask(device_id: string, task_id: string) {
  return request<any[]>('GET', `/api/daily-logs/${device_id}/task/${task_id}`);
}

export async function saveLog(body: {
  device_id: string; date: string; task_id: string; week_num: number;
  checks: Record<string, boolean>; blocker?: string;
  next_action?: string; tomorrow_task?: string;
}) {
  return request<any>('POST', '/api/daily-logs/', body);
}

export async function patchLog(logId: string, fields: {
  checks?: Record<string, boolean>; blocker?: string;
  next_action?: string; tomorrow_task?: string; ai_eval?: any;
}) {
  return request<any>('PATCH', `/api/daily-logs/${logId}`, fields);
}

// ── AI ────────────────────────────────────────────────────────────────────
export async function evaluateStandup(body: {
  device_id: string; api_key: string; task_title: string;
  done_criteria: string; checks: Record<string, boolean>;
  blocker?: string; next_action?: string; tomorrow_task?: string;
  previous_notes?: string; week_num?: number; task_due_date?: string;
}) {
  return request<any>('POST', '/api/ai/evaluate', body);
}

export async function suggestSubtasks(body: {
  device_id: string; api_key: string; task_id: string;
  task_title: string; done_criteria: string; current_notes?: string;
}) {
  return request<any>('POST', '/api/ai/suggest-subtasks', body);
}
