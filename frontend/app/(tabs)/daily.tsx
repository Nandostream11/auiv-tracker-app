import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, todayKey } from '../../lib/store';
import { useJobStore, AIJob } from '../../lib/jobStore';
import {
  BrutalBox, BrutalBtn, BrutalBar, SectionLabel,
  CheckRow, BrutalInput, TagPill,
} from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';
import { saveLog, patchLog, getApiKey, getBaseUrl } from '../../lib/api';

const CHECKLIST = [
  { id: 'committed',         label: 'Committed at least one compiling change',             cat: 'CODE'      },
  { id: 'commit_ref',        label: 'Commit message references a deliverable number',       cat: 'CODE'      },
  { id: 'ci_passed',         label: 'CI passed (or know exactly which line fails)',         cat: 'CODE'      },
  { id: 'yaml_params',       label: 'Modified parameters are in YAML, not hardcoded',       cat: 'ARTIFACTS' },
  { id: 'result_saved',      label: 'Test result (pass/fail + metric) saved in results/',   cat: 'ARTIFACTS' },
  { id: 'comment_added',     label: 'New ROS2/Gazebo API call has a one-liner comment',     cat: 'ARTIFACTS' },
  { id: 'blocker_named',     label: "Can name one specific blocking issue (or 'none')",    cat: 'BLOCKING'  },
  { id: 'next_action',       label: 'Blocker has a specific next action — file/cmd/line',  cat: 'BLOCKING'  },
  { id: 'deliverable_known', label: "Know which weekly deliverable I'm on",                 cat: 'MILESTONE' },
  { id: 'scope_check',       label: 'Done criterion is still achievable this week',         cat: 'MILESTONE' },
  { id: 'tomorrow_task',     label: 'Have written one concrete first task for tomorrow',    cat: 'TOMORROW'  },
];
const CATS = ['CODE', 'ARTIFACTS', 'BLOCKING', 'MILESTONE', 'TOMORROW'];

// ── Pending job badge ──────────────────────────────────────────────────────
function PendingJobBanner({ job }: { job: AIJob }) {
  const retryAt   = job.nextRetryAt ? new Date(job.nextRetryAt) : null;
  const now       = new Date();
  const diffMs    = retryAt ? retryAt.getTime() - now.getTime() : 0;
  const diffHrs   = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
  const diffMins  = Math.max(0, Math.ceil(diffMs / (1000 * 60)));

  const timeLabel = diffHrs >= 1 ? `~${diffHrs}h` : `~${diffMins}m`;

  return (
    <View style={{
      borderWidth: C.BORDER_W, borderColor: C.amber,
      backgroundColor: C.amberGhost, padding: S.md, marginBottom: S.sm,
      flexDirection: 'row', alignItems: 'flex-start', gap: S.sm,
    }}>
      {/* Animated dot */}
      <View style={{ width: 8, height: 8, backgroundColor: C.amber, marginTop: 4, borderRadius: 4 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: '900', color: C.amber, letterSpacing: 1 }}>
          AI EVAL QUEUED
        </Text>
        <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginTop: 2, lineHeight: 18 }}>
          AI provider didn't respond in time. Your standup is saved.{'\n'}
          Backend will retry in {timeLabel} · Attempt {job.retryCount + 1}/5
        </Text>
        {job.error && (
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.red, marginTop: 4 }}>
            Last error: {job.error.slice(0, 80)}
          </Text>
        )}
      </View>
    </View>
  );
}

function FailedJobBanner() {
  return (
    <View style={{
      borderWidth: C.BORDER_W, borderColor: C.red,
      backgroundColor: C.redGhost, padding: S.md, marginBottom: S.sm,
    }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: '900', color: C.red }}>
        AI EVAL FAILED
      </Text>
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginTop: 4, lineHeight: 18 }}>
        All 5 retry attempts exhausted. Check your API key in Settings and re-submit to try again.
      </Text>
    </View>
  );
}

