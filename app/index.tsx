import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IndicContext, {
  type OverlayMode,
  type IndicLanguageCode,
  type ActionTriggeredEvent,
} from 'indic-context';

import {
  ChatBubble,
  FactCheckResult,
  GlobalUserPersona,
  HinglishIntensity,
  ImproveTextResult,
  SmartRepliesResult,
  ThreadSummaryResult,
  ToneOption,
  ToneSensitivityResult,
} from '../src/types/context';
import { getGlobalPersona, updateGlobalPersona } from '../src/services/globalPersonaStore';
import {
  checkFactsAndInconsistencies,
  checkToneSensitivity,
  summarizeThread,
} from '../src/services/gnaniEvonLlm';
import { generateSmartReplies, improveText } from '../src/services/aiFeatures';
import { describeLlmError, getGnaniSttKey, getLlmInfo, isLlmError } from '../src/services/llm/llmClient';

const LLM_LABEL = (() => {
  const { provider, model } = getLlmInfo();
  return `${provider === 'gemini' ? 'Gemini' : 'Evon'} · ${model}`;
})();
import { getCleanFirstName } from '../src/utils/contactName';

/** "casual banter · close friends · Hinglish" — what the LLM inferred about the chat. */
function describeInsight(r: { tone: string; relationship: string; language?: string }): string {
  return [r.tone, r.relationship, r.language].filter((x) => x && x !== 'unknown').join(' · ');
}

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
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi (हिन्दी)' },
  { code: 'mr-IN', label: 'Marathi (मराठी)' },
  { code: 'bn-IN', label: 'Bangla (বাংলা)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം)' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)' },
];

