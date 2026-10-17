import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IndicContext from 'indic-context';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type PermissionStatus = 'granted' | 'denied' | 'unknown';

interface PermissionState {
  overlay: PermissionStatus;        // SYSTEM_ALERT_WINDOW
  accessibility: PermissionStatus;  // Accessibility Service enabled
  microphone: PermissionStatus;     // RECORD_AUDIO
}

// ─────────────────────────────────────────────
// Permission Row Component
// ─────────────────────────────────────────────

function PermissionRow({
  title,
  description,
  status,
  onGrant,
}: {
  title: string;
  description: string;
  status: PermissionStatus;
  onGrant: () => void;
}) {
  const statusColor =
    status === 'granted' ? '#22C55E' : status === 'denied' ? '#EF4444' : '#94A3B8';
  const statusLabel =
    status === 'granted' ? '✓ Granted' : status === 'denied' ? '✗ Denied' : '◌ Unknown';

  return (
    <View style={styles.permRow}>
      <View style={styles.permInfo}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{description}</Text>
      </View>
      <View style={styles.permActions}>
        <Text style={[styles.permStatus, { color: statusColor }]}>{statusLabel}</Text>
        {status !== 'granted' && (
          <TouchableOpacity style={styles.grantBtn} onPress={onGrant}>
            <Text style={styles.grantBtnText}>Grant</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Dashboard Screen
// ─────────────────────────────────────────────

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>({
    overlay: 'unknown',
    accessibility: 'unknown',
    microphone: 'unknown',
  });

  // ── Check all permission states ──
  const checkPermissions = useCallback(async () => {
    try {
      const status = await IndicContext.checkPermissions();
      setPermissions(status);
    } catch (e) {
      console.warn('[Dashboard] checkPermissions error:', e);
    }
  }, []);

  // Poll permissions when screen is active (handles return from settings)
  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  // ── Copilot toggle ──
  const handleCopilotToggle = useCallback(
    async (value: boolean) => {
      const allGranted =
        permissions.overlay === 'granted' &&
        permissions.accessibility === 'granted' &&
        permissions.microphone === 'granted';

      if (value && !allGranted) {
        Alert.alert(
          'Permissions Required',
          'Please grant all required permissions before enabling the copilot.',
        );
        return;
      }

      try {
        if (value) {
          await IndicContext.startOverlay();
        } else {
          await IndicContext.stopOverlay();
        }
        setCopilotEnabled(value);
      } catch (e) {
        console.error('[Dashboard] overlay toggle error:', e);
        Alert.alert('Error', 'Failed to toggle the copilot. Please try again.');
      }
    },
    [permissions],
  );

  // ── Grant handlers ──
  const openOverlaySettings = useCallback(() => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION').catch(() =>
        Linking.openSettings(),
      );
    }
  }, []);

  const openAccessibilitySettings = useCallback(() => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() =>
        Linking.openSettings(),
      );
    }
  }, []);

  const requestMicrophone = useCallback(async () => {
    try {
      await IndicContext.requestMicrophonePermission();
      checkPermissions();
    } catch (e) {
      Linking.openSettings();
    }
  }, [checkPermissions]);

  const allGranted =
    permissions.overlay === 'granted' &&
    permissions.accessibility === 'granted' &&
    permissions.microphone === 'granted';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      {/* ── Hero Section ── */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🧠</Text>
        <Text style={styles.heroTitle}>IndicContext Copilot</Text>
        <Text style={styles.heroSubtitle}>
          A floating AI assistant that sits above your keyboard in any chat app.
        </Text>
      </View>

      {/* ── Copilot Master Toggle ── */}
      <View style={[styles.card, copilotEnabled && styles.cardActive]}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>
              {copilotEnabled ? '● Copilot Active' : '○ Copilot Inactive'}
            </Text>
            <Text style={styles.toggleDesc}>
              {copilotEnabled
                ? 'Floating overlay will appear in supported chat apps.'
                : 'Enable to launch the floating overlay over your keyboard.'}
            </Text>
          </View>
          <Switch
            value={copilotEnabled}
            onValueChange={handleCopilotToggle}
            disabled={!allGranted && !copilotEnabled}
            trackColor={{ false: '#334155', true: '#6366F1' }}
            thumbColor={copilotEnabled ? '#FFFFFF' : '#94A3B8'}
          />
        </View>
      </View>

      {/* ── Permissions Section ── */}
      <Text style={styles.sectionHeader}>Required Permissions</Text>

      <View style={styles.card}>
        <PermissionRow
          title="Draw Over Other Apps"
          description="Allows the floating copilot panel to appear above your keyboard in any app."
          status={permissions.overlay}
          onGrant={openOverlaySettings}
        />
        <View style={styles.divider} />
        <PermissionRow
          title="Accessibility Service"
          description="Reads visible chat text to build context for AI suggestions. No data is stored."
          status={permissions.accessibility}
          onGrant={openAccessibilitySettings}
        />
        <View style={styles.divider} />
        <PermissionRow
          title="Microphone"
          description="Captures voice input for the voice-to-text feature (Gnani Prisma STT)."
          status={permissions.microphone}
          onGrant={requestMicrophone}
        />
      </View>

      {!allGranted && (
        <Text style={styles.permNote}>
          ⓘ All three permissions are required to enable the copilot.
        </Text>
      )}

      {/* ── Feature Overview ── */}
      <Text style={styles.sectionHeader}>Features</Text>
      <View style={styles.card}>
        {[
          { icon: '🎤', label: 'Voice-to-Text', note: 'Gnani Prisma V2.5 STT' },
          { icon: '🎨', label: 'Tone & Temperature Rewrite', note: 'Gnani Evon LLM' },
          { icon: '✅', label: 'Pre-Send Fact Check', note: 'Parallel interceptor' },
          { icon: '🤝', label: 'Cultural Sensitivity', note: 'Persona-aware' },
          { icon: '❄️', label: 'Icebreaker Suggestions', note: 'Context-driven' },
        ].map((f, i, arr) => (
          <React.Fragment key={f.label}>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureNote}>{f.note}</Text>
              </View>
            </View>
            {i < arr.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* ── Debug Info ── */}
      {__DEV__ && (
        <View style={[styles.card, styles.debugCard]}>
          <Text style={styles.debugTitle}>DEV — Permission State</Text>
          <Text style={styles.debugText}>{JSON.stringify(permissions, null, 2)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20 },

  // Hero
  hero: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },

  // Cards
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActive: { borderColor: '#6366F1', borderWidth: 1.5 },

  // Toggle
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleInfo: { flex: 1, marginRight: 16 },
  toggleTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  toggleDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },

  // Section
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },

  // Permission rows
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  permInfo: { flex: 1, marginRight: 12 },
  permTitle: { fontSize: 14, fontWeight: '600', color: '#F8FAFC', marginBottom: 2 },
  permDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 17 },
  permActions: { alignItems: 'flex-end', gap: 6 },
  permStatus: { fontSize: 12, fontWeight: '600' },
  grantBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  grantBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  // Divider
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 8 },

  // Perm note
  permNote: { fontSize: 12, color: '#F59E0B', marginTop: -8, marginBottom: 16, lineHeight: 18 },

  // Features
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  featureIcon: { fontSize: 24, marginRight: 14, width: 32, textAlign: 'center' },
  featureLabel: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  featureNote: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Debug
  debugCard: { borderColor: '#854D0E', borderWidth: 1 },
  debugTitle: { fontSize: 11, color: '#F59E0B', fontWeight: '700', marginBottom: 8 },
  debugText: { fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' },
});
