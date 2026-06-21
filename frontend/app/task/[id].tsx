import React, { useState, useRef, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity,
  Alert, Modal, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, statusColor, statusLabel, todayKey, getTimelineUrgency, timelineUrgencyColor, timelineUrgencyLabel } from '../../lib/store';
import {
  BrutalBox, BrutalBtn, BrutalBar, SectionLabel,
  BrutalInput, TagPill, StatusCycleBtn, Mono, Divider,
  DateStepper, TimelineBadge, EvalStatusBadge, EvalStatusDetail,
} from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';
import { updateTask, suggestSubtasks, setSubtasks as patchSubtasksApi, getApiKey, getLogsForTask } from '../../lib/api';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tasks, logs, deviceId, upsertTask } = useStore();

  const task = tasks.find((t) => t.id === id);

  const [notes, setNotes]           = useState(task?.notes || '');
  const [editOpen, setEditOpen]     = useState(false);
  const [editTitle, setEditTitle]   = useState(task?.title || '');
  const [editDetail, setEditDetail] = useState(task?.detail || '');
  const [editCriteria, setEditCriteria] = useState(task?.done_criteria || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [subtasks, setSubtasks]     = useState<string[]>(task?.subtasks || []);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [taskLogs, setTaskLogs]     = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const notesTimer = useRef<any>(null);

  // Load task-specific logs
  useEffect(() => {
    if (!task) return;
    getLogsForTask(deviceId, task.task_id)
      .then(setTaskLogs)
      .catch(() => setTaskLogs([]))
      .finally(() => setLogsLoading(false));
  }, [task?.task_id, deviceId]);

  if (!task) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: FONT.mono, color: C.textDim, letterSpacing: 2 }}>TASK NOT FOUND</Text>
      </SafeAreaView>
    );
  }

  // Status cycle
  async function handleCycleStatus() {
    const order = ['todo', 'inprogress', 'done', 'blocked'] as const;
    const next = order[(order.indexOf(task.status as any) + 1) % order.length];
    try {
      const updated = await updateTask(task.id, { status: next });
      upsertTask(updated);
    } catch (e: any) { Alert.alert('ERROR', e.message); }
  }

  // Auto-save notes
  function handleNotesChange(v: string) {
    setNotes(v);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      try {
        const updated = await updateTask(task.id, { notes: v });
        upsertTask(updated);
      } catch {}
      setSavingNotes(false);
    }, 800);
  }

  // Save edits
  async function handleSaveEdit() {
    setSavingEdit(true);
    try {
      const updated = await updateTask(task.id, {
        title: editTitle, detail: editDetail, done_criteria: editCriteria,
      });
      upsertTask(updated);
      setEditOpen(false);
    } catch (e: any) { Alert.alert('ERROR', e.message); }
    setSavingEdit(false);
  }

  // Timeline: start/due date changes — auto-save on every change
  async function handleStartDateChange(iso: string | null) {
    try {
      const updated = await updateTask(task.id, { start_date: iso || '' });
      upsertTask(updated);
    } catch (e: any) { Alert.alert('ERROR', e.message); }
  }

  async function handleDueDateChange(iso: string | null) {
    try {
      const updated = await updateTask(task.id, { due_date: iso || '' });
      upsertTask(updated);
    } catch (e: any) { Alert.alert('ERROR', e.message); }
  }

  // AI subtask suggestions
  async function handleSuggestSubtasks() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      Alert.alert('NO API KEY', 'Add your Anthropic API key in Settings to use AI suggestions.');
      return;
    }
    setSuggestLoading(true);
    try {
      const res = await suggestSubtasks({
        device_id: deviceId,
        api_key: apiKey,
        task_id: task.task_id,
        task_title: task.title,
        done_criteria: task.done_criteria,
        current_notes: task.notes,
      });

      if (res.status === 'pending') {
        // Claude timed out — backend queued a retry job (fires in ~5h).
        // Don't silently show an empty list; tell the user what happened.
        Alert.alert(
          'QUEUED',
          res.message || 'Claude is unavailable right now. Your request was queued and will retry automatically.'
        );
        return;
      }

      const newSubtasks: string[] = res.result?.subtasks || [];
      if (newSubtasks.length === 0) {
        Alert.alert('NO SUGGESTIONS', 'The AI did not return any subtasks. Try again.');
        return;
      }

      setSubtasks(newSubtasks);
      await patchSubtasksApi(task.id, newSubtasks);
      upsertTask({ ...task, subtasks: newSubtasks });
    } catch (e: any) {
      Alert.alert('AI ERROR', e.message);
    }
    setSuggestLoading(false);
  }

  // Toggle subtask done (local only - prefix with ✓)
  function toggleSubtask(idx: number) {
    const updated = [...subtasks];
    const item = updated[idx];
    updated[idx] = item.startsWith('✓ ') ? item.slice(2) : '✓ ' + item;
    setSubtasks(updated);
    upsertTask({ ...task, subtasks: updated });
  }

  const latestLog = taskLogs[0];
  const ev = latestLog?.ai_eval;
  const sc = statusColor(task.status, C);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}>

        {/* Breadcrumb */}
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: S.sm }}>
          SPRINT → W{task.week_num} → {task.task_id}
        </Text>

        {/* Header card */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: sc,
          backgroundColor: C.surface, marginBottom: S.sm,
        }}>
          <View style={{ height: 3, backgroundColor: sc }} />
          <View style={{ padding: S.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: S.sm }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: '900', color: C.orange, letterSpacing: 1 }}>
                TASK {task.task_id}
              </Text>
              <TouchableOpacity
                onPress={() => { setEditTitle(task.title); setEditDetail(task.detail); setEditCriteria(task.done_criteria); setEditOpen(true); }}
                style={{ borderWidth: 1, borderColor: C.border, padding: S.xs, paddingHorizontal: S.sm, minHeight: 32, justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary, letterSpacing: 1 }}>✎ EDIT</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: '900', color: C.white, marginBottom: S.xs, lineHeight: 22 }}>
              {task.title}
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSecondary, marginBottom: S.md }}>
              {task.detail}
            </Text>
            <StatusCycleBtn status={task.status} onCycle={handleCycleStatus} />
          </View>
        </View>

        {/* Done criteria */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: C.border,
          backgroundColor: C.surfaceHigh, padding: S.md, marginBottom: S.sm,
        }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 2, textTransform: 'uppercase', marginBottom: S.sm }}>
            ✓ DEFINITION OF DONE
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.white, lineHeight: 22 }}>
            {task.done_criteria}
          </Text>
        </View>

        {/* Timeline */}
        <BrutalBox style={{ padding: S.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
            <SectionLabel color={C.orange}>TIMELINE</SectionLabel>
            {(() => {
              const urgency = getTimelineUrgency(task);
              const label = timelineUrgencyLabel(urgency, task);
              if (urgency === 'no_date' || urgency === 'done') return null;
              return <TimelineBadge label={label} color={timelineUrgencyColor(urgency, C)} />;
            })()}
          </View>

          <View style={{ marginBottom: S.md }}>
            <DateStepper
              label="Start Date"
              value={task.start_date}
              onChange={handleStartDateChange}
              accent={C.textSecondary}
            />
          </View>

          <DateStepper
            label="Due Date"
            value={task.due_date}
            onChange={handleDueDateChange}
            accent={timelineUrgencyColor(getTimelineUrgency(task), C)}
          />

          {task.start_date && task.due_date && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: S.sm, textAlign: 'center' }}>
              {Math.max(0, Math.round((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / 86400000))} day window
            </Text>
          )}
        </BrutalBox>

        {/* Notes */}
        <BrutalBox style={{ padding: S.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
            <SectionLabel>SESSION NOTES</SectionLabel>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: savingNotes ? C.orange : C.textDim }}>
              {savingNotes ? 'SAVING...' : 'AUTO-SAVED'}
            </Text>
          </View>
          <TextInput
            value={notes}
            onChangeText={handleNotesChange}
            placeholder="Commit hashes, parameter values, test results, blockers..."
            placeholderTextColor={C.textDim}
            multiline
            numberOfLines={5}
            style={{
              backgroundColor: C.surfaceHigh,
              borderWidth: C.BORDER_W,
              borderColor: C.border,
              color: C.white,
              fontFamily: FONT.mono,
              fontSize: 13,
              padding: S.md,
              minHeight: 120,
              textAlignVertical: 'top',
              lineHeight: 20,
            }}
          />
        </BrutalBox>

        {/* AI Subtasks */}
        <BrutalBox style={{ padding: S.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
            <SectionLabel color={C.orange}>AI SUBTASK SUGGESTIONS</SectionLabel>
            <TouchableOpacity
              onPress={handleSuggestSubtasks}
              disabled={suggestLoading}
              style={{
                borderWidth: 1, borderColor: C.orange,
                backgroundColor: C.orangeGhost,
                paddingHorizontal: S.sm, paddingVertical: S.xs,
                minHeight: 32, justifyContent: 'center',
                opacity: suggestLoading ? 0.5 : 1,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 1.5 }}>
                {suggestLoading ? 'THINKING...' : '◈ SUGGEST'}
              </Text>
            </TouchableOpacity>
          </View>

          {subtasks.length === 0 ? (
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, textAlign: 'center', paddingVertical: S.md }}>
              TAP SUGGEST TO GENERATE AI SUBTASKS
            </Text>
          ) : (
            subtasks.map((s, i) => {
              const done = s.startsWith('✓ ');
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => toggleSubtask(i)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: S.sm,
                    paddingVertical: S.sm, minHeight: S.tapMin,
                    borderBottomWidth: 1, borderBottomColor: C.border,
                  }}>
                  <View style={{
                    width: 18, height: 18, marginTop: 2,
                    borderWidth: 1.5,
                    borderColor: done ? C.green : C.border,
                    backgroundColor: done ? C.greenGhost : 'transparent',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {done && <Text style={{ color: C.green, fontSize: 11, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={{
                    fontFamily: FONT.mono, fontSize: 12, flex: 1, lineHeight: 18,
                    color: done ? C.textDim : C.textSecondary,
                    textDecorationLine: done ? 'line-through' : 'none',
                  }}>
                    {done ? s.slice(2) : s}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </BrutalBox>

        {/* Latest AI eval from logs */}
        {ev && (
          <View style={{ borderWidth: C.BORDER_W, borderColor: C.orange, backgroundColor: C.surface, marginBottom: S.sm }}>
            <View style={{ padding: S.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.orange, letterSpacing: 2 }}>
                ◈ LATEST EVAL — {latestLog.date}
              </Text>
            </View>
            <View style={{ padding: S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, marginBottom: S.sm }}>
                <Text style={{
                  fontFamily: FONT.mono, fontSize: 32, fontWeight: '900',
                  color: ev.completion_pct >= 80 ? C.green : ev.completion_pct >= 40 ? C.orange : C.amber,
                }}>
                  {ev.completion_pct}%
                </Text>
                <View style={{ flex: 1 }}>
                  <BrutalBar
                    pct={ev.completion_pct}
                    color={ev.completion_pct >= 80 ? C.green : ev.completion_pct >= 40 ? C.orange : C.amber}
                    height={4}
                  />
                  <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {ev.momentum} MOMENTUM
                  </Text>
                </View>
              </View>
              <View style={{ borderWidth: 1, borderColor: `${C.amber}44`, backgroundColor: C.amberGhost, padding: S.sm }}>
                <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  ▲ PRIORITY
                </Text>
                <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.white, lineHeight: 18 }}>
                  {ev.top_concern}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* No completed eval yet — show WHY instead of nothing */}
        {!ev && latestLog && (
          <View style={{
            borderWidth: C.BORDER_W,
            borderColor: latestLog.eval_status === 'failed' ? C.red : C.amber,
            backgroundColor: C.surface, marginBottom: S.sm,
          }}>
            <View style={{ padding: S.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: latestLog.eval_status === 'failed' ? C.red : C.amber, letterSpacing: 2 }}>
                ◈ LATEST EVAL — {latestLog.date}
              </Text>
              <EvalStatusBadge log={latestLog} />
            </View>
            <View style={{ paddingHorizontal: S.md, paddingBottom: S.md }}>
              <EvalStatusDetail log={latestLog} />
            </View>
          </View>
        )}

        {/* Session history */}
        {taskLogs.length > 0 && (
          <BrutalBox style={{ padding: S.md }}>
            <SectionLabel>SESSION HISTORY</SectionLabel>
            {taskLogs.slice(0, 5).map((log, i) => (
              <View key={log.id} style={{
                paddingBottom: S.sm, marginBottom: S.sm,
                borderBottomWidth: i < Math.min(taskLogs.length, 5) - 1 ? 1 : 0,
                borderBottomColor: C.border,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.white, fontWeight: '700' }}>{log.date}</Text>
                  <EvalStatusBadge log={log} />
                </View>
                <EvalStatusDetail log={log} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: log.blocker ? 4 : 0 }}>
                  {Object.entries(log.checks || {})
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <View key={k} style={{ borderWidth: 1, borderColor: `${C.green}44`, backgroundColor: C.greenGhost, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.green }}>{k}</Text>
                      </View>
                    ))}
                </View>
                {log.blocker && (
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, marginTop: 2 }}>
                    ⚡ {log.blocker}
                  </Text>
                )}
                {log.tomorrow_task && (
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    → {log.tomorrow_task}
                  </Text>
                )}
              </View>
            ))}
          </BrutalBox>
        )}

      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: '#000000ee', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: C.bg,
            borderTopWidth: C.BORDER_W, borderTopColor: C.orange,
            padding: S.md, maxHeight: '85%',
          }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
                <Text style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: '900', color: C.orange, letterSpacing: 2 }}>
                  EDIT TASK {task.task_id}
                </Text>
                <TouchableOpacity onPress={() => setEditOpen(false)} style={{ padding: S.sm, minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: C.textDim, fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {[
                { label: 'TITLE',         val: editTitle,    set: setEditTitle,    multi: false, rows: 1 },
                { label: 'DETAIL',        val: editDetail,   set: setEditDetail,   multi: true,  rows: 2 },
                { label: 'DONE CRITERIA', val: editCriteria, set: setEditCriteria, multi: true,  rows: 3 },
              ].map((f) => (
                <View key={f.label} style={{ marginBottom: S.md }}>
                  <SectionLabel>{f.label}</SectionLabel>
                  <TextInput
                    value={f.val}
                    onChangeText={f.set}
                    multiline={f.multi}
                    numberOfLines={f.rows}
                    style={{
                      backgroundColor: C.surfaceHigh,
                      borderWidth: C.BORDER_W, borderColor: C.border,
                      color: C.white, fontFamily: FONT.mono, fontSize: 13,
                      padding: S.md, minHeight: f.multi ? f.rows * 24 + S.md * 2 : S.tapMin,
                      textAlignVertical: f.multi ? 'top' : 'center',
                    }}
                    placeholderTextColor={C.textDim}
                  />
                </View>
              ))}

              <BrutalBtn
                label={savingEdit ? 'SAVING...' : 'SAVE CHANGES'}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              />
              <View style={{ height: S.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