const TONES: { id: ToneOption; label: string }[] = [
  { id: 'polite', label: 'Polite' },
  { id: 'casual', label: 'Casual' },
  { id: 'respectful', label: 'Respectful' },
  { id: 'informative', label: 'Informative' },
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

  // Live context buffer & thread state
  const [bufferCount, setBufferCount] = useState(0);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [currentBuffer, setCurrentBuffer] = useState<ChatBubble[]>([]);

  // Live Smart Replies (mirrors what the overlay card shows)
  const [liveSmartReplies, setLiveSmartReplies] = useState<string[]>([]);
  /** LLM-inferred tone / relationship / language for the active chat. */
  const [liveInsight, setLiveInsight] = useState<string>('');
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  // References to debounce and prevent constant re-generation / flickering
  const lastHandledMsgRef = useRef<string>('');

  // User's own global preferences
  const [globalPersona, setGlobalPersona] = useState<GlobalUserPersona | null>(null);

  // Catch-Up Summary state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<ThreadSummaryResult | null>(null);

  // Phase 3: Voice-to-Text state
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en-IN');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [sttStatus, setSttStatus] = useState<string>('');

  // Interactive Test Bench state
  const [testDraft, setTestDraft] = useState<string>('tu jaldi bhej abhi');
  const [testToneResult, setTestToneResult] = useState<ToneSensitivityResult | null>(null);
  const [testFactResult, setTestFactResult] = useState<FactCheckResult | null>(null);
  const [testRepliesResult, setTestRepliesResult] = useState<SmartRepliesResult | null>(null);
  const [testImproveResult, setTestImproveResult] = useState<ImproveTextResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Load initial global persona
  useEffect(() => {
    getGlobalPersona().then(setGlobalPersona).catch(() => {});
  }, []);

  // Initialize Gnani speech (STT) configuration
  useEffect(() => {
    IndicContext.setGnaniConfig(getGnaniSttKey(), selectedLanguage).catch(() => {});
  }, [selectedLanguage]);

  // Subscribe to Native Events
  useEffect(() => {
    const bufferSub = IndicContext.addBufferListener(async ({ buffer, threadTitle, threadId }) => {
      const bubbles = buffer as ChatBubble[];
      setBufferCount(bubbles.length);
      setCurrentBuffer(bubbles);
      if (threadTitle) setActiveThreadTitle(threadTitle);

      // ── Passive Smart Replies: only when the newest *attributed* message is from the contact ──
      const lastAttributed = [...bubbles].reverse().find((b) => b.isSelf === true || b.isSelf === false);
      if (!lastAttributed || lastAttributed.isSelf !== false) return;

      const msgKey = `${threadId ?? ''}:${lastAttributed.text.trim()}`;
      if (msgKey === lastHandledMsgRef.current) return;
      lastHandledMsgRef.current = msgKey;

      try {
        const res = await generateSmartReplies(bubbles, threadTitle);
        // A newer message may have arrived while we were waiting — drop stale results
        if (lastHandledMsgRef.current !== msgKey || res.replies.length === 0) return;
        setLiveSmartReplies(res.replies);
        setLiveInsight(describeInsight(res));
        await IndicContext.showSmartReplies(
          `💬 Reply to ${getCleanFirstName(threadTitle)}`,
          describeInsight(res),
          res.replies,
        );
      } catch (e) {
        // Passive suggestions never show an error card — just log why.
        console.warn('[SmartReplies] auto generation failed:', isLlmError(e) ? `${e.kind} ${e.message}` : e);
      }
    });

    const focusSub = IndicContext.addInputFocusListener(({ appPackage }) => {
      setActiveApp(appPackage.split('.').pop() ?? appPackage);
      IndicContext.getActiveThread()
        .then((info) => {
          if (info.threadTitle) setActiveThreadTitle(info.threadTitle);
        })
        .catch(() => {});
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

    const disabledSub = IndicContext.addCopilotDisabledListener(() => {
      setCopilotEnabled(false);
    });

    // ── Floating Toolbar Action Trigger Interceptor (also fired by the error card's Retry chip) ──
    const actionSub = IndicContext.addActionTriggeredListener(async (event: ActionTriggeredEvent) => {
      const { action } = event;
      try {
        const buffer = (await IndicContext.getSessionBuffer()) as ChatBubble[];
        const threadInfo = await IndicContext.getActiveThread();
        const threadTitle = threadInfo?.threadTitle ?? null;
        const firstName = getCleanFirstName(threadTitle);

        // event.draftText is read by OverlayService at tap time; fall back to polling the input field
        const rawDraft = (event.draftText && event.draftText.trim())
          ? event.draftText.trim()
          : ((await IndicContext.readInputFieldText()) || '').trim();

        if (action === 'improve') {
          if (!rawDraft) {
            await IndicContext.showAiError('✨ Improve Text', 'Type a message in the chat first, then tap ✨.', null);
            return;
          }
          const res = await improveText(rawDraft, buffer, threadTitle);
          const options = [res.improved, ...res.alternatives];
          await IndicContext.showSmartReplies(
            res.wasModified ? `✨ Improved for ${firstName}` : '✨ Already sounds natural',
            res.note || describeInsight(res),
            options,
          );
          setLiveSmartReplies(options);
          setLiveInsight(describeInsight(res));
        } else if (action === 'smart_replies') {
          const res = await generateSmartReplies(buffer, threadTitle);
          if (res.replies.length === 0) {
            await IndicContext.showAiError(
              '💬 Smart Replies',
              'No messages captured from this chat yet. Scroll the chat slightly and try again.',
              null,
            );
            return;
          }
          await IndicContext.showSmartReplies(`💬 Smart Replies for ${firstName}`, describeInsight(res), res.replies);
          setLiveSmartReplies(res.replies);
          setLiveInsight(describeInsight(res));
        } else if (action === 'factcheck') {
          if (!rawDraft) {
            await IndicContext.showAiError('🔍 Fact Check', 'Type a message in the chat first, then tap 🔍.', null);
            return;
          }
          const factResult = await checkFactsAndInconsistencies(rawDraft, buffer, threadTitle);
          if (factResult.hasConflict && factResult.inconsistencies.length > 0) {
            const warningMsg = factResult.inconsistencies
              .map((i) => `• ${i.explanation}\n  Earlier: "${i.earlierStatement}"`)
              .join('\n\n');

            Alert.alert(
              '⚠️ Fact Check Conflict Detected',
              `${warningMsg}\n\nSuggested correction: "${factResult.suggestedCorrection}"`,
              [
                { text: 'Keep Draft', style: 'cancel' },
                {
                  text: 'Apply Correction',
                  onPress: () => {
                    if (factResult.suggestedCorrection) {
                      IndicContext.injectText(factResult.suggestedCorrection).catch(() => {});
                    }
                  },
                },
              ],
            );
          } else {
            Alert.alert('✓ Fact Check Passed', 'No factual inconsistencies or contradictions found with earlier messages.');
          }
        }
      } catch (err: unknown) {
        console.warn(`[Dashboard] action "${action}" failed:`, isLlmError(err) ? `${err.kind} ${err.message}` : err);
        await IndicContext.showAiError('⚠️ AI unavailable', describeLlmError(err), action).catch(() => {});
      }
    });

    return () => {
      bufferSub.remove();
      focusSub.remove();
      blurSub.remove();
      transcriptSub.remove();
      recordingSub.remove();
      disabledSub.remove();
      actionSub.remove();
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

  // Poll permissions when screen is active
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

  // ── Catch-Up Summary Trigger ──
  const handleCatchUpSummary = useCallback(async () => {
    setIsSummarizing(true);
    try {
      const buffer = (await IndicContext.getSessionBuffer()) as ChatBubble[];
      const res = await summarizeThread(buffer, activeThreadTitle);
      setSummaryResult(res);
    } catch (err: unknown) {
      Alert.alert('Summary Error', describeLlmError(err));
    } finally {
      setIsSummarizing(false);
    }
  }, [activeThreadTitle]);

  // ── Global Persona Updates ──
  const handleToneChange = useCallback(async (tone: ToneOption) => {
    try {
      const updated = await updateGlobalPersona({ defaultTone: tone });
      setGlobalPersona(updated);
    } catch (e) {
      console.warn('[Dashboard] updateGlobalPersona tone error:', e);
    }
  }, []);

  const handleHinglishChange = useCallback(async (intensity: HinglishIntensity) => {
    try {
      const updated = await updateGlobalPersona({ hinglishIntensity: intensity });
      setGlobalPersona(updated);
    } catch (e) {
      console.warn('[Dashboard] updateGlobalPersona hinglish error:', e);
    }
  }, []);

  // ── Interactive Test Bench Execution ──
  // All tests run against the live captured buffer of the active chat; the LLM infers the relationship.
  const getLiveBuffer = useCallback(async (): Promise<ChatBubble[]> => {
    if (currentBuffer.length > 0) return currentBuffer;
    return (await IndicContext.getSessionBuffer()) as ChatBubble[];
  }, [currentBuffer]);

  const clearTestResults = useCallback(() => {
    setTestToneResult(null);
    setTestFactResult(null);
    setTestRepliesResult(null);
    setTestImproveResult(null);
  }, []);

  const runTest = useCallback(
    async (label: string, run: () => Promise<void>) => {
      setIsAnalyzing(true);
      clearTestResults();
      try {
        await run();
      } catch (e: unknown) {
        Alert.alert(`${label} Error`, isLlmError(e) ? describeLlmError(e) : String((e as Error)?.message ?? e));
      } finally {
        setIsAnalyzing(false);
      }
    },
    [clearTestResults],
  );

  const runTestToneCheck = useCallback(
    () =>
      runTest('Tone Guard', async () => {
        setTestToneResult(await checkToneSensitivity(testDraft, await getLiveBuffer(), activeThreadTitle));
      }),
    [runTest, testDraft, getLiveBuffer, activeThreadTitle],
  );

  const runTestFactCheck = useCallback(
    () =>
      runTest('Fact Check', async () => {
        setTestFactResult(await checkFactsAndInconsistencies(testDraft, await getLiveBuffer(), activeThreadTitle));
      }),
    [runTest, testDraft, getLiveBuffer, activeThreadTitle],
  );

  const runTestSmartReplies = useCallback(
    () =>
      runTest('Smart Replies', async () => {
        const res = await generateSmartReplies(await getLiveBuffer(), activeThreadTitle);
        if (res.replies.length === 0) {
          Alert.alert('Smart Replies', 'No attributed messages captured yet. Open a WhatsApp chat first.');
          return;
        }
        setTestRepliesResult(res);
      }),
    [runTest, getLiveBuffer, activeThreadTitle],
  );

  const runTestImprove = useCallback(() => {
    if (!testDraft.trim()) {
      Alert.alert('Empty Draft', 'Please enter a test draft message to improve.');
      return;
    }
    return runTest('Improve', async () => {
      setTestImproveResult(await improveText(testDraft, await getLiveBuffer(), activeThreadTitle));
    });
  }, [runTest, testDraft, getLiveBuffer, activeThreadTitle]);

  // ── Live Smart Replies (manual refresh from dashboard) ──
  const handleGenerateLiveReplies = useCallback(async () => {
    setIsGeneratingReplies(true);
    try {
      const res = await generateSmartReplies(await getLiveBuffer(), activeThreadTitle);
      setLiveSmartReplies(res.replies);
      setLiveInsight(describeInsight(res));
      if (res.replies.length > 0) {
        await IndicContext.showSmartReplies(
          `💬 Smart Replies for ${getCleanFirstName(activeThreadTitle)}`,
          describeInsight(res),
          res.replies,
        );
      }
    } catch (e: unknown) {
      Alert.alert('Smart Replies Error', describeLlmError(e));
    } finally {
      setIsGeneratingReplies(false);
    }
  }, [getLiveBuffer, activeThreadTitle]);

  const handleInjectReply = useCallback(async (text: string) => {
    try {
      await IndicContext.injectText(text);
      Alert.alert('✓ Injected into Chat', `Pasted directly into WhatsApp message bar:\n"${text}"`);
    } catch (e: any) {
      Clipboard.setString(text);
      Alert.alert('Copied to Clipboard', `Pasting requires WhatsApp to be open with input bar active.\n\nCopied to clipboard:\n"${text}"`);
    }
  }, []);

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
          Context-Aware Messaging Assistant · Gnani STT · {LLM_LABEL}
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
                  ? `Active in ${activeApp} — floating toolbar ready above keyboard.`
                  : 'Floating overlay enabled. Open WhatsApp to use.'
                : 'Enable to launch the floating copilot overlay over your keyboard.'}
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

      {/* ── Active Chat ── */}
      <Text style={styles.sectionHeader}>Active Chat</Text>
      <View style={styles.card}>
        <View style={styles.threadHeaderRow}>
          <View style={styles.threadTitleCol}>
            <Text style={styles.threadLabel}>Active Conversation</Text>
            <Text style={styles.threadContactName}>
              {activeThreadTitle ? `💬 ${activeThreadTitle}` : 'Waiting for chat input in WhatsApp...'}
            </Text>
          </View>
        </View>

        {liveInsight ? (
          <View style={styles.insightContainer}>
            <Text style={styles.subLabel}>AI-inferred from the conversation:</Text>
            <View style={styles.insightBadge}>
              <Text style={styles.insightBadgeText}>{liveInsight}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.divider} />

        {/* Catch-Up Summarizer Row */}
        <View style={styles.summaryActionRow}>
          <View style={styles.summaryMeta}>
            <Text style={styles.summaryMetaTitle}>Buffer Context: {bufferCount} messages</Text>
            <Text style={styles.summaryMetaSub}>RAM-only session storage</Text>
          </View>
          <TouchableOpacity
            style={[styles.catchUpBtn, bufferCount === 0 && styles.btnDisabled]}
            disabled={bufferCount === 0 || isSummarizing}
            onPress={handleCatchUpSummary}
          >
            {isSummarizing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.catchUpBtnText}>📑 Catch-Up Summary</Text>
            )}
          </TouchableOpacity>
        </View>

        {summaryResult && (
          <View style={styles.summaryResultBox}>
            <Text style={styles.summaryResultBrief}>{summaryResult.brief}</Text>
            {summaryResult.directAsks.length > 0 && (
              <View style={styles.summarySubSection}>
                <Text style={styles.summarySubHeading}>Direct Asks from Contact:</Text>
                {summaryResult.directAsks.map((ask, i) => (
                  <Text key={i} style={styles.summaryBullet}>• {ask}</Text>
                ))}
              </View>
            )}
            {summaryResult.actionItems.length > 0 && (
              <View style={styles.summarySubSection}>
                <Text style={styles.summarySubHeading}>Action Items & Deadlines:</Text>
                {summaryResult.actionItems.map((act, i) => (
                  <Text key={i} style={styles.summaryBullet}>• {act}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Live Smart Replies Card ── */}
      <Text style={styles.sectionHeader}>💬 Smart Replies</Text>
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.subLabel}>
            {activeThreadTitle
              ? `Next-message suggestions for ${activeThreadTitle}`
              : 'Waiting for a WhatsApp chat...'}
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleGenerateLiveReplies}
            disabled={isGeneratingReplies}
          >
            {isGeneratingReplies ? (
              <ActivityIndicator color="#00E5FF" size="small" />
            ) : (
              <Text style={styles.refreshBtnText}>🔄 Generate</Text>
            )}
          </TouchableOpacity>
        </View>

        {liveSmartReplies.length > 0 ? (
          <View style={styles.recommendationsList}>
            {liveSmartReplies.map((reply, idx) => (
              <View key={idx} style={styles.recommendationItem}>
                <Text style={styles.recommendationText}>"{reply}"</Text>
                <TouchableOpacity
                  style={styles.injectSmallBtn}
                  onPress={() => handleInjectReply(reply)}
                >
                  <Text style={styles.injectSmallBtnText}>Inject ↵</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyStateText}>
            When the contact sends a message, or you tap 💬 on the floating toolbar, 3 replies written in the chat's own tone and language appear here and on the overlay.
          </Text>
        )}
      </View>

      {/* ── User's own global preferences ── */}
      <Text style={styles.sectionHeader}>Your Preferences</Text>
      <View style={styles.card}>
        <Text style={styles.subLabel}>Default Rewriting Tone:</Text>
        <View style={styles.prefPillsRow}>
          {TONES.map((t) => {
            const isSelected = globalPersona?.defaultTone === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.prefChip, isSelected && styles.prefChipActive]}
                onPress={() => handleToneChange(t.id)}
              >
                <Text style={[styles.prefChipText, isSelected && styles.prefChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.divider} />

        <Text style={styles.subLabel}>Hinglish Intensity:</Text>
        <View style={styles.prefPillsRow}>
          {[
            { id: 'pure_english' as HinglishIntensity, label: 'Pure English' },
            { id: 'light_hinglish' as HinglishIntensity, label: 'Light Hinglish' },
            { id: 'deep_indic' as HinglishIntensity, label: 'Deep Indic' },
          ].map((item) => {
            const isSelected = globalPersona?.hinglishIntensity === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.prefChip, isSelected && styles.prefChipActive]}
                onPress={() => handleHinglishChange(item.id)}
              >
                <Text style={[styles.prefChipText, isSelected && styles.prefChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Context AI Feature Test Bench ── */}
      <Text style={styles.sectionHeader}>Context AI Test Bench ({LLM_LABEL})</Text>
      <View style={styles.card}>
        <Text style={styles.subLabel}>Test Draft Message:</Text>
        <TextInput
          style={styles.testInput}
          value={testDraft}
          onChangeText={setTestDraft}
          placeholder="Type draft (e.g. tu jaldi bhej, see you at 2pm, done)..."
          placeholderTextColor="#64748B"
        />

        <View style={styles.testActionRow}>
          <TouchableOpacity
            style={styles.testActionBtn}
            onPress={runTestToneCheck}
            disabled={isAnalyzing}
          >
            <Text style={styles.testActionText}>🛡️ Tone Guard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testActionBtn}
            onPress={runTestImprove}
            disabled={isAnalyzing}
          >
            <Text style={styles.testActionText}>✨ Improve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testActionBtn}
            onPress={runTestFactCheck}
            disabled={isAnalyzing}
          >
            <Text style={styles.testActionText}>🔍 Fact Check</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testActionBtn}
            onPress={runTestSmartReplies}
            disabled={isAnalyzing}
          >
            <Text style={styles.testActionText}>💬 Smart Replies</Text>
          </TouchableOpacity>
        </View>

        {isAnalyzing && (
          <View style={styles.analyzingRow}>
            <ActivityIndicator color="#6366F1" size="small" />
            <Text style={styles.analyzingText}>Analyzing with {LLM_LABEL}...</Text>
          </View>
        )}

        {/* Tone Result Box */}
        {testToneResult && (
          <View style={[
            styles.testResultCard,
            testToneResult.isDisrespectful ? styles.testResultCardDanger : styles.testResultCardSuccess,
          ]}>
            <Text style={styles.resultTitle}>
              {testToneResult.isDisrespectful ? '⚠️ Disrespect Flagged' : '✓ Respectful & Appropriate'}
            </Text>
            <Text style={styles.resultSub}>Detected Tone: {testToneResult.toneDetected}</Text>
            {testToneResult.reasons.map((r, i) => (
              <Text key={i} style={styles.resultDetail}>• {r}</Text>
            ))}
            {testToneResult.isDisrespectful && (
              <View style={styles.suggestedBox}>
                <Text style={styles.suggestedLabel}>Suggested Alternative:</Text>
                <Text style={styles.suggestedText}>{testToneResult.suggestedDraft}</Text>
              </View>
            )}
          </View>
        )}

        {/* Fact Check Result Box */}
        {testFactResult && (
          <View style={[
            styles.testResultCard,
            testFactResult.hasConflict ? styles.testResultCardDanger : styles.testResultCardSuccess,
          ]}>
            <Text style={styles.resultTitle}>
              {testFactResult.hasConflict ? '⚠️ Inconsistency Flagged' : '✓ Factual Consistency Verified'}
            </Text>
            {testFactResult.inconsistencies.map((inc, i) => (
              <Text key={i} style={styles.resultDetail}>• {inc.explanation} ({inc.earlierStatement})</Text>
            ))}
            {testFactResult.suggestedCorrection && testFactResult.hasConflict && (
              <View style={styles.suggestedBox}>
                <Text style={styles.suggestedLabel}>Correction:</Text>
                <Text style={styles.suggestedText}>{testFactResult.suggestedCorrection}</Text>
              </View>
            )}
          </View>
        )}

        {/* Smart Replies Result Box */}
        {testRepliesResult && (
          <View style={[styles.testResultCard, styles.testResultCardSuccess]}>
            <Text style={styles.resultTitle}>💬 Smart Replies</Text>
            <Text style={styles.resultSub}>{describeInsight(testRepliesResult)}</Text>
            {testRepliesResult.replies.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.suggestionPill}
                onPress={() => {
                  Clipboard.setString(s);
                  Alert.alert('Copied', `"${s}" copied to clipboard!`);
                }}
              >
                <Text style={styles.suggestionPillText}>{i + 1}. {s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Improve Result Box */}
        {testImproveResult && (
          <View style={[styles.testResultCard, styles.testResultCardSuccess]}>
            <Text style={styles.resultTitle}>
              {testImproveResult.wasModified ? '✨ Contextual Rewrite' : '✨ Already sounds natural'}
            </Text>
            <Text style={styles.resultSub}>{describeInsight(testImproveResult)}</Text>
            {testImproveResult.note ? <Text style={styles.resultDetail}>{testImproveResult.note}</Text> : null}
            {[testImproveResult.improved, ...testImproveResult.alternatives].map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.suggestionPill}
                onPress={() => {
                  Clipboard.setString(s);
                  Alert.alert('Copied', `"${s}" copied to clipboard!`);
                }}
              >
                <Text style={styles.suggestionPillText}>{i === 0 ? '★ Best: ' : '• Option: '}{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Overlay Behaviour Mode ── */}
      <Text style={styles.sectionHeader}>Overlay Mode</Text>
      <View style={styles.modeContainer}>
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
            Stays docked on the screen edge in WhatsApp. Tap the pill to expand the AI assistant anytime; drag to edge to snap, or drop on bottom (X) to disable.
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
  hero: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  heroEmoji: { fontSize: 44, marginBottom: 10 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 300,
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
    marginTop: 6,
  },

  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },

  // Tier 2 Active Thread
  threadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  threadTitleCol: { flex: 1, marginRight: 10 },
  threadLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' },
  threadContactName: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginTop: 2 },
  insightBadge: {
    backgroundColor: '#312E81',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  insightBadgeText: { fontSize: 11, fontWeight: '700', color: '#C7D2FE' },
  insightContainer: { marginTop: 6 },
  prefPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prefChip: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  prefChipActive: { backgroundColor: '#4F46E5', borderColor: '#818CF8' },
  prefChipText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  prefChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Summary Row
  summaryActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  summaryMeta: { flex: 1 },
  summaryMetaTitle: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  summaryMetaSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  catchUpBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  catchUpBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  summaryResultBox: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  summaryResultBrief: { fontSize: 13, color: '#F0F9FF', lineHeight: 18, fontWeight: '500' },
  summarySubSection: { marginTop: 8 },
  summarySubHeading: { fontSize: 11, color: '#38BDF8', fontWeight: '700', marginBottom: 2 },
  summaryBullet: { fontSize: 12, color: '#CBD5E1', lineHeight: 16, marginLeft: 4 },

  // Live Smart Replies
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recommendationsList: {
    gap: 8,
    marginTop: 4,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: '#F8FAFC',
    lineHeight: 18,
  },
  injectSmallBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  injectSmallBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyStateText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  refreshBtn: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  refreshBtnText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Test Bench
  testInput: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  testActionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  testActionBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  testActionText: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  analyzingText: { fontSize: 12, color: '#818CF8' },
  testResultCard: {
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
  },
  testResultCardDanger: { backgroundColor: '#450A0A', borderColor: '#EF4444' },
  testResultCardSuccess: { backgroundColor: '#064E3B', borderColor: '#10B981' },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  resultSub: { fontSize: 12, color: '#E2E8F0', marginBottom: 6 },
  resultDetail: { fontSize: 12, color: '#CBD5E1', marginLeft: 4, lineHeight: 16 },
  suggestedBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
  },
  suggestedLabel: { fontSize: 11, color: '#FDE047', fontWeight: '700' },
  suggestedText: { fontSize: 13, color: '#FFFFFF', marginTop: 2, fontStyle: 'italic' },
  suggestionPill: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  suggestionPillText: { fontSize: 12, color: '#FFFFFF' },

  // Mode Selection
  modeContainer: { gap: 12, marginBottom: 16 },
  modeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  modeCardActive: { borderColor: '#6366F1', backgroundColor: '#182038' },
  modeCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  modeIcon: { fontSize: 22, marginRight: 10 },
  modeCardTitleCol: { flex: 1 },
  modeTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  modeSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: '#6366F1' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6366F1' },
  modeDescription: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },

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

  divider: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  permNote: { fontSize: 12, color: '#F59E0B', marginTop: -8, marginBottom: 16, lineHeight: 18 },

  // Voice Section (Phase 3)
  voiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  voiceSectionTitle: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
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
  langScroll: { marginBottom: 6 },
  langScrollContent: { gap: 8, paddingVertical: 4 },
  langChip: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langChipActive: { backgroundColor: '#312E81', borderColor: '#6366F1' },
  langChipText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  langChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  voiceTestContainer: { alignItems: 'center', paddingVertical: 6 },
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
  voiceTestBtnRecording: { backgroundColor: '#DC2626' },
  voiceTestBtnTranscribing: { backgroundColor: '#475569' },
  voiceTestIcon: { fontSize: 18 },
  voiceTestBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sttStatusText: { fontSize: 12, color: '#94A3B8', marginTop: 8, textAlign: 'center' },
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
  copyBtnText: { fontSize: 11, fontWeight: '700', color: '#38BDF8' },
  transcriptContent: { fontSize: 14, color: '#F8FAFC', lineHeight: 20 },
});
