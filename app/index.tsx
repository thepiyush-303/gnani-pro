/**
 * Home — status, on/off, permission setup, assistant settings, catch-up summary.
 * Toolbar actions themselves are handled app-wide by CopilotBridgeProvider.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IndicContext, { type TimbreVoice } from 'indic-context';

import type { ChatBubble, ThreadSummaryResult } from '../src/types/context';
import { summarizeThread } from '../src/services/gnaniEvonLlm';
import { describeLlmError, getLlmInfo } from '../src/services/llm/llmClient';
import { isOnboarded } from '../src/services/onboardingStore';
import { useCopilot } from '../src/hooks/CopilotBridge';
import { usePermissions } from '../src/hooks/usePermissions';
import { font, radius, space, useTheme } from '../src/ui/theme';
import {
  AppMark,
  Card,
  Chip,
  IconBadge,
  type IconName,
  PermissionRow,
  PrimaryButton,
  SectionTitle,
  StatusPill,
} from '../src/ui/components';

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
];

const HOW_TO: { icon: IconName; title: string; body: string }[] = [
  { icon: 'creation', title: 'Improve', body: 'Type a draft, then tap ✨ to rewrite it in the chat’s own tone.' },
  { icon: 'translate', title: 'Translate', body: 'Tap 🌐 to turn your draft into English or Hindi; hold and glide to choose.' },
  { icon: 'forum-outline', title: 'Smart replies', body: 'Tap 💬 for three replies that fit the conversation.' },
  { icon: 'microphone-outline', title: 'Dictate', body: 'Tap 🎙 to speak; hold and glide to change language.' },
  { icon: 'account-voice', title: 'Voice notes', body: 'Tap 🗣 to record in another voice; hold and glide to pick it.' },
];

const llm = getLlmInfo();

export default function HomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeChat, bufferCount, copilotEnabled, setCopilotEnabled } = useCopilot();
  const { perms, allGranted, grantedCount, openOverlaySettings, openAccessibilitySettings, openAppInfo, requestMicrophone } =
    usePermissions();

  const [language, setLanguage] = useState('en-IN');
  const [voices, setVoices] = useState<TimbreVoice[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [summary, setSummary] = useState<ThreadSummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // First launch → tutorial
  useEffect(() => {
    isOnboarded().then((done) => {
      if (!done) router.replace('/onboarding');
    });
  }, [router]);

  useEffect(() => {
    IndicContext.getLanguage().then(setLanguage).catch(() => {});
    IndicContext.getVoices().then(setVoices).catch(() => {});
    IndicContext.getVoice().then(setVoice).catch(() => {});
  }, []);

  const toggleCopilot = useCallback(
    async (on: boolean) => {
      if (on && !allGranted) {
        Alert.alert('Finish setup first', 'Grant the permissions in “Finish setup” to turn the assistant on.');
        return;
      }
      try {
        await setCopilotEnabled(on);
      } catch (e: any) {
        Alert.alert('Couldn’t switch the assistant', e?.message || String(e));
      }
    },
    [allGranted, setCopilotEnabled],
  );

  const pickLanguage = useCallback(async (code: string) => {
    setLanguage(code);
    await IndicContext.setLanguage(code).catch(() => {});
  }, []);

  const pickVoice = useCallback(async (id: string) => {
    setVoice(id);
    await IndicContext.setVoice(id).catch(() => {});
  }, []);

  const runSummary = useCallback(async () => {
    setSummarizing(true);
    try {
      const buffer = (await IndicContext.getSessionBuffer()) as ChatBubble[];
      setSummary(await summarizeThread(buffer, activeChat));
    } catch (e) {
      Alert.alert('Summary unavailable', describeLlmError(e));
    } finally {
      setSummarizing(false);
    }
  }, [activeChat]);

  const status = !allGranted
    ? { label: 'Setup needed', tone: 'warning' as const }
    : copilotEnabled
      ? { label: 'Active in WhatsApp chats', tone: 'success' as const }
      : { label: 'Paused', tone: 'muted' as const };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <AppMark size={46} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={[font.title, { color: c.text }]}>IndicContext</Text>
          <Text style={[font.small, { color: c.textMuted }]}>Your assistant inside WhatsApp</Text>
        </View>
        <Pressable onPress={() => router.push('/onboarding')} hitSlop={10} accessibilityLabel="How to use">
          <MaterialCommunityIcons name="help-circle-outline" size={26} color={c.textMuted} />
        </Pressable>
      </View>

      {/* ── Power ── */}
      <Card style={{ backgroundColor: copilotEnabled && allGranted ? c.primarySoft : c.surface }}>
        <View style={styles.row}>
          <IconBadge icon="power" color={copilotEnabled ? c.onPrimary : c.textMuted} bg={copilotEnabled ? c.primary : c.surfaceAlt} size={46} />
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <Text style={[font.heading, { color: c.text }]}>Assistant</Text>
            <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <StatusPill label={status.label} tone={status.tone} />
            </View>
          </View>
          <Switch
            value={copilotEnabled}
            onValueChange={toggleCopilot}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Text style={[font.small, { color: c.textMuted, marginTop: space.md }]}>
          {copilotEnabled
            ? 'Open any WhatsApp chat: the bubble sits above the message box. Tap it for the toolbar; it closes when you touch anything else.'
            : allGranted
              ? 'Turn on to show the assistant bubble inside your WhatsApp chats.'
              : 'Grant the permissions below, then turn the assistant on.'}
        </Text>
      </Card>

      {/* ── Setup checklist ── */}
      {!allGranted && (
        <>
          <SectionTitle right={<Text style={[font.small, { color: c.textMuted }]}>{grantedCount}/3</Text>}>
            Finish setup
          </SectionTitle>
          <Card>
            <PermissionRow
              icon="layers-outline"
              title="Display over other apps"
              description="Shows the bubble and toolbar on top of WhatsApp."
              status={perms.overlay}
              onGrant={openOverlaySettings}
            />
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <PermissionRow
              icon="gesture-tap"
              title="Accessibility"
              description="Reads the open chat for context and inserts text you choose."
              status={perms.accessibility}
              onGrant={openAccessibilitySettings}
              hint={
                <Text style={[font.small, { color: c.textFaint }]}>
                  Switch greyed out (“Restricted setting”)?{' '}
                  <Text style={{ color: c.primary, fontWeight: '700' }} onPress={openAppInfo}>
                    Open App info
                  </Text>{' '}
                  → ⋮ → Allow restricted settings, then come back.
                </Text>
              }
            />
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <PermissionRow
              icon="microphone-outline"
              title="Microphone"
              description="For dictation and voice notes."
              status={perms.microphone}
              onGrant={requestMicrophone}
            />
          </Card>
        </>
      )}

      {/* ── Active chat + catch-up ── */}
      <SectionTitle>Current chat</SectionTitle>
      <Card>
        {activeChat ? (
          <>
            <View style={styles.row}>
              <IconBadge icon="whatsapp" color={c.success} bg={c.successSoft} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={[font.body, { color: c.text, fontWeight: '700' }]} numberOfLines={1}>
                  {activeChat}
                </Text>
                <Text style={[font.small, { color: c.textMuted }]}>{bufferCount} recent messages read</Text>
              </View>
            </View>
            <PrimaryButton
              title="Catch-up summary"
              icon="text-box-search-outline"
              variant="soft"
              onPress={runSummary}
              loading={summarizing}
              disabled={bufferCount === 0}
              style={{ marginTop: space.md }}
            />
            {summary && (
              <View style={[styles.summary, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[font.body, { color: c.text }]}>{summary.brief}</Text>
                {summary.directAsks.length > 0 && (
                  <>
                    <Text style={[font.label, { color: c.textFaint, marginTop: space.md }]}>They asked you</Text>
                    {summary.directAsks.map((a, i) => (
                      <Text key={i} style={[font.small, { color: c.textMuted, marginTop: 4 }]}>• {a}</Text>
                    ))}
                  </>
                )}
                {summary.actionItems.length > 0 && (
                  <>
                    <Text style={[font.label, { color: c.textFaint, marginTop: space.md }]}>Pending</Text>
                    {summary.actionItems.map((a, i) => (
                      <Text key={i} style={[font.small, { color: c.textMuted, marginTop: 4 }]}>• {a}</Text>
                    ))}
                  </>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.row}>
            <IconBadge icon="chat-outline" color={c.textMuted} bg={c.surfaceAlt} />
            <Text style={[font.small, { color: c.textMuted, flex: 1, marginLeft: space.md }]}>
              Open a WhatsApp chat with the assistant on, and it’ll show up here for a catch-up summary.
            </Text>
          </View>
        )}
      </Card>

      {/* ── Settings ── */}
      <SectionTitle>Speech language</SectionTitle>
      <Card>
        <Text style={[font.small, { color: c.textMuted, marginBottom: space.md }]}>
          Used by 🎙 dictation and 🗣 voice notes. You can also hold 🎙 in the toolbar and glide to switch.
        </Text>
        <View style={styles.wrap}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={language === l.code} onPress={() => pickLanguage(l.code)} />
          ))}
        </View>
      </Card>

      <SectionTitle>Voice for voice notes</SectionTitle>
      <Card style={{ paddingVertical: space.sm }}>
        {voices.map((v, i) => {
          const selected = voice === v.id;
          return (
            <Pressable
              key={v.id}
              onPress={() => pickVoice(v.id)}
              style={[styles.voiceRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
            >
              <IconBadge
                icon={v.gender === 'male' ? 'face-man-outline' : 'face-woman-outline'}
                color={selected ? c.onPrimary : c.primary}
                bg={selected ? c.primary : c.primarySoft}
                size={36}
              />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={[font.body, { color: c.text, fontWeight: selected ? '700' : '500' }]}>{v.id}</Text>
                <Text style={[font.small, { color: c.textMuted }]}>
                  {v.gender === 'male' ? 'Male' : 'Female'} · {v.style}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={selected ? c.primary : c.textFaint}
              />
            </Pressable>
          );
        })}
      </Card>

      {/* ── How to use ── */}
      <SectionTitle>How it works</SectionTitle>
      <Card>
        {HOW_TO.map((h) => (
          <View key={h.title} style={[styles.row, { marginBottom: space.md }]}>
            <IconBadge icon={h.icon} color={c.primary} bg={c.primarySoft} size={36} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>{h.title}</Text>
              <Text style={[font.small, { color: c.textMuted }]}>{h.body}</Text>
            </View>
          </View>
        ))}
        <PrimaryButton title="Open the tutorial" icon="school-outline" variant="soft" onPress={() => router.push('/onboarding')} />
      </Card>

      <Text style={[font.small, { color: c.textFaint, textAlign: 'center', marginTop: space.sm }]}>
        Speech by Gnani Prisma & Timbre · AI by {llm.provider === 'gemini' ? 'Gemini' : 'Evon'} ({llm.model})
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  summary: { marginTop: space.md, padding: space.md, borderRadius: radius.md },
});
