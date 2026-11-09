/**
 * Live status of the four permissions the assistant needs, plus the actions
 * that open the right system screen for each. Polls every 2 s while mounted,
 * so returning from Settings updates the UI without a manual refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import IndicContext from 'indic-context';

export type PermissionStatus = 'granted' | 'denied' | 'unknown';

export interface PermissionsState {
  overlay: PermissionStatus;
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
  /** ⏰ Reminder notifications (Android 13+ runtime permission, or blocked in app settings). */
  notifications: PermissionStatus;
}

function openNotificationSettings() {
  if (Platform.OS !== 'android') return;
  Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
    { key: 'android.provider.extra.APP_PACKAGE', value: 'com.indiccontext.assistant' },
  ]).catch(() => Linking.openSettings());
}

export function usePermissions() {
  const [perms, setPerms] = useState<PermissionsState>({
    overlay: 'unknown',
    accessibility: 'unknown',
    microphone: 'unknown',
    notifications: 'unknown',
  });

  const refresh = useCallback(async () => {
    try {
      setPerms(await IndicContext.checkPermissions());
    } catch (e) {
      console.warn('[permissions] check failed:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const openOverlaySettings = useCallback(() => {
    if (Platform.OS !== 'android') return;
    Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION').catch(() => Linking.openSettings());
  }, []);

  const openAccessibilitySettings = useCallback(() => {
    if (Platform.OS !== 'android') return;
    Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() => Linking.openSettings());
  }, []);

  /** App info screen — where Android 13+ hides "Allow restricted settings" for sideloaded apps. */
  const openAppInfo = useCallback(() => {
    Linking.openSettings();
  }, []);

  const requestMicrophone = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone',
          message: 'ConvoAI needs the microphone for dictation and voice notes.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
        if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) Linking.openSettings();
      } else {
        await IndicContext.requestMicrophonePermission();
      }
    } catch (e) {
      console.warn('[permissions] microphone request failed:', e);
      Linking.openSettings();
    } finally {
      refresh();
    }
  }, [refresh]);

  const requestNotifications = useCallback(async () => {
    try {
      const sdk = typeof Platform.Version === 'number' ? Platform.Version : 0;
      if (Platform.OS === 'android' && sdk >= 33) {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
          title: 'Notifications',
          message: 'ConvoAI uses notifications to remind you before something you owe is due.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
        if (res !== PermissionsAndroid.RESULTS.GRANTED) openNotificationSettings();
      } else {
        openNotificationSettings(); // below 13 they can only be blocked in settings
      }
    } catch (e) {
      console.warn('[permissions] notification request failed:', e);
      Linking.openSettings();
    } finally {
      refresh();
    }
  }, [refresh]);

  /** Required to run the assistant. Notifications are optional (only ⏰ reminders need them). */
  const allGranted =
    perms.overlay === 'granted' && perms.accessibility === 'granted' && perms.microphone === 'granted';
  const list = [perms.overlay, perms.accessibility, perms.microphone, perms.notifications];
  /** Setup checklist progress over all four (required + notifications). */
  const grantedCount = list.filter((s) => s === 'granted').length;
  const totalCount = list.length;
  const setupComplete = grantedCount === totalCount;

  return {
    perms,
    allGranted,
    grantedCount,
    totalCount,
    setupComplete,
    refresh,
    openOverlaySettings,
    openAccessibilitySettings,
    openAppInfo,
    requestMicrophone,
    requestNotifications,
  };
}
