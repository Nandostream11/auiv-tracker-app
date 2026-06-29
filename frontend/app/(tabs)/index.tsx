import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useStore, getWeekProgress, calcStreak, calcBestStreak, todayKey,
  getFocusTasks, getBurndownData, getBurndownStatus, calcXP, getLevelInfo,
  STREAK_MILESTONES,
} from '../../lib/store';
import {
  BrutalBox, MetricBlock, BrutalBar, SectionLabel,
  Mono, TagPill, Divider, StreakCalendar,
  FocusTaskCard, BurndownChart, LevelBadge, MilestoneBanner, EmptyState,
} from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';

const RED_FLAGS = [
  { week: 2, text: 'All 4 sensor topics not publishing → Drop sonar' },
  { week: 3, text: 'EKF not at 50 Hz → Hand-rolled 9-state Python EKF' },
  { week: 4, text: 'Fewer than 3 BT nodes green → Flat Python state machine' },
  { week: 5, text: 'Run 1 RMS > 2.0 m → Fix DVL noise model first' },
];

const DISMISSED_MILESTONES_KEY = 'auiv_dismissed_milestones';

export default function OverviewScreen() {
  const router = useRouter();
  const { tasks, logs, weeks, setActiveWeek } = useStore();

  const [dismissedMilestones, setDismissedMilestones] = useState<number[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_MILESTONES_KEY).then((raw) => {
      if (raw) {
        try { setDismissedMilestones(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  async function dismissMilestone(m: number) {
    const next = [...dismissedMilestones, m];
    setDismissedMilestones(next);
    await AsyncStorage.setItem(DISMISSED_MILESTONES_KEY, JSON.stringify(next));
  }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProg = tasks.filter((t) => t.status === 'inprogress').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const overallPct = total ? Math.round((done / total) * 100) : 0;
  const streak = calcStreak(logs);
  const bestStreak = calcBestStreak(logs);
  const loggedDates = new Set(logs.map((l) => l.date));
  const todayDone = logs.some((l) => l.date === todayKey());
  const recentLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  const focusTasks = getFocusTasks(tasks);
  const burndownPoints = getBurndownData(tasks, weeks);
  const burndownStatus = getBurndownStatus(burndownPoints);
  const xp = calcXP(tasks, logs);
  const levelInfo = getLevelInfo(xp);

  const reachedMilestone = STREAK_MILESTONES.find(
    (m) => m === streak && !dismissedMilestones.includes(m)
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}>

        {/* Milestone celebration — only ever a positive event, never a penalty */}
        {reachedMilestone && (
          <MilestoneBanner streak={reachedMilestone} onDismiss={() => dismissMilestone(reachedMilestone)} />
        )}

        {/* Focus Today — the single most important addition: tells you what
            to actually do right now, not just where things stand */}
        <BrutalBox style={{ padding: S.md, borderColor: C.orange }}>
          <SectionLabel color={C.orange}>◉ FOCUS TODAY</SectionLabel>
          {focusTasks.length === 0 ? (
            <View style={{ paddingVertical: S.md, alignItems: 'center' }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, textAlign: 'center', lineHeight: 18 }}>
                {total === 0 ? 'No tasks yet — add some in Sprint.' : 'Nothing urgent. Pick anything in Sprint to keep moving.'}
              </Text>
            </View>
          ) : (
            focusTasks.map((t) => (
              <FocusTaskCard
                key={t.id}
                task={t}
                onPress={() => router.push(`/task/${t.id}`)}
              />
            ))
          )}
        </BrutalBox>

        {/* Level / XP — reward-only progression */}
        <View style={{ marginBottom: S.sm }}>
          <LevelBadge levelInfo={levelInfo} />
        </View>

        {/* Mission Banner */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: C.orange,
          backgroundColor: C.surface, padding: S.md, marginBottom: S.sm,
        }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.orange, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            ACTIVE MISSION
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: '900', color: C.white, marginBottom: 4 }}>
            AUIV SIMULATOR
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary }}>
            20 m transect · EKF RMS ≤ 0.5 m · pytest exits 0
          </Text>
          <View style={{ marginTop: S.md }}>
            <BrutalBar pct={overallPct} color={overallPct === 100 ? C.green : C.orange} height={6} />
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: 4 }}>
              {done}/{total} TASKS — {overallPct}%
            </Text>
          </View>
        </View>

        {/* Streak card with calendar */}
        <View style={{
          borderWidth: C.BORDER_W, borderColor: streak >= 3 ? C.amber : C.border,
          backgroundColor: C.surface, padding: S.md, marginBottom: S.sm,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: S.md }}>
            <View>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                CURRENT STREAK
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontFamily: FONT.mono, fontSize: 40, fontWeight: '900', color: streak >= 3 ? C.amber : C.orange, lineHeight: 42 }}>
                  {streak}
                </Text>
                <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.textDim }}>
                  {streak === 1 ? 'DAY' : 'DAYS'}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                BEST
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 20, fontWeight: '700', color: C.textSecondary }}>
                {bestStreak}
              </Text>
            </View>
          </View>

          <StreakCalendar loggedDates={loggedDates} />
        </View>

        {/* Task metrics row */}
        <View style={{ flexDirection: 'row', gap: 0, marginBottom: S.sm }}>
          <MetricBlock value={done}   label="DONE"   color={C.green} />
          <MetricBlock value={inProg} label="ACTIVE" color={C.orange} />
          <MetricBlock value={blocked} label="BLOCKED" color={blocked > 0 ? C.red : C.textDim} />
        </View>

        {/* Today's standup nudge */}
        {!todayDone && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/daily')}
            style={{
              borderWidth: C.BORDER_W, borderColor: C.amber,
              backgroundColor: C.amberGhost, padding: S.md,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: S.sm,
            }}>
            <View>
              <Text style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: '700', color: C.amber }}>
                NO STANDUP TODAY
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary, marginTop: 2 }}>
                TAP TO RUN DAILY CHECKLIST
              </Text>
            </View>
            <Text style={{ color: C.amber, fontSize: 20 }}>→</Text>
          </TouchableOpacity>
        )}

        {/* Sprint Burndown — the defining feature of every serious sprint tool */}
        {burndownPoints.length > 0 && (
          <BrutalBox style={{ padding: S.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md }}>
              <SectionLabel>SPRINT BURNDOWN</SectionLabel>
              <TagPill
                label={burndownStatus.label}
                color={burndownStatus.color === 'green' ? C.green : burndownStatus.color === 'red' ? C.red : C.amber}
                bg={burndownStatus.color === 'green' ? C.greenGhost : burndownStatus.color === 'red' ? C.redGhost : C.amberGhost}
              />
            </View>
            <BurndownChart points={burndownPoints} />
          </BrutalBox>
        )}

        {/* Sprint progress */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel>SPRINT PROGRESS</SectionLabel>
          {weeks.map((w) => {
            const p = getWeekProgress(tasks, w.num);
            return (
              <TouchableOpacity
                key={w.id}
                onPress={() => { setActiveWeek(w.num); router.push('/(tabs)/sprint'); }}
                style={{ marginBottom: S.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.white, fontWeight: '700' }}>
                    W{w.num} · {w.title}
                  </Text>
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: p.pct === 100 ? C.green : C.textDim }}>
                    {p.done}/{p.total}
                  </Text>
                </View>
                <BrutalBar pct={p.pct} color={p.pct === 100 ? C.green : p.pct > 0 ? C.orange : C.border} height={3} />
              </TouchableOpacity>
            );
          })}
        </BrutalBox>

        {/* Recent sessions */}
        {recentLogs.length > 0 && (
          <BrutalBox style={{ padding: S.md }}>
            <SectionLabel>RECENT SESSIONS</SectionLabel>
            {recentLogs.map((log, i) => {
              const task = tasks.find((t) => t.task_id === log.task_id);
              const ev = log.ai_eval;
              return (
                <View key={log.id} style={{
                  paddingBottom: S.md, marginBottom: S.md,
                  borderBottomWidth: i < recentLogs.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.white, fontWeight: '700' }}>
                      {log.date}
                    </Text>
                    {ev && (
                      <TagPill
                        label={`${ev.completion_pct}%`}
                        color={ev.momentum === 'strong' ? C.green : ev.momentum === 'ok' ? C.orange : C.red}
                        bg={ev.momentum === 'strong' ? C.greenGhost : C.orangeGhost}
                      />
                    )}
                  </View>
                  {task && (
                    <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary }}>
                      {task.task_id} · {task.title}
                    </Text>
                  )}
                  {ev?.top_concern && (
                    <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, marginTop: 4 }}>
                      ▲ {ev.top_concern}
                    </Text>
                  )}
                </View>
              );
            })}
          </BrutalBox>
        )}

        {/* Red flags */}
        <BrutalBox style={{ padding: S.md, borderColor: `${C.red}66` }}>
          <SectionLabel color={C.red}>⚠ SCOPE-CUT TRIGGERS</SectionLabel>
          {RED_FLAGS.map((rf, i) => (
            <View key={i} style={{
              paddingBottom: S.sm, marginBottom: S.sm,
              borderBottomWidth: i < RED_FLAGS.length - 1 ? 1 : 0,
              borderBottomColor: C.border,
            }}>
              <TagPill label={`END W${rf.week}`} color={C.amber} bg={C.amberGhost} />
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginTop: 6, lineHeight: 18 }}>
                {rf.text}
              </Text>
            </View>
          ))}
        </BrutalBox>

      </ScrollView>
    </SafeAreaView>
  );
}
