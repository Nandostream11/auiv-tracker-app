/**
 * useDailyReminder.ts
 *
 * Schedules a repeating local notification reminding the user to complete
 * their daily standup. Runs entirely on-device — no backend involvement,
 * no internet required for the notification itself to fire.
 *
 * Behavior:
 *  - On first launch, requests notification permission
 *  - Schedules a daily repeating notification at a user-configurable time
 *    (default 19:00 / 7 PM local time)
 *  - Cancels and re-schedules if the user changes the time in Settings
 *  - If today's standup is already submitted, the notification still fires
 *    (local notifications can't easily check app state at fire-time without
 *    a background task) but the app, on open, will show "already done" state
 *    rather than nag further
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_HOUR_KEY   = 'auiv_reminder_hour';
const REMINDER_MINUTE_KEY = 'auiv_reminder_minute';
const REMINDER_ENABLED_KEY= 'auiv_reminder_enabled';
const NOTIFICATION_ID_KEY = 'auiv_reminder_notif_id';

const DEFAULT_HOUR   = 19;  // 7 PM
const DEFAULT_MINUTE = 0;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getReminderSettings() {
  const [hourStr, minuteStr, enabledStr] = await Promise.all([
    AsyncStorage.getItem(REMINDER_HOUR_KEY),
    AsyncStorage.getItem(REMINDER_MINUTE_KEY),
    AsyncStorage.getItem(REMINDER_ENABLED_KEY),
  ]);
  return {
    hour:    hourStr   ? parseInt(hourStr, 10)   : DEFAULT_HOUR,
    minute:  minuteStr ? parseInt(minuteStr, 10) : DEFAULT_MINUTE,
    enabled: enabledStr !== 'false',   // default true
  };
}

export async function setReminderSettings(hour: number, minute: number, enabled: boolean) {
  await AsyncStorage.setItem(REMINDER_HOUR_KEY, String(hour));
  await AsyncStorage.setItem(REMINDER_MINUTE_KEY, String(minute));
  await AsyncStorage.setItem(REMINDER_ENABLED_KEY, String(enabled));
  await scheduleReminder(hour, minute, enabled);
}

async function scheduleReminder(hour: number, minute: number, enabled: boolean) {
  // Cancel any existing scheduled reminder first
  const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (existingId) {
    try { await Notifications.cancelScheduledNotificationAsync(existingId); } catch {}
    await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  }

  if (!enabled) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '◈ AUIV Daily Standup',
      body:  "Log today's progress before you lose your streak.",
      sound: true,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      channelId: 'daily-standup',
    },
  });
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
}

export function useDailyReminder() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function setup() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily-standup', {
          name: 'Daily Standup Reminder',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#FF3D00',
        });
      }

      const { hour, minute, enabled } = await getReminderSettings();

      // Only schedule if nothing is currently scheduled (avoid duplicate
      // schedules stacking up across app restarts)
      const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
      if (!existingId && enabled) {
        await scheduleReminder(hour, minute, enabled);
      }
    }

    setup();
  }, []);
}
