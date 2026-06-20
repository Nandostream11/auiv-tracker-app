import { useEffect, useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDeviceId, initProject, getAllTasks, getAllLogs } from '../lib/api';
import { useStore } from '../lib/store';
import { useJobStore } from '../lib/jobStore';
import { useAIJobPoller } from '../hooks/useAIJobPoller';
import { useDailyReminder } from '../hooks/useDailyReminder';
import { C, FONT, S } from '../constants/theme';

function EvalToast({ date, visible }: { date: string; visible: boolean }) {
  const opacity = new Animated.Value(0);
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(3500),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={{
      position: 'absolute', bottom: 90, left: 16, right: 16, zIndex: 999,
      backgroundColor: C.green, padding: S.md,
      borderWidth: C.BORDER_W, borderColor: C.green,
      flexDirection: 'row', alignItems: 'center', gap: S.sm,
      opacity,
    }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: '900', color: C.bg }}>
        ◈ AI EVAL COMPLETE
      </Text>
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.bg }}>
        {date} — check Daily tab
      </Text>
    </Animated.View>
  );
}

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const { setDeviceId, setTasks, setLogs, setCharter, setChecklistItems, setInitialized } = useStore();
  const { hydrateFromStorage } = useJobStore();
  const [toastDate, setToastDate]       = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        const id = await getDeviceId();
        setDeviceId(id);
        hydrateFromStorage();
        const init = await initProject(id);
        setCharter(init.charter);
        setChecklistItems(init.checklist_items || []);
        const [tasks, logs] = await Promise.all([getAllTasks(id), getAllLogs(id)]);
        setTasks(tasks);
        setLogs(logs);
        setInitialized(true);
      } catch (err) {
        console.error('[boot] Backend unreachable:', err);
        hydrateFromStorage();
        setInitialized(true);
      }
    }
    boot();
  }, []);

  const handleEvalComplete = useCallback((date: string) => {
    setToastDate(date);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 4500);
  }, []);

  useAIJobPoller(handleEvalComplete);
  useDailyReminder();

  return (
    <View style={{ flex: 1 }}>
      {children}
      <EvalToast date={toastDate} visible={toastVisible} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#000000" />
      <AppBootstrap>
        <Stack
          screenOptions={{
            headerStyle:         { backgroundColor: '#000000' },
            headerTintColor:     '#FFFFFF',
            headerTitleStyle:    { fontFamily: 'Courier New', fontSize: 13, letterSpacing: 2 },
            headerShadowVisible: false,
            contentStyle:        { backgroundColor: '#000000' },
            animation:           'slide_from_right',
          }}>
          <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
          <Stack.Screen name="task/[id]" options={{ title: 'TASK DETAIL', headerBackTitle: 'BACK' }} />
        </Stack>
      </AppBootstrap>
    </SafeAreaProvider>
  );
}
