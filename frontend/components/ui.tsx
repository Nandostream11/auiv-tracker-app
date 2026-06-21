import React from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import { C, S, FONT } from '../constants/theme';

// ── BrutalBox ─────────────────────────────────────────────────────────────
export function BrutalBox({
  children, style, accent,
}: { children: React.ReactNode; style?: ViewStyle; accent?: string }) {
  return (
    <View style={[{
      backgroundColor: C.surface,
      borderWidth: C.BORDER_W,
      borderColor: accent || C.border,
      marginBottom: S.sm,
    }, style]}>
      {children}
    </View>
  );
}

// ── BrutalBtn ─────────────────────────────────────────────────────────────
export function BrutalBtn({
  label, onPress, color, disabled, small, outline,
}: {
  label: string; onPress: () => void;
  color?: string; disabled?: boolean; small?: boolean; outline?: boolean;
}) {
  const bg = outline ? 'transparent' : (color || C.orange);
  const tc = outline ? (color || C.orange) : C.bg;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        backgroundColor: disabled ? C.border : bg,
        borderWidth: C.BORDER_W,
        borderColor: disabled ? C.border : (color || C.orange),
        paddingVertical: small ? S.sm : S.md,
        paddingHorizontal: small ? S.md : S.lg,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: S.tapMin,
        opacity: disabled ? 0.5 : 1,
      }}>
      <Text style={{
        color: disabled ? C.textDim : tc,
        fontFamily: FONT.mono,
        fontSize: small ? 11 : 14,
        fontWeight: '700',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── MetricBlock ───────────────────────────────────────────────────────────
export function MetricBlock({
  value, label, color,
}: { value: string | number; label: string; color?: string }) {
  return (
    <View style={{
      flex: 1,
      borderWidth: C.BORDER_W,
      borderColor: C.border,
      padding: S.sm,
      alignItems: 'center',
      backgroundColor: C.surface,
    }}>
      <Text style={{
        fontFamily: FONT.mono,
        fontSize: 26,
        fontWeight: '900',
        color: color || C.white,
        lineHeight: 30,
      }}>{value}</Text>
      <Text style={{
        fontFamily: FONT.mono,
        fontSize: 9,
        color: C.textDim,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginTop: 2,
      }}>{label}</Text>
    </View>
  );
}

// ── BrutalBar ─────────────────────────────────────────────────────────────
export function BrutalBar({
  pct, color, height = 4,
}: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ width: '100%', height, backgroundColor: C.border }}>
      <View style={{
        width: `${Math.max(0, Math.min(100, pct))}%`,
        height,
        backgroundColor: color,
      }} />
    </View>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────
export function SectionLabel({
  children, color,
}: { children: string; color?: string }) {
  return (
    <Text style={{
      fontFamily: FONT.mono,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: color || C.textDim,
      marginBottom: S.sm,
    }}>{children}</Text>
  );
}

// ── Mono ──────────────────────────────────────────────────────────────────
export function Mono({
  children, size = 13, color, bold, style,
}: {
  children: React.ReactNode; size?: number;
  color?: string; bold?: boolean; style?: TextStyle;
}) {
  return (
    <Text style={[{
      fontFamily: FONT.mono,
      fontSize: size,
      color: color || C.textPrimary,
      fontWeight: bold ? '700' : '400',
    }, style]}>{children}</Text>
  );
}

// ── TagPill ───────────────────────────────────────────────────────────────
export function TagPill({
  label, color, bg,
}: { label: string; color?: string; bg?: string }) {
  return (
    <View style={{
      borderWidth: 1,
      borderColor: color || C.orange,
      backgroundColor: bg || C.orangeGhost,
      paddingHorizontal: 6,
      paddingVertical: 2,
    }}>
      <Text style={{
        fontFamily: FONT.mono,
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: color || C.orange,
      }}>{label}</Text>
    </View>
  );
}

// ── CheckRow ──────────────────────────────────────────────────────────────
export function CheckRow({
  label, checked, onToggle,
}: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: S.tapMin + 4,
        paddingVertical: S.sm,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        gap: S.md,
      }}>
      <View style={{
        width: 22, height: 22,
        borderWidth: C.BORDER_W,
        borderColor: checked ? C.orange : C.borderBright,
        backgroundColor: checked ? C.orangeGhost : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {checked && (
          <Text style={{ color: C.orange, fontSize: 13, fontWeight: '900', lineHeight: 14 }}>✓</Text>
        )}
      </View>
      <Text style={{
        flex: 1,
        fontFamily: FONT.sans,
        fontSize: 14,
        color: checked ? C.white : C.textSecondary,
        lineHeight: 20,
      }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── BrutalInput ───────────────────────────────────────────────────────────
export function BrutalInput({
  value, onChangeText, placeholder, multiline, rows,
}: {
  value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; rows?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={C.textDim}
      multiline={multiline}
      numberOfLines={rows}
      style={{
        backgroundColor: C.surfaceHigh,
        borderWidth: C.BORDER_W,
        borderColor: C.border,
        color: C.white,
        fontFamily: FONT.mono,
        fontSize: 13,
        padding: S.md,
        minHeight: multiline ? (rows || 3) * 24 + S.md * 2 : S.tapMin,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

// ── Divider ───────────────────────────────────────────────────────────────
export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.border, marginVertical: S.sm }} />;
}

// ── StatusCycleBtn ────────────────────────────────────────────────────────
export function StatusCycleBtn({
  status, onCycle,
}: { status: string; onCycle: () => void }) {
  const colorMap: Record<string, string> = {
    done: C.green, inprogress: C.orange, blocked: C.red, todo: C.textDim,
  };
  const labelMap: Record<string, string> = {
    done: 'DONE', inprogress: 'IN PROG', blocked: 'BLOCKED', todo: 'TODO',
  };
  const c = colorMap[status] || C.textDim;
  return (
    <TouchableOpacity
      onPress={onCycle}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: S.xs,
        borderWidth: C.BORDER_W,
        borderColor: c,
        backgroundColor: `${c}18`,
        paddingVertical: S.sm,
        paddingHorizontal: S.md,
        minHeight: S.tapMin,
      }}>
      <Text style={{ color: c, fontFamily: FONT.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
        {labelMap[status] || 'TODO'}
      </Text>
      <Text style={{ color: c, fontSize: 10, opacity: 0.6 }}>↻</Text>
    </TouchableOpacity>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────
export function Spinner({ color }: { color?: string }) {
  return <ActivityIndicator color={color || C.orange} size="large" />;
}

// ── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: S.xl * 2 }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

// ── StreakCalendar ────────────────────────────────────────────────────────
// GitHub-style activity grid: last 35 days (5 weeks x 7 days), most recent
// week on the right. Filled orange = standup logged. Outlined = today.
// Empty = missed day. Tapping a day with a log could later deep-link to it.
export function StreakCalendar({ loggedDates }: { loggedDates: Set<string> }) {
  const DAYS = 35;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Build array of the last 35 days, oldest first
  const cells: { date: string; logged: boolean; isToday: boolean; isFuture: boolean }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    cells.push({
      date: dateStr,
      logged: loggedDates.has(dateStr),
      isToday: dateStr === todayStr,
      isFuture: false,
    });
  }

  // Group into 5 columns of 7 (weeks), rendered as rows of 7 for simplicity
  // on narrow phone screens (rows = weeks, reads top-to-bottom oldest-to-newest)
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cellSize = 16;
  const gap = 4;

  return (
    <View>
      {/* Day-of-week header */}
      <View style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 0 }}>
        {dayLabels.map((d, i) => (
          <View key={i} style={{ width: cellSize, marginRight: gap, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 8, color: C.textDim }}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: gap }}>
          {week.map((cell) => (
            <View
              key={cell.date}
              style={{
                width: cellSize, height: cellSize, marginRight: gap,
                backgroundColor: cell.logged ? C.orange : C.surfaceHigh,
                borderWidth: cell.isToday ? 1.5 : 1,
                borderColor: cell.isToday ? C.white : (cell.logged ? C.orange : C.border),
              }}
            />
          ))}
        </View>
      ))}

      {/* Legend */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs, marginTop: S.sm }}>
        <View style={{ width: 10, height: 10, backgroundColor: C.orange }} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, marginRight: S.sm }}>LOGGED</Text>
        <View style={{ width: 10, height: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border }} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, marginRight: S.sm }}>MISSED</Text>
        <View style={{ width: 10, height: 10, backgroundColor: C.surfaceHigh, borderWidth: 1.5, borderColor: C.white }} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim }}>TODAY</Text>
      </View>
    </View>
  );
}