// ── Eval result display ────────────────────────────────────────────────────
function EvalResult({ ev }: { ev: any }) {
  const pctColor = ev.completion_pct >= 80 ? C.green : ev.completion_pct >= 40 ? C.orange : C.amber;
  return (
    <View style={{ borderWidth: C.BORDER_W, borderColor: C.orange, backgroundColor: C.surface, marginTop: S.md }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, padding: S.md }}>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.orange, letterSpacing: 2 }}>
          ◈ ENGINEERING LEAD EVALUATION
        </Text>
      </View>
      <View style={{ padding: S.md }}>
        {/* Pct + momentum */}
        <View style={{ flexDirection: 'row', gap: S.md, marginBottom: S.md, alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FONT.mono, fontWeight: '900', fontSize: 36, color: pctColor }}>
              {ev.completion_pct}<Text style={{ fontSize: 14 }}>%</Text>
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>
              TO DONE
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <BrutalBar pct={ev.completion_pct} color={pctColor} height={6} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs, marginTop: S.xs }}>
              <View style={{ width: 8, height: 8, backgroundColor: ev.momentum === 'strong' ? C.green : ev.momentum === 'ok' ? C.orange : C.red }} />
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                {ev.momentum} MOMENTUM
              </Text>
            </View>
          </View>
        </View>

        {/* Top concern */}
        <View style={{ borderWidth: 1, borderColor: `${C.amber}66`, backgroundColor: C.amberGhost, padding: S.sm, marginBottom: S.sm }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.amber, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            ▲ PRIORITY TOMORROW
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.white, lineHeight: 20 }}>{ev.top_concern}</Text>
        </View>

        {/* Remaining */}
        {ev.remaining?.length > 0 && (
          <View style={{ marginBottom: S.sm }}>
            <SectionLabel>STILL NEEDED</SectionLabel>
            {ev.remaining.map((r: string, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: S.sm, marginBottom: 6, alignItems: 'flex-start' }}>
                <Text style={{ color: C.red, fontSize: 14, marginTop: 1 }}>○</Text>
                <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 18 }}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Green signals */}
        {ev.green_signals?.length > 0 && (
          <View>
            <SectionLabel>GOING WELL</SectionLabel>
            {ev.green_signals.map((g: string, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: S.sm, marginBottom: 6, alignItems: 'flex-start' }}>
                <Text style={{ color: C.green, fontSize: 14 }}>✓</Text>
                <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 18 }}>{g}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function DailyScreen() {
  const { tasks, logs, deviceId, upsertLog, activeWeek } = useStore();
  const { addJob, getJobForDate, updateJob }             = useJobStore();

  const today    = todayKey();
  const existing = logs.find(l => l.date === today);
  const clientJob = getJobForDate(today);

  // Prefer the client-side job store (it has live retry countdown data),
  // but fall back to the backend-enriched log status if the client store
  // hasn't caught up yet (e.g. fresh app install, or app was closed before
  // the poller ever ran). This makes the pending/failed banners resilient
  // to client-state loss instead of silently showing nothing.
  const todayJob = clientJob || (existing && existing.eval_status && existing.eval_status !== 'completed'
    ? {
        jobId:       '',
        deviceId,
        logId:       existing.id,
        taskId:      existing.task_id,
        date:        today,
        jobType:     'evaluate' as const,
        status:      existing.eval_status,
        nextRetryAt: existing.eval_retry_at || null,
        retryCount:  existing.eval_retries || 0,
        result:      null,
        error:       existing.eval_error || null,
        createdAt:   existing.created_at,
        updatedAt:   existing.updated_at,
      }
    : null);

  const [checks,      setChecks]      = useState<Record<string, boolean>>(existing?.checks || {});
  const [taskId,      setTaskId]      = useState(existing?.task_id || '');
  const [blocker,     setBlocker]     = useState(existing?.blocker || '');
  const [nextAction,  setNextAction]  = useState(existing?.next_action || '');
  const [tomorrow,    setTomorrow]    = useState(existing?.tomorrow_task || '');
  const [loading,     setLoading]     = useState(false);
  const [aiEval,      setAiEval]      = useState<any>(existing?.ai_eval || null);
  const [saved,       setSaved]       = useState(!!existing);
  const [error,       setError]       = useState('');
  const [pickerOpen,  setPickerOpen]  = useState(false);

  // Sync aiEval when log updates in store (e.g. poller wrote result)
  useEffect(() => {
    const log = logs.find(l => l.date === today);
    if (log?.ai_eval && !aiEval) {
      setAiEval(log.ai_eval);
    }
  }, [logs, today]);

  const totalChecked = Object.values(checks).filter(Boolean).length;
  const pct          = Math.round((totalChecked / CHECKLIST.length) * 100);
  const currentTask  = tasks.find(t => t.task_id === taskId);
  const toggle       = (id: string) => setChecks(c => ({ ...c, [id]: !c[id] }));

  async function handleSubmit() {
    if (!taskId) { Alert.alert('SELECT A TASK', 'Pick the task you worked on today.'); return; }
    setLoading(true); setError('');

    try {
      // 1. Save the log first — always succeeds (no AI yet)
      const logBody = {
        device_id:     deviceId,
        date:          today,
        task_id:       taskId,
        week_num:      currentTask?.week_num || activeWeek,
        checks,
        blocker,
        next_action:   nextAction,
        tomorrow_task: tomorrow,
      };
      const log = await saveLog(logBody);
      upsertLog(log);
      setSaved(true);

      // 2. Attempt AI eval — backend handles queuing on timeout
      const apiKey = await getApiKey();
      if (!apiKey) {
        setError('Log saved. Add API key in Settings to enable AI evaluation.');
        setLoading(false);
        return;
      }

      const base = await getBaseUrl();
      const evalRes = await fetch(`${base}/api/ai/evaluate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id:      deviceId,
          log_id:         log.id,          // ← critical: backend links job to log
          api_key:        apiKey,
          task_title:     currentTask?.title     || '',
          done_criteria:  currentTask?.done_criteria || '',
          checks,
          blocker,
          next_action:    nextAction,
          tomorrow_task:  tomorrow,
          previous_notes: currentTask?.notes || '',
          week_num:       currentTask?.week_num,
          task_due_date:  currentTask?.due_date || null,
        }),
      });

      const evalData = await evalRes.json();

      if (evalRes.status === 200 && evalData.result) {
        // ── Immediate success ──────────────────────────────────────────
        setAiEval(evalData.result);
        const updated = await patchLog(log.id, { ai_eval: evalData.result });
        upsertLog(updated);

        // Clear any stale pending job for today
        if (todayJob) await updateJob(todayJob.jobId, { status: 'completed', result: evalData.result });

      } else if (evalRes.status === 202 || evalData.status === 'pending') {
        // ── Queued for retry ───────────────────────────────────────────
        const newJob: AIJob = {
          jobId:       evalData.job_id,
          deviceId,
          logId:       log.id,
          taskId:      taskId,
          date:        today,
          jobType:     'evaluate',
          status:      'pending',
          nextRetryAt: evalData.next_retry_at,
          retryCount:  0,
          result:      null,
          error:       null,
          createdAt:   new Date().toISOString(),
          updatedAt:   new Date().toISOString(),
        };
        await addJob(newJob);
        setError('');  // no error — just queued
      }

    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }

    setLoading(false);
  }

  const showPending = todayJob?.status === 'pending' || todayJob?.status === 'running';
  const showFailed  = todayJob?.status === 'failed';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: C.orange,
          backgroundColor: C.surface, padding: S.md, marginBottom: S.sm,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <View>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 3, textTransform: 'uppercase' }}>
              DAILY STANDUP
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: '900', color: C.white, marginTop: 2 }}>
              {today}
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 24, fontWeight: '900', color: pct === 100 ? C.green : C.orange }}>
              {pct}<Text style={{ fontSize: 12 }}>%</Text>
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim }}>{totalChecked}/{CHECKLIST.length}</Text>
          </View>
        </View>

        {/* Job status banners */}
        {showPending && todayJob && <PendingJobBanner job={todayJob} />}
        {showFailed  && <FailedJobBanner />}

        {/* Task selector */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel>WHICH TASK DID YOU WORK ON?</SectionLabel>
          <TouchableOpacity
            onPress={() => setPickerOpen(!pickerOpen)}
            style={{
              borderWidth: C.BORDER_W,
              borderColor: taskId ? C.orange : C.border,
              backgroundColor: C.surfaceHigh, padding: S.md,
              minHeight: S.tapMin, flexDirection: 'row',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: taskId ? C.white : C.textDim }}>
              {taskId ? `${taskId} · ${currentTask?.title || ''}` : '— SELECT TASK —'}
            </Text>
            <Text style={{ color: C.textDim, fontSize: 16 }}>{pickerOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {pickerOpen && (
            <View style={{ borderWidth: C.BORDER_W, borderColor: C.border, borderTopWidth: 0 }}>
              {[...tasks].sort((a, b) => a.task_id.localeCompare(b.task_id)).map(t => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => { setTaskId(t.task_id); setPickerOpen(false); }}
                  style={{
                    padding: S.md, minHeight: S.tapMin,
                    borderBottomWidth: 1, borderBottomColor: C.border,
                    backgroundColor: taskId === t.task_id ? C.orangeGhost : 'transparent',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: taskId === t.task_id ? C.orange : C.white }}>
                    {t.task_id} · {t.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {currentTask && (
            <View style={{ marginTop: S.sm, backgroundColor: C.surfaceHigh, padding: S.sm, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                DONE WHEN:
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textPrimary, lineHeight: 18 }}>
                {currentTask.done_criteria}
              </Text>
            </View>
          )}
        </BrutalBox>

        {/* Checklist by category */}
        {CATS.map(cat => {
          const items   = CHECKLIST.filter(i => i.cat === cat);
          const catDone = items.filter(i => checks[i.id]).length;
          return (
            <BrutalBox key={cat} style={{ padding: S.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <SectionLabel>{cat}</SectionLabel>
                <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: catDone === items.length ? C.green : C.textDim }}>
                  {catDone}/{items.length}
                </Text>
              </View>
              {items.map(item => (
                <CheckRow key={item.id} label={item.label} checked={!!checks[item.id]} onToggle={() => toggle(item.id)} />
              ))}
            </BrutalBox>
          );
        })}

        {/* Freeform fields */}
        {[
          { key: 'blocker',  label: 'BLOCKING ISSUE',         val: blocker,    set: setBlocker,   ph: "Specific file, function, error — or 'none'" },
          { key: 'next',     label: 'NEXT ACTION ON BLOCKER',  val: nextAction, set: setNextAction, ph: 'e.g. Check line 42 of ekf_config.yaml for R_dvl typo' },
          { key: 'tomorrow', label: 'FIRST TASK TOMORROW',     val: tomorrow,   set: setTomorrow,  ph: 'e.g. ros2 launch auiv_bringup sensors.launch.py' },
        ].map(f => (
          <BrutalBox key={f.key} style={{ padding: S.md }}>
            <SectionLabel>{f.label}</SectionLabel>
            <BrutalInput value={f.val} onChangeText={f.set} placeholder={f.ph} multiline rows={2} />
          </BrutalBox>
        ))}

        {error !== '' && (
          <View style={{ borderWidth: 1, borderColor: C.amber, backgroundColor: C.amberGhost, padding: S.md, marginBottom: S.sm }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber }}>{error}</Text>
          </View>
        )}

        {/* Submit */}
        <BrutalBtn
          label={loading ? 'EVALUATING...' : saved ? 'UPDATE + RE-EVAL' : 'SUBMIT + GET AI EVAL'}
          onPress={handleSubmit}
          disabled={loading || !taskId}
        />

        {/* AI Eval result (immediate or hydrated from poller) */}
        {aiEval && !showPending && <EvalResult ev={aiEval} />}

      </ScrollView>
    </SafeAreaView>
  );
}
