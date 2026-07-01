import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity,
  Modal, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, getWeekProgress, statusColor, statusLabel, getTimelineUrgency, timelineUrgencyColor, timelineUrgencyLabel } from '../../lib/store';
import {
  BrutalBox, BrutalBtn, BrutalBar, SectionLabel,
  Mono, TagPill, Divider, BrutalInput, StatusCycleBtn, Spinner,
  TimelineBadge, CheckRow,
} from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';
import {
  createTask, deleteTask, updateTask, suggestWeekPlan, suggestWeekTasks,
  getApiKey, createWeek, updateWeek, deleteWeek,
} from '../../lib/api';

interface TaskSuggestion { title: string; detail: string; done_criteria: string; }

interface TaskFormData {
  task_id: string; title: string; detail: string; done_criteria: string;
}

const EMPTY_FORM: TaskFormData = { task_id: '', title: '', detail: '', done_criteria: '' };

export default function SprintScreen() {
  const router = useRouter();
  const { tasks, weeks, activeWeek, setActiveWeek, deviceId, upsertTask, removeTask, upsertWeek, removeWeek } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [weekPlan, setWeekPlan] = useState<any>(null);
  const [planError, setPlanError] = useState('');

  const [agenda, setAgendaState] = useState('');
  const [agendaSaving, setAgendaSaving] = useState(false);
  const agendaTimer = useRef<any>(null);

  const [suggestTasksLoading, setSuggestTasksLoading] = useState(false);
  const [suggestTasksError, setSuggestTasksError] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState<TaskSuggestion[] | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<boolean[]>([]);
  const [addingSuggested, setAddingSuggested] = useState(false);

  const weekTasks = tasks
    .filter((t) => t.week_num === activeWeek)
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
  const progress = getWeekProgress(tasks, activeWeek);
  const weekMeta = weeks.find((w) => w.num === activeWeek) || { num: activeWeek, title: 'Untitled Week', hours: 0, agenda: '' };

  // Clear a stale plan/suggestions when switching weeks so nothing ever
  // looks like it belongs to the wrong week
  useEffect(() => {
    setWeekPlan(null);
    setPlanError('');
    setSuggestedTasks(null);
    setSuggestTasksError('');
    setAgendaState(weeks.find((w) => w.num === activeWeek)?.agenda || '');
  }, [activeWeek]);

  function handleAgendaChange(v: string) {
    setAgendaState(v);
    clearTimeout(agendaTimer.current);
    agendaTimer.current = setTimeout(async () => {
      const week = weeks.find((w) => w.num === activeWeek);
      if (!week) return;
      setAgendaSaving(true);
      try {
        const updated = await updateWeek(week.id, { agenda: v });
        upsertWeek(updated);
      } catch {}
      setAgendaSaving(false);
    }, 800);
  }

  async function handleAddWeek() {
    const nextNum = weeks.length > 0 ? Math.max(...weeks.map((w) => w.num)) + 1 : 1;
    try {
      const week = await createWeek({
        device_id: deviceId,
        title: `Week ${nextNum}`,
      });
      upsertWeek(week);
      setActiveWeek(week.num);
      Alert.alert('WEEK ADDED', `Week ${week.num} created. Tap its title to rename it.`);
    } catch (e: any) {
      Alert.alert('ERROR', e.message);
    }
  }

  async function handleDeleteWeek() {
    const week = weeks.find((w) => w.num === activeWeek);
    if (!week) return;

    Alert.alert(
      'DELETE WEEK',
      `Delete Week ${week.num} (${week.title})? This cannot be undone.`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'DELETE', style: 'destructive',
          onPress: async () => {
            try {
              await deleteWeek(week.id);
              removeWeek(week.id);
              const remaining = weeks.filter((w) => w.id !== week.id);
              if (remaining.length > 0) {
                setActiveWeek(remaining[0].num);
              }
            } catch (e: any) {
              Alert.alert('CANNOT DELETE', e.message);
            }
          },
        },
      ]
    );
  }

  async function handleSuggestWeekPlan() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      Alert.alert('NO API KEY', 'Add your AI API key in Settings to use week planning.');
      return;
    }
    if (weekTasks.length === 0) {
      Alert.alert('NO TASKS', 'Add at least one task to this week before requesting a plan.');
      return;
    }
    setPlanLoading(true);
    setPlanError('');
    try {
      const res = await suggestWeekPlan({
        device_id: deviceId,
        api_key: apiKey,
        week_num: activeWeek,
        week_title: weekMeta.title,
        tasks: weekTasks.map((t) => ({
          task_id: t.task_id, title: t.title, status: t.status,
          due_date: t.due_date || null,
        })),
      });

      if (res.status === 'pending') {
        setPlanError(res.message || 'AI unavailable — queued, will retry in ~5 hours.');
        return;
      }

      setWeekPlan(res.result);
    } catch (e: any) {
      setPlanError(e.message);
    }
    setPlanLoading(false);
  }

  async function handleSuggestTasks() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      Alert.alert('NO API KEY', 'Add your AI API key in Settings to use AI task suggestions.');
      return;
    }
    if (!agenda.trim()) {
      Alert.alert('NO AGENDA', "Add this week's agenda above before asking AI for task suggestions.");
      return;
    }
    setSuggestTasksLoading(true);
    setSuggestTasksError('');
    setSuggestedTasks(null);
    try {
      const res = await suggestWeekTasks({
        device_id: deviceId,
        api_key: apiKey,
        week_num: activeWeek,
        week_title: weekMeta.title,
        agenda: agenda.trim(),
        tasks: weekTasks.map((t) => ({
          task_id: t.task_id, title: t.title, status: t.status,
          due_date: t.due_date || null,
        })),
      });

      if (res.status === 'pending') {
        setSuggestTasksError(res.message || 'AI unavailable — queued, will retry in ~5 hours.');
        return;
      }

      const suggestions: TaskSuggestion[] = res.result?.tasks || [];
      if (suggestions.length === 0) {
        setSuggestTasksError('The AI did not return any task suggestions. Try again.');
        return;
      }
      setSuggestedTasks(suggestions);
      setSelectedSuggestions(suggestions.map(() => true));
    } catch (e: any) {
      setSuggestTasksError(e.message);
    }
    setSuggestTasksLoading(false);
  }

  function toggleSuggestion(i: number) {
    setSelectedSuggestions((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }

  async function handleAddSelectedSuggestions() {
    if (!suggestedTasks) return;
    const toAdd = suggestedTasks.filter((_, i) => selectedSuggestions[i]);
    if (toAdd.length === 0) {
      Alert.alert('NOTHING SELECTED', 'Select at least one suggested task to add.');
      return;
    }
    setAddingSuggested(true);
    try {
      const existingNums = weekTasks
        .map((t) => t.task_id.split('.'))
        .filter((p) => p.length === 2 && p[0] === String(activeWeek))
        .map((p) => parseInt(p[1], 10))
        .filter((n) => !isNaN(n));
      let counter = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

      for (const s of toAdd) {
        const task = await createTask({
          device_id: deviceId, week_num: activeWeek,
          task_id: `${activeWeek}.${counter}`,
          title: s.title, detail: s.detail, done_criteria: s.done_criteria,
        });
        upsertTask(task);
        counter++;
      }
      setSuggestedTasks(null);
      Alert.alert('TASKS ADDED', `${toAdd.length} task(s) added to Week ${activeWeek}.`);
    } catch (e: any) {
      Alert.alert('ERROR', e.message);
    }
    setAddingSuggested(false);
  }

  async function handleAddTask() {
    if (!form.task_id || !form.title || !form.done_criteria) {
      Alert.alert('MISSING FIELDS', 'Task ID, title, and done criteria are required.');
      return;
    }
    setSaving(true);
    try {
      const task = await createTask({
        device_id: deviceId, week_num: activeWeek,
        task_id: form.task_id, title: form.title,
        detail: form.detail, done_criteria: form.done_criteria,
      });
      upsertTask(task);
      setForm(EMPTY_FORM);
      setShowAddModal(false);
    } catch (e: any) {
      Alert.alert('ERROR', e.message);
    }
    setSaving(false);
  }

  async function handleDeleteTask(mongoId: string, title: string) {
    Alert.alert('DELETE TASK', `Delete "${title}"?`, [
      { text: 'CANCEL', style: 'cancel' },
      {
        text: 'DELETE', style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(mongoId);
            removeTask(mongoId);
          } catch (e: any) { Alert.alert('ERROR', e.message); }
        },
      },
    ]);
  }

  async function handleCycleStatus(task: any) {
    const order = ['todo', 'inprogress', 'done', 'blocked'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    try {
      const updated = await updateTask(task.id, { status: next });
      upsertTask(updated);
    } catch (e: any) { Alert.alert('ERROR', e.message); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>

      {/* Week Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 64 }}
        contentContainerStyle={{ paddingHorizontal: S.md, paddingVertical: S.sm, gap: S.xs }}>
        {weeks.map((w) => {
          const p = getWeekProgress(tasks, w.num);
          const active = w.num === activeWeek;
          return (
            <TouchableOpacity
              key={w.id}
              onPress={() => setActiveWeek(w.num)}
              style={{
                borderWidth: C.BORDER_W,
                borderColor: active ? C.orange : C.border,
                backgroundColor: active ? C.orangeGhost : C.surface,
                paddingHorizontal: S.md,
                paddingVertical: S.sm,
                alignItems: 'center',
                minWidth: 60,
                minHeight: 48,
                justifyContent: 'center',
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: '900', color: active ? C.orange : C.textSecondary }}>
                W{w.num}
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: p.done === p.total ? C.green : C.textDim, marginTop: 1 }}>
                {p.done}/{p.total}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Add a new sprint week */}
        <TouchableOpacity
          onPress={handleAddWeek}
          style={{
            borderWidth: C.BORDER_W, borderColor: C.border, borderStyle: 'dashed',
            paddingHorizontal: S.md, paddingVertical: S.sm,
            alignItems: 'center', justifyContent: 'center',
            minWidth: 56, minHeight: 48,
          }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 18, color: C.textDim, fontWeight: '900' }}>+</Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 8, color: C.textDim, marginTop: 1 }}>ADD</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}>

        {/* Week Header */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: C.border,
          backgroundColor: C.surface, padding: S.md, marginBottom: S.sm,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: S.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 2, textTransform: 'uppercase' }}>
                WEEK {activeWeek}
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: '900', color: C.white, marginTop: 2 }}>
                {weekMeta.title}
              </Text>
            </View>
            <TagPill label={`${weekMeta.hours}H`} color={C.amber} bg={C.amberGhost} />
          </View>
          {(weeks.find((w) => w.num === activeWeek)?.is_custom) && (
            <TouchableOpacity
              onPress={handleDeleteWeek}
              style={{ alignSelf: 'flex-start', marginBottom: S.sm, padding: 4 }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, letterSpacing: 1 }}>
                ✕ DELETE THIS WEEK
              </Text>
            </TouchableOpacity>
          )}
          <BrutalBar pct={progress.pct} color={progress.pct === 100 ? C.green : C.orange} height={4} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: 4, marginBottom: S.sm }}>
            {progress.done} OF {progress.total} COMPLETE · {progress.pct}%
          </Text>

          <TouchableOpacity
            onPress={handleSuggestWeekPlan}
            disabled={planLoading}
            style={{
              borderWidth: C.BORDER_W, borderColor: C.orange,
              backgroundColor: C.orangeGhost,
              paddingVertical: S.sm, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: S.sm, minHeight: S.tapMin,
              opacity: planLoading ? 0.5 : 1,
            }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: '900', color: C.orange, letterSpacing: 1 }}>
              {planLoading ? '◈ THINKING...' : '◈ PLAN MY WEEK'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Week Agenda — free-text description of what this week is about,
            used as the grounding context for AI task suggestions below */}
        <BrutalBox style={{ padding: S.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
            <SectionLabel color={C.orange}>WEEK AGENDA</SectionLabel>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: agendaSaving ? C.orange : C.textDim }}>
              {agendaSaving ? 'SAVING...' : 'AUTO-SAVED'}
            </Text>
          </View>
          <BrutalInput
            value={agenda}
            onChangeText={handleAgendaChange}
            placeholder="What's this week actually about? e.g. Get the EKF publishing at 50Hz and validate against the DVL ground truth."
            multiline
            rows={3}
          />
          <View style={{ marginTop: S.sm }}>
            <TouchableOpacity
              onPress={handleSuggestTasks}
              disabled={suggestTasksLoading}
              style={{
                borderWidth: C.BORDER_W, borderColor: C.purple,
                backgroundColor: C.purpleGhost,
                paddingVertical: S.sm, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: S.sm, minHeight: S.tapMin,
                opacity: suggestTasksLoading ? 0.5 : 1,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: '900', color: C.purple, letterSpacing: 1 }}>
                {suggestTasksLoading ? '◈ THINKING...' : '◈ SUGGEST TASKS FROM AGENDA'}
              </Text>
            </TouchableOpacity>
          </View>
        </BrutalBox>

        {/* Suggested tasks — error/pending state */}
        {suggestTasksError !== '' && (
          <View style={{
            borderWidth: C.BORDER_W, borderColor: C.amber, backgroundColor: C.amberGhost,
            padding: S.md, marginBottom: S.sm,
          }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, lineHeight: 17 }}>
              {suggestTasksError}
            </Text>
          </View>
        )}

        {/* Suggested tasks — review + selective add */}
        {suggestedTasks && (
          <View style={{
            borderWidth: C.BORDER_W, borderColor: C.purple,
            backgroundColor: C.surface, marginBottom: S.sm,
          }}>
            <View style={{
              padding: S.md, borderBottomWidth: 1, borderBottomColor: C.border,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.purple, letterSpacing: 2 }}>
                ◈ SUGGESTED TASKS
              </Text>
              <TouchableOpacity onPress={() => setSuggestedTasks(null)} style={{ padding: S.sm, minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: C.textDim, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: S.md }}>
              {suggestedTasks.map((s, i) => (
                <CheckRow
                  key={i}
                  label={`${s.title} — ${s.done_criteria}`}
                  checked={selectedSuggestions[i]}
                  onToggle={() => toggleSuggestion(i)}
                />
              ))}
            </View>

            <View style={{ padding: S.md }}>
              <BrutalBtn
                label={addingSuggested ? 'ADDING...' : `ADD SELECTED (${selectedSuggestions.filter(Boolean).length})`}
                onPress={handleAddSelectedSuggestions}
                disabled={addingSuggested || selectedSuggestions.every((s) => !s)}
                color={C.purple}
              />
            </View>
          </View>
        )}

        {/* Week plan error/pending state */}
        {planError !== '' && (
          <View style={{
            borderWidth: C.BORDER_W, borderColor: C.amber, backgroundColor: C.amberGhost,
            padding: S.md, marginBottom: S.sm,
          }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, lineHeight: 17 }}>
              {planError}
            </Text>
          </View>
        )}

        {/* Week plan result */}
        {weekPlan && (
          <View style={{
            borderWidth: C.BORDER_W,
            borderColor: weekPlan.week_outlook === 'at_risk' ? C.red : weekPlan.week_outlook === 'tight' ? C.amber : C.green,
            backgroundColor: C.surface, marginBottom: S.sm,
          }}>
            <View style={{
              padding: S.md, borderBottomWidth: 1, borderBottomColor: C.border,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.orange, letterSpacing: 2 }}>
                ◈ WEEK {activeWeek} PLAN
              </Text>
              <TagPill
                label={weekPlan.week_outlook?.replace('_', ' ') || ''}
                color={weekPlan.week_outlook === 'at_risk' ? C.red : weekPlan.week_outlook === 'tight' ? C.amber : C.green}
                bg={weekPlan.week_outlook === 'at_risk' ? C.redGhost : weekPlan.week_outlook === 'tight' ? C.amberGhost : C.greenGhost}
              />
            </View>

            <View style={{ padding: S.md }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSecondary, lineHeight: 19, marginBottom: S.md }}>
                {weekPlan.summary}
              </Text>

              {weekPlan.focus_today?.length > 0 && (
                <View style={{ marginBottom: S.md }}>
                  <SectionLabel color={C.green}>FOCUS TODAY</SectionLabel>
                  {weekPlan.focus_today.map((item: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: S.sm, marginBottom: 6, alignItems: 'flex-start' }}>
                      <Text style={{ color: C.green, fontSize: 13 }}>▸</Text>
                      <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textPrimary, flex: 1, lineHeight: 18 }}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {weekPlan.at_risk?.length > 0 && (
                <View style={{ marginBottom: S.md }}>
                  <SectionLabel color={C.red}>AT RISK</SectionLabel>
                  {weekPlan.at_risk.map((item: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: S.sm, marginBottom: 6, alignItems: 'flex-start' }}>
                      <Text style={{ color: C.red, fontSize: 13 }}>⚠</Text>
                      <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 18 }}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {weekPlan.sequencing_note && (
                <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHigh, padding: S.sm }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, letterSpacing: 1, marginBottom: 4 }}>
                    SEQUENCING
                  </Text>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, lineHeight: 17 }}>
                    {weekPlan.sequencing_note}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Task List */}
        {weekTasks.map((task) => (
          <View key={task.id} style={{
            borderWidth: C.BORDER_W,
            borderColor: task.status === 'inprogress' ? C.orange : C.border,
            backgroundColor: C.surface, marginBottom: S.sm,
          }}>
            {/* Orange accent top bar for in-progress */}
            {task.status === 'inprogress' && (
              <View style={{ height: 2, backgroundColor: C.orange }} />
            )}
            <TouchableOpacity
              onPress={() => router.push(`/task/${task.id}`)}
              activeOpacity={0.8}
              style={{ padding: S.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, flex: 1 }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: '900', color: C.orange }}>
                    {task.task_id}
                  </Text>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: '700', color: C.white, flex: 1 }} numberOfLines={2}>
                    {task.title}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: C.textDim, marginLeft: S.sm }}>›</Text>
              </View>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginBottom: 8 }}>
                {task.detail}
              </Text>
              {(() => {
                const urgency = getTimelineUrgency(task);
                if (urgency === 'no_date' || urgency === 'done') return null;
                return (
                  <View style={{ marginBottom: 8, alignSelf: 'flex-start' }}>
                    <TimelineBadge
                      label={timelineUrgencyLabel(urgency, task)}
                      color={timelineUrgencyColor(urgency, C)}
                    />
                  </View>
                );
              })()}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <StatusCycleBtn status={task.status} onCycle={() => handleCycleStatus(task)} />
                <TouchableOpacity
                  onPress={() => handleDeleteTask(task.id, task.title)}
                  style={{ padding: S.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim }}>✕ DEL</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {weekTasks.length === 0 && (
          <View style={{ alignItems: 'center', padding: S.xl }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, letterSpacing: 2 }}>
              NO TASKS THIS WEEK
            </Text>
          </View>
        )}

        {/* Add Task */}
        <BrutalBtn label="+ ADD TASK" onPress={() => setShowAddModal(true)} outline color={C.orange} />

      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: '#000000dd', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: C.bg, borderTopWidth: C.BORDER_W,
            borderTopColor: C.orange, padding: S.md,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: '900', color: C.orange, letterSpacing: 2 }}>
                ADD TASK — WEEK {activeWeek}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={{ padding: S.sm }}>
                <Text style={{ color: C.textDim, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {([
              { key: 'task_id', label: 'TASK ID (e.g. 1.6)', multiline: false },
              { key: 'title', label: 'TITLE', multiline: false },
              { key: 'detail', label: 'DETAIL', multiline: true },
              { key: 'done_criteria', label: 'DONE CRITERIA', multiline: true },
            ] as const).map((f) => (
              <View key={f.key} style={{ marginBottom: S.sm }}>
                <SectionLabel>{f.label}</SectionLabel>
                <BrutalInput
                  value={form[f.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  multiline={f.multiline}
                  rows={f.multiline ? 2 : 1}
                />
              </View>
            ))}

            <BrutalBtn
              label={saving ? 'SAVING...' : 'SAVE TASK'}
              onPress={handleAddTask}
              disabled={saving}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
