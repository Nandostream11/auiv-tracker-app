/**
 * jobStore.ts
 *
 * Persistent AI job queue on the frontend.
 *
 * Responsibilities:
 *  - Store pending job IDs + metadata in AsyncStorage (survives app restarts)
 *  - On app launch, re-hydrate store from AsyncStorage
 *  - Poll backend every 5 min for completed jobs
 *  - When a job completes → write result into the matching daily log in the main store
 *  - Expose job status per (date, taskId) for UI badge rendering
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JOBS_STORAGE_KEY = 'auiv_ai_jobs_v1';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType   = 'evaluate' | 'suggest_subtasks';

export interface AIJob {
  jobId:         string;
  deviceId:      string;
  logId:         string;       // daily_log mongo id — to hydrate when complete
  taskId:        string;       // e.g. "1.1" — for display
  date:          string;       // YYYY-MM-DD — for display
  jobType:       JobType;
  status:        JobStatus;
  nextRetryAt:   string | null;
  retryCount:    number;
  result:        any | null;
  error:         string | null;
  createdAt:     string;
  updatedAt:     string;
}

interface JobStoreState {
  jobs: AIJob[];
  hydrated: boolean;

  // Actions
  hydrateFromStorage:  () => Promise<void>;
  addJob:              (job: AIJob) => Promise<void>;
  updateJob:           (jobId: string, patch: Partial<AIJob>) => Promise<void>;
  removeJob:           (jobId: string) => Promise<void>;
  getJobForDate:       (date: string) => AIJob | undefined;
  getPendingJobs:      () => AIJob[];
  clearCompleted:      () => Promise<void>;
}

async function persistJobs(jobs: AIJob[]) {
  try {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.warn('[jobStore] Failed to persist jobs:', e);
  }
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  jobs:     [],
  hydrated: false,

  hydrateFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(JOBS_STORAGE_KEY);
      const jobs: AIJob[] = raw ? JSON.parse(raw) : [];
      set({ jobs, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  addJob: async (job) => {
    const jobs = [...get().jobs.filter(j => j.jobId !== job.jobId), job];
    set({ jobs });
    await persistJobs(jobs);
  },

  updateJob: async (jobId, patch) => {
    const jobs = get().jobs.map(j =>
      j.jobId === jobId ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j
    );
    set({ jobs });
    await persistJobs(jobs);
  },

  removeJob: async (jobId) => {
    const jobs = get().jobs.filter(j => j.jobId !== jobId);
    set({ jobs });
    await persistJobs(jobs);
  },

  getJobForDate: (date) => get().jobs.find(j => j.date === date),

  getPendingJobs: () =>
    get().jobs.filter(j => j.status === 'pending' || j.status === 'running'),

  clearCompleted: async () => {
    const jobs = get().jobs.filter(j => j.status !== 'completed');
    set({ jobs });
    await persistJobs(jobs);
  },
}));
