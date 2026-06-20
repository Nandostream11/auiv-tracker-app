/**
 * useAIJobPoller.ts
 *
 * Background hook — mount once in _layout.tsx.
 *
 * Lifecycle:
 *  1. On mount → hydrate jobStore from AsyncStorage
 *  2. Poll GET /api/ai/jobs/{device_id}?status=pending every 5 min
 *  3. For any job that has flipped to 'completed' on backend:
 *       a. Write ai_eval result into matching DailyLog in main store
 *       b. Mark job completed in jobStore
 *       c. Trigger optional onEvalComplete callback (toast / notification)
 *  4. For failed/exhausted jobs → mark failed in jobStore so UI can show error
 *
 * The 5-minute poll is intentionally aggressive relative to the 5-hour retry
 * so that when the backend DOES complete a job, the user sees it quickly on
 * their next app open without waiting another full cycle.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useStore } from '../lib/store';
import { useJobStore, AIJob } from '../lib/jobStore';
import { getBaseUrl } from '../lib/api';

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes

async function fetchJobStatus(deviceId: string, jobId: string): Promise<any | null> {
  try {
    const base = await getBaseUrl();
    const res  = await fetch(`${base}/api/ai/jobs/${deviceId}/${jobId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchCompletedJobsSince(deviceId: string, since: string): Promise<any[]> {
  try {
    const base = await getBaseUrl();
    const url  = `${base}/api/ai/jobs/${deviceId}?status=completed&since=${encodeURIComponent(since)}`;
    const res  = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export function useAIJobPoller(onEvalComplete?: (date: string, result: any) => void) {
  const { deviceId, upsertLog, logs } = useStore();
  const { jobs, hydrated, hydrateFromStorage, updateJob, getPendingJobs } = useJobStore();

  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>('active');
  const lastPollRef = useRef<string>(new Date(0).toISOString());

  // ── Step 1: hydrate from AsyncStorage on mount ─────────────────────────
  useEffect(() => {
    hydrateFromStorage();
  }, []);

  // ── Step 2: poll logic ──────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!deviceId || !hydrated) return;

    const pending = getPendingJobs();
    if (pending.length === 0) return;

    const since = lastPollRef.current;
    lastPollRef.current = new Date().toISOString();

    // Check each pending job individually for precise status
    for (const job of pending) {
      const remote = await fetchJobStatus(deviceId, job.jobId);
      if (!remote) continue;

      if (remote.status === 'completed' && remote.result) {
        // ── Hydrate main log store ────────────────────────────────────────
        const matchingLog = logs.find(l => l.id === job.logId || l.date === job.date);
        if (matchingLog) {
          upsertLog({ ...matchingLog, ai_eval: remote.result });
        }

        await updateJob(job.jobId, {
          status:    'completed',
          result:    remote.result,
          updatedAt: remote.updated_at,
        });

        onEvalComplete?.(job.date, remote.result);

      } else if (remote.status === 'failed') {
        await updateJob(job.jobId, {
          status:     'failed',
          error:      remote.error,
          retryCount: remote.retry_count,
          updatedAt:  remote.updated_at,
        });

      } else {
        // Still pending/running — update retry metadata
        await updateJob(job.jobId, {
          status:      remote.status,
          retryCount:  remote.retry_count,
          nextRetryAt: remote.next_retry_at,
          updatedAt:   remote.updated_at,
        });
      }
    }
  }, [deviceId, hydrated, getPendingJobs, logs, upsertLog, updateJob, onEvalComplete]);

  // ── Step 3: start/stop interval based on app state ─────────────────────
  useEffect(() => {
    if (!hydrated || !deviceId) return;

    // Poll immediately on mount
    poll();

    pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      appStateRef.current = state;
      if (state === 'active') {
        // App came to foreground — poll immediately
        poll();
      } else {
        // App backgrounded — clear interval (battery courtesy)
        if (pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      }
    });

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      sub.remove();
    };
  }, [hydrated, deviceId, poll]);
}
