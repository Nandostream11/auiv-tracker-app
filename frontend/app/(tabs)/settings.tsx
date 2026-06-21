import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, Linking, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrutalBox, BrutalBtn, BrutalInput, SectionLabel, Mono, TagPill } from '../../components/ui';
import { C, S, FONT } from '../../constants/theme';
import { getApiKey, setApiKey, getBaseUrl, setBaseUrl, getDeviceId } from '../../lib/api';
import { useStore } from '../../lib/store';
import { getReminderSettings, setReminderSettings } from '../../hooks/useDailyReminder';

export default function SettingsScreen() {
  const { deviceId } = useStore();
  const [apiKey, setApiKeyState]     = useState('');
  const [showKey, setShowKey]        = useState(false);
  const [backendUrl, setBackendUrlState] = useState('');
  const [testing, setTesting]        = useState(false);
  const [testResult, setTestResult]  = useState<'ok' | 'fail' | null>(null);
  const [testMessage, setTestMessage]= useState('');
  const [saving, setSaving]          = useState(false);

  const [reminderHour,   setReminderHour]   = useState(19);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [reminderEnabled,setReminderEnabled]= useState(true);
  const [reminderSaving, setReminderSaving] = useState(false);

  useEffect(() => {
    getApiKey().then(setApiKeyState);
    getBaseUrl().then(setBackendUrlState);
    getReminderSettings().then(({ hour, minute, enabled }) => {
      setReminderHour(hour);
      setReminderMinute(minute);
      setReminderEnabled(enabled);
    });
  }, []);

  async function handleReminderChange(hour: number, minute: number, enabled: boolean) {
    setReminderHour(hour);
    setReminderMinute(minute);
    setReminderEnabled(enabled);
    setReminderSaving(true);
    try {
      await setReminderSettings(hour, minute, enabled);
    } catch (e: any) {
      Alert.alert('ERROR', `Could not schedule reminder: ${e.message}`);
    }
    setReminderSaving(false);
  }

  function adjustHour(delta: number) {
    const next = (reminderHour + delta + 24) % 24;
    handleReminderChange(next, reminderMinute, reminderEnabled);
  }

  function adjustMinute(delta: number) {
    const next = (reminderMinute + delta + 60) % 60;
    handleReminderChange(reminderHour, next, reminderEnabled);
  }

  function formatTime(h: number, m: number) {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  async function testApiKey() {
    if (!apiKey.trim()) return;
    setTesting(true); setTestResult(null); setTestMessage('');
    try {
      const base = await getBaseUrl();
      const res = await fetch(`${base}/api/ai/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      setTestResult(data.valid ? 'ok' : 'fail');
      setTestMessage(data.message || '');
    } catch (e: any) {
      setTestResult('fail');
      setTestMessage(`Could not reach backend at ${backendUrl}: ${e.message}`);
    }
    setTesting(false);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await setApiKey(apiKey.trim());
      await setBaseUrl(backendUrl.trim());
      Alert.alert('SAVED', 'Settings saved successfully.');
    } catch (e: any) {
      Alert.alert('ERROR', e.message);
    }
    setSaving(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}>

        {/* API Key */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel color={C.orange}>AI API KEY</SectionLabel>
          <View style={{ marginBottom: S.sm, borderWidth: 1, borderColor: C.amberGhost, backgroundColor: `${C.amber}08`, padding: S.sm }}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.amber, lineHeight: 18 }}>
              Two options — paste either key, it's auto-detected:{'\n\n'}
              <Text style={{ color: C.green, fontWeight: '900' }}>FREE:</Text> Gemini key from aistudio.google.com (no credit card, ~500 req/day){'\n'}
              <Text style={{ color: C.textPrimary }}>PAID:</Text> Claude key from console.anthropic.com{'\n\n'}
              Stored in SecureStore on this device only — never sent anywhere except the provider you choose.
            </Text>
          </View>

          <View style={{ position: 'relative', marginBottom: S.sm }}>
            <BrutalInput
              value={showKey ? apiKey : apiKey.replace(/./g, '•')}
              onChangeText={setApiKeyState}
              placeholder="AIza... (free) or sk-ant-... (paid)"
            />
            <TouchableOpacity
              onPress={() => setShowKey((s) => !s)}
              style={{
                position: 'absolute', right: S.sm, top: 0, bottom: 0,
                justifyContent: 'center', paddingHorizontal: S.sm, minWidth: 44,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textDim }}>
                {showKey ? 'HIDE' : 'SHOW'}
              </Text>
            </TouchableOpacity>
          </View>

          {testResult === 'ok' && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.green, marginBottom: S.sm }}>
              ✓ {testMessage || 'KEY VALID — AI EVAL ENABLED'}
            </Text>
          )}
          {testResult === 'fail' && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.red, marginBottom: S.sm, lineHeight: 16 }}>
              ✕ {testMessage || 'Invalid key or network error'}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.sm }}>
            <View style={{ flex: 1 }}>
              <BrutalBtn label={testing ? 'TESTING...' : 'TEST KEY'} onPress={testApiKey} disabled={!apiKey.trim() || testing} outline />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
              style={{
                flex: 1, borderWidth: C.BORDER_W, borderColor: C.green,
                backgroundColor: C.greenGhost,
                padding: S.md, justifyContent: 'center', alignItems: 'center', minHeight: S.tapMin,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.green, letterSpacing: 1, fontWeight: '900' }}>
                GET FREE KEY ↗
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}
              style={{
                flex: 1, borderWidth: C.BORDER_W, borderColor: C.border,
                padding: S.md, justifyContent: 'center', alignItems: 'center', minHeight: S.tapMin,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textSecondary, letterSpacing: 1 }}>
                GET CLAUDE KEY ↗
              </Text>
            </TouchableOpacity>
          </View>
        </BrutalBox>

        {/* Daily Reminder */}
        <BrutalBox style={{ padding: S.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm }}>
            <SectionLabel color={C.orange}>DAILY REMINDER</SectionLabel>
            <Switch
              value={reminderEnabled}
              onValueChange={(v) => handleReminderChange(reminderHour, reminderMinute, v)}
              trackColor={{ false: C.border, true: C.orangeGhost }}
              thumbColor={reminderEnabled ? C.orange : C.textDim}
            />
          </View>

          <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginBottom: S.md, lineHeight: 18 }}>
            A local notification fires every day at this time if you haven't logged today's standup yet.
          </Text>

          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.md,
            opacity: reminderEnabled ? 1 : 0.4,
          }}>
            {/* Hour stepper */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                disabled={!reminderEnabled}
                onPress={() => adjustHour(1)}
                style={{ padding: S.sm, minWidth: 44, alignItems: 'center' }}>
                <Text style={{ color: C.orange, fontSize: 18, fontWeight: '900' }}>▲</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: '900', color: C.white, minWidth: 56, textAlign: 'center' }}>
                {String(reminderHour % 12 === 0 ? 12 : reminderHour % 12).padStart(2, '0')}
              </Text>
              <TouchableOpacity
                disabled={!reminderEnabled}
                onPress={() => adjustHour(-1)}
                style={{ padding: S.sm, minWidth: 44, alignItems: 'center' }}>
                <Text style={{ color: C.orange, fontSize: 18, fontWeight: '900' }}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: '900', color: C.textDim }}>:</Text>

            {/* Minute stepper */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                disabled={!reminderEnabled}
                onPress={() => adjustMinute(5)}
                style={{ padding: S.sm, minWidth: 44, alignItems: 'center' }}>
                <Text style={{ color: C.orange, fontSize: 18, fontWeight: '900' }}>▲</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: '900', color: C.white, minWidth: 56, textAlign: 'center' }}>
                {String(reminderMinute).padStart(2, '0')}
              </Text>
              <TouchableOpacity
                disabled={!reminderEnabled}
                onPress={() => adjustMinute(-5)}
                style={{ padding: S.sm, minWidth: 44, alignItems: 'center' }}>
                <Text style={{ color: C.orange, fontSize: 18, fontWeight: '900' }}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* AM/PM toggle */}
            <TouchableOpacity
              disabled={!reminderEnabled}
              onPress={() => adjustHour(12)}
              style={{
                borderWidth: C.BORDER_W, borderColor: C.orange,
                paddingHorizontal: S.md, paddingVertical: S.sm,
                marginLeft: S.sm,
              }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: '900', color: C.orange }}>
                {reminderHour >= 12 ? 'PM' : 'AM'}
              </Text>
            </TouchableOpacity>
          </View>

          {reminderEnabled && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, textAlign: 'center', marginTop: S.sm }}>
              {reminderSaving ? 'SAVING...' : `Reminder set for ${formatTime(reminderHour, reminderMinute)} daily`}
            </Text>
          )}
        </BrutalBox>

        {/* Backend URL */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel color={C.orange}>BACKEND URL</SectionLabel>
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, marginBottom: S.sm, lineHeight: 18 }}>
            Point this to your FastAPI server. Default: http://localhost:8000
            {'\n'}For cloud deploy, use your Render/Railway/VPS URL.
          </Text>
          <BrutalInput
            value={backendUrl}
            onChangeText={setBackendUrlState}
            placeholder="http://localhost:8000"
          />
        </BrutalBox>

        {/* Save */}
        <BrutalBtn label={saving ? 'SAVING...' : 'SAVE SETTINGS'} onPress={saveSettings} disabled={saving} />

        {/* Device ID */}
        <BrutalBox style={{ padding: S.md, marginTop: S.sm }}>
          <SectionLabel>DEVICE ID</SectionLabel>
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textDim, lineHeight: 18 }} selectable>
            {deviceId || 'Loading...'}
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, marginTop: S.xs }}>
            This is your anonymous device identifier. All your data is keyed to this ID on the backend.
          </Text>
        </BrutalBox>

        {/* Install Guide */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel color={C.orange}>INSTALL THIS APP</SectionLabel>
          {[
            { platform: 'iOS', steps: [
              'Download Expo Go from the App Store',
              'Run: npx expo start in the frontend/ directory',
              'Scan the QR code with your iPhone camera',
              'For standalone: npx eas build --platform ios',
            ]},
            { platform: 'ANDROID', steps: [
              'Download Expo Go from Google Play',
              'Run: npx expo start in the frontend/ directory',
              'Scan the QR code with Expo Go app',
              'For standalone: npx eas build --platform android',
            ]},
          ].map((p) => (
            <View key={p.platform} style={{ marginBottom: S.md }}>
              <TagPill label={p.platform} color={C.orange} bg={C.orangeGhost} />
              <View style={{ marginTop: S.sm }}>
                {p.steps.map((step, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: S.sm, marginBottom: 6, alignItems: 'flex-start' }}>
                    <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.orange, minWidth: 16 }}>{i + 1}.</Text>
                    <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, flex: 1, lineHeight: 18 }}>
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </BrutalBox>

        {/* About */}
        <BrutalBox style={{ padding: S.md }}>
          <SectionLabel>ABOUT</SectionLabel>
          {[
            ['PROJECT', 'AUIV Simulator'],
            ['MISSION', '20 m transect · EKF RMS ≤ 0.5 m · pytest exits 0'],
            ['DURATION', '6 weeks · 75 hrs total'],
            ['STACK', 'FastAPI + MongoDB + Expo Router'],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', paddingVertical: S.xs, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.textDim, width: 80, letterSpacing: 1 }}>{k}</Text>
              <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.textSecondary, flex: 1 }}>{v}</Text>
            </View>
          ))}
        </BrutalBox>

      </ScrollView>
    </SafeAreaView>
  );
}
