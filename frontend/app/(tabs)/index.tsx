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
  TagPill, StreakCalendar,
  FocusTaskCard, BurndownChart, MilestoneBanner,
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
      if (raw) { try { setDismissedMilestones(JSON.parse(raw)); } catch {} }
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
  const recentLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  const focusTasks = getFocusTasks(tasks);
  const burndownPoints = getBurndownData(tasks, weeks);
  const burndownStatus = getBurndownStatus(burndownPoints);
  const xp = calcXP(tasks, logs);
  const levelInfo = getLevelInfo(xp);

  const reachedMilestone = STREAK_MILESTONES.find(
    (m) => m === streak && !dismissedMilestones.includes(m)
  );

  const relevantRedFlag = RED_FLAGS.find((rf) => {
    const w = weeks.find((x) => x.num === rf.week);
    if (!w) return false;
    const today = todayKey();
    return (!w.start_date || w.start_date <= today) && (!w.due_date || w.due_date >= today);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}>

        {/* Compact mission strip — static content, deliberately low visual
            weight so it doesn't compete with actionable data below */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingVertical: S.sm, marginBottom: S.md,
          borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <View>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, letterSpacing: 2 }}>
              AUIV SIMULATOR
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary, marginTop: 1 }}>
              {done}/{total} tasks · {overallPct}% complete
            </Text>
          </View>
          <Text style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: '900', color: overallPct === 100 ? C.green : C.orange }}>
            {overallPct}%
          </Text>
        </View>

        {/* Milestone celebration — positive event only */}
        {reachedMilestone && (
          <MilestoneBanner streak={reachedMilestone} onDismiss={() => dismissMilestone(reachedMilestone)} />
        )}

        {/* Today's standup nudge — only when actionable, elevated to top
            since it's the single highest-priority alert when present */}
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

        {/* Focus Today — the hero element, strongest visual treatment */}
        <BrutalBox style={{ padding: S.md, borderColor: C.orange, marginBottom: S.md }}>
          <SectionLabel color={C.orange}>◉ FOCUS TODAY</SectionLabel>
          {focusTasks.length === 0 ? (
            <View style={{ paddingVertical: S.lg, alignItems: 'center' }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, textAlign: 'center', lineHeight: 18 }}>
                {total === 0 ? 'No tasks yet — add some in Sprint.' : 'Nothing urgent. Pick anything in Sprint to keep moving.'}
              </Text>
            </View>
          ) : (
            focusTasks.map((t) => (
              <FocusTaskCard key={t.id} task={t} onPress={() => router.push(`/task/${t.id}`)} />
            ))
          )}
        </BrutalBox>

        {/* Streak + Level paired row — both are "your growth" metrics,
            visually grouped instead of stacked as separate full-width cards */}
        <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.sm }}>
          <View style={{
            flex: 1, borderWidth: C.BORDER_W, borderColor: streak >= 3 ? C.amber : C.border,
            backgroundColor: C.surface, padding: S.md,
          }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 8, color: C.textDim, letterSpacing: 1.5 }}>STREAK</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: '900', color: streak >= 3 ? C.amber : C.orange }}>
                {streak}
              </Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim }}>/ best {bestStreak}</Text>
            </View>
          </View>
          <View style={{
            flex: 1, borderWidth: C.BORDER_W, borderColor: C.purple,
            backgroundColor: C.purpleGhost, padding: S.md,
          }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 8, color: C.purple, letterSpacing: 1.5 }}>
              LV.{levelInfo.level} {levelInfo.title}
            </Text>
            <Text style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: '900', color: C.textPrimary, marginTop: 2 }}>
              {xp} XP
            </Text>
            <View style={{ marginTop: 6 }}>
              <BrutalBar pct={levelInfo.progressPct} color={C.purple} height={3} />
            </View>
          </View>
        </View>

        {/* Streak calendar — kept separate since it's a detail view, not a metric */}
        <BrutalBox style={{ padding: S.md }}>
          <StreakCalendar loggedDates={loggedDates} />
        </BrutalBox>

        {/* Task metrics row */}
        <View style={{ flexDirection: 'row', gap: 0, marginBottom: S.sm }}>
          <MetricBlock value={done}    label="DONE"    color={C.green} />
          <MetricBlock value={inProg}  label="ACTIVE"  color={C.orange} />
          <MetricBlock value={blocked} label="BLOCKED" color={blocked > 0 ? C.red : C.textDim} />
        </View>

        {/* Sprint Burndown */}
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

        {/* Recent sessions — trimmed to 3, this is a glance not a log */}
        {recentLogs.length > 0 && (
          <BrutalBox style={{ padding: S.md }}>
            <SectionLabel>RECENT SESSIONS</SectionLabel>
            {recentLogs.map((log, i) => {
              const task = tasks.find((t) => t.task_id === log.task_id);
              const ev = log.ai_eval;
              return (
                <View key={log.id} style={{
                  paddingBottom: S.sm, marginBottom: S.sm,
                  borderBottomWidth: i < recentLogs.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.white, fontWeight: '700' }}>
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
                    <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary }}>
                      {task.task_id} · {task.title}
                    </Text>
                  )}
                </View>
              );
            })}
          </BrutalBox>
        )}

        {/* Red flag — only the one relevant to the CURRENT week, not all 4
            (showing all 4 always was noise; only the live one is signal) */}
        {relevantRedFlag && (
          <BrutalBox style={{ padding: S.md, borderColor: C.red }}>
            <SectionLabel color={C.red}>⚠ THIS WEEK'S RISK</SectionLabel>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, lineHeight: 18 }}>
              {relevantRedFlag.text}
            </Text>
          </BrutalBox>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
