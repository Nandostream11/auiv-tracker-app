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
