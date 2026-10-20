import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IndicContext, { type OverlayMode, type IndicLanguageCode } from 'indic-context';

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

const INDIC_LANGUAGES: { code: string; label: string }[] = [
  { code: 'hi-IN', label: 'Hindi (हिन्दी)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'bn-IN', label: 'Bengali (বাংলা)' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം)' },
  { code: 'mr-IN', label: 'Marathi (मराठी)' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)' },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('INPUT_BAR');
  const [permissions, setPermissions] = useState<PermissionState>({
    overlay: 'unknown',
    accessibility: 'unknown',
    microphone: 'unknown',
  });

  // Phase 2: live context buffer state
  const [bufferCount, setBufferCount] = useState(0);
  const [activeApp, setActiveApp] = useState<string | null>(null);

  // Phase 3: Voice-to-Text state
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi-IN');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [sttStatus, setSttStatus] = useState<string>('');

  // Initialize Gnani configuration
  useEffect(() => {
    const key =
      (globalThis as typeof globalThis & { process?: { env?: { EXPO_PUBLIC_GNANI_API_KEY?: string } } }).process?.env
        ?.EXPO_PUBLIC_GNANI_API_KEY ||
      'vach_1ytE2CY5X2DI7nYe19xQ41pIcF75XgUXXFdRLhu4vuhN2qVlIHYqHNjYbqSZW3pAeBxWsMlcCQBgNUyg9O3hxFQoYUUpobcD_3d238769888eacc65a24109ee5f6fe78';
    IndicContext.setGnaniConfig(key, selectedLanguage).catch(() => {});
  }, [selectedLanguage]);

  // Subscribe to Phase 2 & Phase 3 native events
  useEffect(() => {
    const bufferSub = IndicContext.addBufferListener(({ buffer }) => {
      setBufferCount(buffer.length);
    });
    const focusSub = IndicContext.addInputFocusListener(({ appPackage }) => {
      setActiveApp(appPackage.split('.').pop() ?? appPackage);
    });
    const blurSub = IndicContext.addInputBlurListener(() => {
      setActiveApp(null);
    });
    const transcriptSub = IndicContext.addVoiceTranscriptListener((event) => {
      setIsTranscribing(false);
      setIsRecording(false);
      if (event.success && event.text) {
        setTranscript(event.text);
        setSttStatus('✓ Transcribed via Gnani Prisma v2.5');
      } else if (!event.text) {
        setSttStatus('No speech recognized');
      } else {
        setSttStatus('Transcription failed');
      }
    });
    const recordingSub = IndicContext.addRecordingStateListener((event) => {
      setIsRecording(event.isRecording);
      if (event.isRecording) {
        setSttStatus('🎙️ Listening... Speak into microphone');
      }
    });

    return () => {
      bufferSub.remove();
      focusSub.remove();
      blurSub.remove();
      transcriptSub.remove();
      recordingSub.remove();
    };
  }, []);

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

  // ── Mode change handler ──
  const handleModeChange = useCallback(
    async (mode: OverlayMode) => {
      setOverlayMode(mode);
      if (copilotEnabled) {
        try {
          await IndicContext.setOverlayMode(mode);
        } catch (e: any) {
          console.warn('[Dashboard] setOverlayMode error:', e);
        }
      }
    },
    [copilotEnabled],
  );

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
          await IndicContext.startOverlay(overlayMode);
        } else {
          await IndicContext.stopOverlay();
        }
        setCopilotEnabled(value);
      } catch (e: any) {
        console.error('[Dashboard] overlay toggle error:', e);
        Alert.alert('Error', `Failed to toggle the copilot: ${e?.message || e}`);
      }
    },
    [permissions, overlayMode],
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
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message:
              'IndicContext Assistant requires microphone access to transcribe voice into text.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          checkPermissions();
          return;
        } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Linking.openSettings();
          return;
        }
      }
      await IndicContext.requestMicrophonePermission();
      checkPermissions();
    } catch (e) {
      console.warn('[Dashboard] microphone request error:', e);
      Linking.openSettings();
    }
  }, [checkPermissions]);

  const handleToggleVoiceTest = useCallback(async () => {
    if (permissions.microphone !== 'granted') {
      Alert.alert('Microphone Permission Required', 'Please grant microphone permission first.');
      return;
    }

    try {
      if (isRecording) {
        setIsRecording(false);
        setIsTranscribing(true);
        setSttStatus('⏳ Uploading to Gnani Prisma...');
        const result = await IndicContext.stopVoiceRecording();
        setIsTranscribing(false);
        if (result) {
          setTranscript(result);
          setSttStatus('✓ Transcribed via Gnani Prisma v2.5');
        } else {
          setSttStatus('No speech recognized');
        }
      } else {
        setTranscript('');
        setSttStatus('🎙️ Starting microphone...');
        await IndicContext.startVoiceRecording();
        setIsRecording(true);
        setSttStatus('🎙️ Listening... Tap again to stop');
      }
    } catch (err: any) {
      setIsRecording(false);
      setIsTranscribing(false);
      setSttStatus(`STT Error: ${err?.message || err}`);
      console.warn('[Dashboard] voice test error:', err);
    }
  }, [permissions.microphone, isRecording]);

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
                ? activeApp
                  ? `Typing in ${activeApp} — toolbar ready above keyboard.`
                  : 'Tap any chat input in WhatsApp or Telegram.'
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
        {copilotEnabled && bufferCount > 0 && (
          <View style={styles.bufferBadgeRow}>
            <View style={styles.bufferBadge}>
              <Text style={styles.bufferBadgeText}>📋 {bufferCount} context messages captured</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Overlay Behaviour Mode ── */}
      <Text style={styles.sectionHeader}>Overlay Mode</Text>
      <View style={styles.modeContainer}>
        {/* Mode A: Input Bar */}
        <TouchableOpacity
          style={[
            styles.modeCard,
            overlayMode === 'INPUT_BAR' && styles.modeCardActive,
          ]}
          onPress={() => handleModeChange('INPUT_BAR')}
          activeOpacity={0.8}
        >
          <View style={styles.modeCardHeader}>
            <Text style={styles.modeIcon}>⌨️</Text>
            <View style={styles.modeCardTitleCol}>
              <Text style={styles.modeTitle}>Input Bar Mode</Text>
              <Text style={styles.modeSub}>Appears only when typing</Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                overlayMode === 'INPUT_BAR' && styles.radioCircleActive,
              ]}
            >
              {overlayMode === 'INPUT_BAR' && <View style={styles.radioDot} />}
            </View>
          </View>
          <Text style={styles.modeDescription}>
            Opens directly above your keyboard when an input field is tapped. Automatically closes when you finish typing, close the keyboard, or exit chat.
          </Text>
        </TouchableOpacity>

        {/* Mode B: Edge Slider */}
        <TouchableOpacity
          style={[
            styles.modeCard,
            overlayMode === 'EDGE_SLIDER' && styles.modeCardActive,
          ]}
          onPress={() => handleModeChange('EDGE_SLIDER')}
          activeOpacity={0.8}
        >
          <View style={styles.modeCardHeader}>
            <Text style={styles.modeIcon}>🎛️</Text>
            <View style={styles.modeCardTitleCol}>
              <Text style={styles.modeTitle}>Edge Slider Mode</Text>
              <Text style={styles.modeSub}>Subtle pill docked to edge</Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                overlayMode === 'EDGE_SLIDER' && styles.radioCircleActive,
              ]}
            >
              {overlayMode === 'EDGE_SLIDER' && <View style={styles.radioDot} />}
            </View>
          </View>
          <Text style={styles.modeDescription}>
            Stays faded on the screen edge in WhatsApp, Telegram &amp; Instagram. Tap the pill to expand the AI assistant anytime; tap ✕ to collapse.
          </Text>
        </TouchableOpacity>
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

      {/* ── Phase 3: Voice-to-Text (Gnani Prisma V2.5 STT) ── */}
      <Text style={styles.sectionHeader}>Voice-to-Text (Gnani Prisma V2.5)</Text>
      <View style={styles.card}>
        <View style={styles.voiceHeaderRow}>
          <Text style={styles.voiceSectionTitle}>Language</Text>
          <Text style={styles.voiceModelBadge}>Prisma v2.5</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.langScroll}
          contentContainerStyle={styles.langScrollContent}
        >
          {INDIC_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langChip, isSelected && styles.langChipActive]}
                onPress={() => {
                  setSelectedLanguage(lang.code);
                  IndicContext.setLanguage(lang.code).catch(() => {});
                }}
              >
                <Text style={[styles.langChipText, isSelected && styles.langChipTextActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.divider} />

        {/* Live Mic Test Button */}
        <View style={styles.voiceTestContainer}>
          <TouchableOpacity
            style={[
              styles.voiceTestBtn,
              isRecording && styles.voiceTestBtnRecording,
              isTranscribing && styles.voiceTestBtnTranscribing,
            ]}
            onPress={handleToggleVoiceTest}
            disabled={isTranscribing}
            activeOpacity={0.8}
          >
            {isTranscribing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.voiceTestIcon}>{isRecording ? '⏹️' : '🎙️'}</Text>
            )}
            <Text style={styles.voiceTestBtnText}>
              {isTranscribing
                ? 'Transcribing with Gnani Prisma...'
                : isRecording
                ? 'Stop Recording'
                : 'Test Voice-to-Text'}
            </Text>
          </TouchableOpacity>

          {sttStatus ? <Text style={styles.sttStatusText}>{sttStatus}</Text> : null}

          {/* Transcript Display Box */}
          {transcript ? (
            <View style={styles.transcriptBox}>
              <View style={styles.transcriptHeader}>
                <Text style={styles.transcriptLabel}>Transcript ({selectedLanguage}):</Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(transcript);
                    Alert.alert('Copied', 'Transcript copied to clipboard!');
                  }}
                >
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.transcriptContent}>{transcript}</Text>
            </View>
          ) : null}
        </View>
      </View>

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

  // Phase 2 buffer badge
  bufferBadgeRow: { marginTop: 10, alignItems: 'flex-start' },
  bufferBadge: {
    backgroundColor: '#1E3A5F',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  bufferBadgeText: { fontSize: 11, color: '#93C5FD', fontWeight: '500' },

  // Mode Selection
  modeContainer: { gap: 12, marginBottom: 16 },
  modeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  modeCardActive: {
    borderColor: '#6366F1',
    backgroundColor: '#182038',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  modeCardTitleCol: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modeSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#6366F1',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366F1',
  },
  modeDescription: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },

  // Voice Section (Phase 3)
  voiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  voiceSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  voiceModelBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#818CF8',
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  langScroll: {
    marginBottom: 6,
  },
  langScrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  langChip: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langChipActive: {
    backgroundColor: '#312E81',
    borderColor: '#6366F1',
  },
  langChipText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  langChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  voiceTestContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  voiceTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    elevation: 3,
  },
  voiceTestBtnRecording: {
    backgroundColor: '#DC2626',
  },
  voiceTestBtnTranscribing: {
    backgroundColor: '#475569',
  },
  voiceTestIcon: {
    fontSize: 18,
  },
  voiceTestBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sttStatusText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  transcriptBox: {
    marginTop: 14,
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
    textTransform: 'uppercase',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  transcriptContent: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
  },
});
