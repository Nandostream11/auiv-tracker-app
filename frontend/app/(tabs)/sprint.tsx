import React, { useState, useCallback } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity,
  Modal, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, getWeekProgress, statusColor, statusLabel } from '../../lib/store';
import {
  BrutalBox, BrutalBtn, BrutalBar, SectionLabel,
  Mono, TagPill, Divider, BrutalInput, StatusCycleBtn, Spinner,
} from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';
import { createTask, deleteTask, updateTask } from '../../lib/api';

const WEEKS = [
  { num: 1, title: 'Infrastructure & Vehicle Model', hours: 12 },
  { num: 2, title: 'Sensor Plugin Integration',      hours: 13 },
  { num: 3, title: 'EKF Localization',               hours: 13 },
  { num: 4, title: 'Autonomy Tree & Mission Logic',  hours: 12 },
  { num: 5, title: 'Integration & Ground-Truth',     hours: 13 },
  { num: 6, title: 'Final Demo, CI & Docs',          hours: 12 },
];

interface TaskFormData {
  task_id: string; title: string; detail: string; done_criteria: string;
}

const EMPTY_FORM: TaskFormData = { task_id: '', title: '', detail: '', done_criteria: '' };

export default function SprintScreen() {
  const router = useRouter();
  const { tasks, activeWeek, setActiveWeek, deviceId, upsertTask, removeTask } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const weekTasks = tasks
    .filter((t) => t.week_num === activeWeek)
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
  const progress = getWeekProgress(tasks, activeWeek);
  const weekMeta = WEEKS[activeWeek - 1];

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
        {WEEKS.map((w) => {
          const p = getWeekProgress(tasks, w.num);
          const active = w.num === activeWeek;
          return (
            <TouchableOpacity
              key={w.num}
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
          <BrutalBar pct={progress.pct} color={progress.pct === 100 ? C.green : C.orange} height={4} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: 4 }}>
            {progress.done} OF {progress.total} COMPLETE · {progress.pct}%
          </Text>
        </View>

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
