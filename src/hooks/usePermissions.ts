/**
 * Live status of the three permissions the assistant needs, plus the actions
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
}

export function usePermissions() {
  const [perms, setPerms] = useState<PermissionsState>({
    overlay: 'unknown',
    accessibility: 'unknown',
    microphone: 'unknown',
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

  const allGranted =
    perms.overlay === 'granted' && perms.accessibility === 'granted' && perms.microphone === 'granted';
  const grantedCount = [perms.overlay, perms.accessibility, perms.microphone].filter((s) => s === 'granted').length;

  return {
    perms,
    allGranted,
    grantedCount,
    refresh,
    openOverlaySettings,
    openAccessibilitySettings,
    openAppInfo,
    requestMicrophone,
  };
}