// ── DateStepper ───────────────────────────────────────────────────────────
// Custom date picker — no native dependency, avoids build risk.
// value/onChange use ISO date strings "YYYY-MM-DD". null = unset.
export function DateStepper({
  value, onChange, label, accent,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  label: string;
  accent?: string;
}) {
  const color = accent || C.orange;
  const date = value ? new Date(value) : null;

  function shiftDay(delta: number) {
    const base = date || new Date();
    const next = new Date(base);
    next.setDate(next.getDate() + delta);
    onChange(next.toISOString().slice(0, 10));
  }

  function setToday() {
    onChange(new Date().toISOString().slice(0, 10));
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const display = date
    ? `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    : 'NOT SET';

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {label}
        </Text>
        {value && (
          <TouchableOpacity onPress={() => onChange(null)} style={{ padding: 4 }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim }}>✕ CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      {!value ? (
        <TouchableOpacity
          onPress={setToday}
          style={{
            borderWidth: C.BORDER_W, borderColor: C.border, borderStyle: 'dashed',
            paddingVertical: S.md, alignItems: 'center', minHeight: S.tapMin,
            justifyContent: 'center',
          }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textDim, letterSpacing: 1 }}>
            + SET DATE
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <TouchableOpacity
            onPress={() => shiftDay(-1)}
            style={{ borderWidth: C.BORDER_W, borderColor: C.border, padding: S.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: color, fontSize: 16, fontWeight: '900' }}>‹</Text>
          </TouchableOpacity>

          <View style={{
            flex: 1, borderWidth: C.BORDER_W, borderColor: color,
            backgroundColor: `${color}18`, paddingVertical: S.sm,
            alignItems: 'center', minHeight: 44, justifyContent: 'center',
          }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: '900', color: color, letterSpacing: 1 }}>
              {display}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => shiftDay(1)}
            style={{ borderWidth: C.BORDER_W, borderColor: C.border, padding: S.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: color, fontSize: 16, fontWeight: '900' }}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {value && (
        <View style={{ flexDirection: 'row', gap: S.xs, marginTop: S.sm }}>
          {[
            { label: '-7D', delta: -7 },
            { label: '-1D', delta: -1 },
            { label: '+1D', delta: 1 },
            { label: '+7D', delta: 7 },
          ].map((b) => (
            <TouchableOpacity
              key={b.label}
              onPress={() => shiftDay(b.delta)}
              style={{
                flex: 1, borderWidth: 1, borderColor: C.border,
                paddingVertical: 6, alignItems: 'center',
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim }}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── TimelineBadge ─────────────────────────────────────────────────────────
// Compact urgency indicator for task list rows — shows days until/overdue.
export function TimelineBadge({
  label, color,
}: { label: string; color: string }) {
  if (!label) return null;
  return (
    <View style={{
      borderWidth: 1, borderColor: color, backgroundColor: `${color}18`,
      paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3,
    }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontFamily: FONT.mono, fontSize: 9, fontWeight: '700', color, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ── EvalStatusBadge ───────────────────────────────────────────────────────
// Renders an explicit, unambiguous indicator for ANY eval state.
// This exists specifically to eliminate the "silent gap" bug where a log
// with no ai_eval rendered absolutely nothing — making it indistinguishable
// whether the eval was still queued, had permanently failed, or was never
// attempted at all (e.g. no API key was set when the standup was submitted).
export function EvalStatusBadge({ log }: { log: any }) {
  const status = log.eval_status || (log.ai_eval ? 'completed' : 'never_attempted');

  if (status === 'completed' && log.ai_eval) {
    const ev = log.ai_eval;
    return (
      <TagPill
        label={`${ev.completion_pct}%`}
        color={ev.momentum === 'strong' ? C.green : ev.momentum === 'ok' ? C.orange : C.red}
        bg={ev.momentum === 'strong' ? C.greenGhost : C.orangeGhost}
      />
    );
  }

  if (status === 'pending' || status === 'running') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderWidth: 1, borderColor: C.amber, backgroundColor: C.amberGhost,
        paddingHorizontal: 6, paddingVertical: 2,
      }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber }} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 9, fontWeight: '700', color: C.amber, letterSpacing: 0.5 }}>
          QUEUED · ATTEMPT {(log.eval_retries || 0) + 1}/5
        </Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={{
        borderWidth: 1, borderColor: C.red, backgroundColor: C.redGhost,
        paddingHorizontal: 6, paddingVertical: 2,
      }}>
        <Text style={{ fontFamily: FONT.mono, fontSize: 9, fontWeight: '700', color: C.red, letterSpacing: 0.5 }}>
          EVAL FAILED — RETRY EXHAUSTED
        </Text>
      </View>
    );
  }

  // never_attempted — most likely cause: no API key was set yet
  return (
    <View style={{
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHigh,
      paddingHorizontal: 6, paddingVertical: 2,
    }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 9, color: C.textDim, letterSpacing: 0.5 }}>
        NO AI EVAL
      </Text>
    </View>
  );
}

// ── EvalStatusDetail ──────────────────────────────────────────────────────
// Expanded explanation shown below the badge — tells the user exactly
// what's happening and what (if anything) they need to do.
export function EvalStatusDetail({ log }: { log: any }) {
  const status = log.eval_status || (log.ai_eval ? 'completed' : 'never_attempted');

  if (status === 'pending' || status === 'running') {
    const retryAt = log.eval_retry_at ? new Date(log.eval_retry_at) : null;
    const now = new Date();
    const diffMs = retryAt ? retryAt.getTime() - now.getTime() : 0;
    const diffHrs = Math.max(0, Math.ceil(diffMs / 3600000));
    return (
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.amber, marginTop: 4, lineHeight: 15 }}>
        Last error: {log.eval_error || 'timeout'}. Next retry in ~{diffHrs}h.
      </Text>
    );
  }

  if (status === 'failed') {
    return (
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.red, marginTop: 4, lineHeight: 15 }}>
        All 5 attempts failed. Last error: {log.eval_error || 'unknown'}. Check your API key in Settings, then re-submit this standup to retry.
      </Text>
    );
  }

  if (status === 'never_attempted') {
    return (
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: 4, lineHeight: 15 }}>
        No API key was set when this was submitted. Add one in Settings, then re-submit to get an eval.
      </Text>
    );
  }

  return null;
}
