/**
 * Home: Bento layout (DESIGN.md).
 *   Hero (status + on/off) · setup checklist · language / voice tiles (+ pickers) ·
 *   current chat + catch-up summary · ⏰ reminders · how-it-works feature tiles · footer.
 * Toolbar actions themselves are handled app-wide by CopilotBridgeProvider.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
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
  Tile,
} from '../src/ui/components';
import { VoicePicker } from '../src/ui/VoicePicker';
import { RemindersSection } from '../src/ui/RemindersSection';

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
  {
    icon: 'creation',
    title: 'Improve',
    body: 'Type a draft, then tap ✨ to rewrite it in the chat’s own tone.',
  },
  {
    icon: 'translate',
    title: 'Translate',
    body: 'Tap 🌐 to turn your draft into English or Hindi; hold and glide to choose.',
  },
  {
    icon: 'forum-outline',
    title: 'Smart replies',
    body: 'Tap 💬 for three replies that fit the conversation.',
  },
  {
    icon: 'microphone-outline',
    title: 'Dictate',
    body: 'Tap 🎙 to speak; hold and glide to change language.',
  },
  {
    icon: 'account-voice',
    title: 'Voice notes',
    body: 'Tap 🗣 to record in another voice; hold and glide to pick it.',
  },
  {
    icon: 'alarm',
    title: 'Reminders',
    body: 'Asked to reply “by 6 PM”? You’re reminded before it’s due.',
  },
];

const llm = getLlmInfo();

export default function HomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeChat, bufferCount, copilotEnabled, setCopilotEnabled } =
    useCopilot();
  const {
    perms,
    allGranted,
    grantedCount,
    totalCount,
    setupComplete,
    openOverlaySettings,
    openAccessibilitySettings,
    openAppInfo,
    requestMicrophone,
    requestNotifications,
  } = usePermissions();

  const [language, setLanguage] = useState('en-IN');
  const [voices, setVoices] = useState<TimbreVoice[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [summary, setSummary] = useState<ThreadSummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  /** Which settings tile is expanded into its full picker. */
  const [openPicker, setOpenPicker] = useState<'language' | 'voice' | null>(
    null,
  );

  // First launch → tutorial
  useEffect(() => {
    isOnboarded().then((done) => {
      if (!done) router.replace('/onboarding');
    });
  }, [router]);

  useEffect(() => {
    IndicContext.getLanguage()
      .then(setLanguage)
      .catch(() => {});
    IndicContext.getVoices()
      .then(setVoices)
      .catch(() => {});
    IndicContext.getVoice()
      .then(setVoice)
      .catch(() => {});
  }, []);

  const toggleCopilot = useCallback(
    async (on: boolean) => {
      if (on && !allGranted) {
        Alert.alert(
          'Finish setup first',
          'Grant the permissions in “Finish setup” to turn ConvoAI on.',
        );
        return;
      }
      try {
        await setCopilotEnabled(on);
      } catch (e: any) {
        Alert.alert('Couldn’t switch ConvoAI', e?.message || String(e));
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
    ? 'Setup needed'
    : copilotEnabled
      ? 'Active in WhatsApp chats'
      : 'Paused';
  const languageLabel =
    LANGUAGES.find((l) => l.code === language)?.label ?? 'English';
  const voiceInfo = voices.find((v) => v.id === voice);
  const [lead, ...features] = HOW_TO;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: space.lg,
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xxl,
      }}
    >
      {/* ── Hero module: brand, value, status and the one primary action (on/off) ── */}
      <Card variant="hero">
        <View style={styles.row}>
          <AppMark size={48} />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={[font.title, { color: c.onPrimary }]}>ConvoAI</Text>
            <Text style={[font.small, { color: c.onPrimaryMuted }]}>
              Your assistant inside WhatsApp
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/onboarding')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="How to use ConvoAI"
            style={styles.heroHelp}
          >
            <MaterialCommunityIcons
              name="help-circle-outline"
              size={24}
              color={c.onPrimary}
            />
          </Pressable>
        </View>

        <Text
          style={[font.display, { color: c.onPrimary, marginTop: space.xl }]}
        >
          Write better in every chat.
        </Text>
        <Text
          style={[font.body, { color: c.onPrimaryMuted, marginTop: space.sm }]}
        >
          {copilotEnabled
            ? 'Open any WhatsApp chat: the bubble sits above the message box. Tap it for the toolbar; it closes when you touch anything else.'
            : allGranted
              ? 'Turn on to show the ConvoAI bubble inside your WhatsApp chats.'
              : 'Grant the permissions below, then turn ConvoAI on.'}
        </Text>

        <View style={[styles.heroFooter, { borderTopColor: '#FFFFFF33' }]}>
          <StatusPill label={status} tone="onHero" />
          <View style={styles.row}>
            <Text
              style={[
                font.smallStrong,
                { color: c.onPrimary, marginRight: space.sm },
              ]}
            >
              {copilotEnabled ? 'On' : 'Off'}
            </Text>
            <Switch
              value={copilotEnabled}
              onValueChange={toggleCopilot}
              accessibilityLabel="Turn ConvoAI on or off"
              trackColor={{ false: c.primaryStrong, true: c.onPrimaryMuted }}
              thumbColor={copilotEnabled ? c.primaryStrong : c.onPrimary}
            />
          </View>
        </View>
      </Card>

      {/* ── Setup checklist ── */}
      {!setupComplete && (
        <>
          <SectionTitle
            right={
              <StatusPill
                label={`${grantedCount}/${totalCount} done`}
                tone="warning"
              />
            }
          >
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
                  <Text
                    style={[font.smallStrong, { color: c.primaryStrong }]}
                    onPress={openAppInfo}
                  >
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
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <PermissionRow
              icon="bell-outline"
              title="Notifications"
              description="For ⏰ reminders before something you owe is due. Optional."
              status={perms.notifications}
              onGrant={requestNotifications}
            />
          </Card>
        </>
      )}

      {/* ── Settings: two compact tiles that open their full pickers ── */}
      <SectionTitle>Your settings</SectionTitle>
      <View style={styles.tileRow}>
        <Tile
          onPress={() =>
            setOpenPicker(openPicker === 'language' ? null : 'language')
          }
          selected={openPicker === 'language'}
          accessibilityLabel={`Speech language: ${languageLabel}. Tap to change.`}
        >
          <IconBadge
            icon="microphone-outline"
            color={c.primaryStrong}
            bg={c.primarySoft}
            size={32}
          />
          <Text
            style={[font.label, { color: c.textFaint, marginTop: space.md }]}
          >
            Speech language
          </Text>
          <Text
            style={[font.heading, { color: c.text, marginTop: space.xs }]}
            numberOfLines={1}
          >
            {languageLabel}
          </Text>
        </Tile>
        <View style={{ width: space.md }} />
        <Tile
          onPress={() => setOpenPicker(openPicker === 'voice' ? null : 'voice')}
          selected={openPicker === 'voice'}
          accessibilityLabel={`Voice for voice notes: ${voice ?? 'not set'}. Tap to change.`}
        >
          <IconBadge
            icon="account-voice"
            color={c.primaryStrong}
            bg={c.primarySoft}
            size={32}
          />
          <Text
            style={[font.label, { color: c.textFaint, marginTop: space.md }]}
          >
            Voice notes
          </Text>
          <Text
            style={[font.heading, { color: c.text, marginTop: space.xs }]}
            numberOfLines={1}
          >
            {voice ?? '…'}
            {voiceInfo ? (
              <Text style={[font.small, { color: c.textMuted }]}>
                {' '}
                {voiceInfo.gender === 'male' ? '♂' : '♀'}
              </Text>
            ) : null}
          </Text>
        </Tile>
      </View>

      {openPicker === 'language' && (
        <Card style={{ marginTop: space.md }}>
          <Text
            style={[font.small, { color: c.textMuted, marginBottom: space.md }]}
          >
            Used by 🎙 dictation and 🗣 voice notes. You can also hold 🎙 in the
            toolbar and glide to switch.
          </Text>
          <View style={styles.wrap} accessibilityRole="radiogroup">
            {LANGUAGES.map((l) => (
              <Chip
                key={l.code}
                label={l.label}
                selected={language === l.code}
                onPress={() => pickLanguage(l.code)}
              />
            ))}
          </View>
        </Card>
      )}

      {openPicker === 'voice' && (
        <Card style={{ marginTop: space.md }}>
          <Text
            style={[font.small, { color: c.textMuted, marginBottom: space.md }]}
          >
            The voice 🗣 voice notes are spoken in. Tap ▶ to hear a sample.
          </Text>
          <VoicePicker voices={voices} selected={voice} onSelect={pickVoice} />
        </Card>
      )}

      {/* ── Current chat + catch-up ── */}
      <SectionTitle>Current chat</SectionTitle>
      <Card variant="feature">
        {activeChat ? (
          <>
            <View style={styles.row}>
              <IconBadge icon="whatsapp" color={c.success} bg={c.successSoft} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text
                  style={[font.heading, { color: c.text }]}
                  numberOfLines={1}
                >
                  {activeChat}
                </Text>
                <Text style={[font.small, { color: c.textMuted }]}>
                  {bufferCount} recent messages read
                </Text>
              </View>
            </View>
            <PrimaryButton
              title="Catch-up summary"
              icon="text-box-search-outline"
              variant="soft"
              onPress={runSummary}
              loading={summarizing}
              disabled={bufferCount === 0}
              style={{ marginTop: space.lg }}
            />
            {summary && (
              <View style={[styles.summary, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[font.body, { color: c.text }]}>
                  {summary.brief}
                </Text>
                {summary.directAsks.length > 0 && (
                  <>
                    <Text
                      style={[
                        font.label,
                        { color: c.textFaint, marginTop: space.md },
                      ]}
                    >
                      They asked you
                    </Text>
                    {summary.directAsks.map((a, i) => (
                      <Text
                        key={i}
                        style={[
                          font.small,
                          { color: c.textMuted, marginTop: space.xs },
                        ]}
                      >
                        • {a}
                      </Text>
                    ))}
                  </>
                )}
                {summary.actionItems.length > 0 && (
                  <>
                    <Text
                      style={[
                        font.label,
                        { color: c.textFaint, marginTop: space.md },
                      ]}
                    >
                      Pending
                    </Text>
                    {summary.actionItems.map((a, i) => (
                      <Text
                        key={i}
                        style={[
                          font.small,
                          { color: c.textMuted, marginTop: space.xs },
                        ]}
                      >
                        • {a}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.row}>
            <IconBadge
              icon="chat-outline"
              color={c.textMuted}
              bg={c.surfaceAlt}
            />
            <Text
              style={[
                font.small,
                { color: c.textMuted, flex: 1, marginLeft: space.md },
              ]}
            >
              Open a WhatsApp chat with ConvoAI on, and it’ll show up here for a
              catch-up summary.
            </Text>
          </View>
        )}
      </Card>

      {/* ── ⏰ Reminders ── */}
      <RemindersSection
        notificationsOk={perms.notifications !== 'denied'}
        onGrantNotifications={requestNotifications}
      />

      {/* ── How it works: one lead feature + 2-column feature tiles ── */}
      <SectionTitle>How it works</SectionTitle>
      <Card variant="soft">
        <View style={styles.row}>
          <IconBadge
            icon={lead.icon}
            color={c.onPrimary}
            bg={c.primary}
            size={44}
          />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={[font.heading, { color: c.primaryStrong }]}>
              {lead.title}
            </Text>
            <Text
              style={[font.small, { color: c.primaryStrong, marginTop: 2 }]}
            >
              {lead.body}
            </Text>
          </View>
        </View>
      </Card>
      {Array.from(
        { length: Math.ceil(features.length / 2) },
        (_, i) => i * 2,
      ).map((start) => (
        <View key={start} style={[styles.tileRow, { marginBottom: space.md }]}>
          {features.slice(start, start + 2).map((f, i) => (
            <React.Fragment key={f.title}>
              {i > 0 && <View style={{ width: space.md }} />}
              <Tile>
                <IconBadge
                  icon={f.icon}
                  color={c.primaryStrong}
                  bg={c.primarySoft}
                  size={32}
                />
                <Text
                  style={[
                    font.bodyStrong,
                    { color: c.text, marginTop: space.md },
                  ]}
                >
                  {f.title}
                </Text>
                <Text
                  style={[
                    font.small,
                    { color: c.textMuted, marginTop: space.xs },
                  ]}
                >
                  {f.body}
                </Text>
              </Tile>
            </React.Fragment>
          ))}
        </View>
      ))}
      <PrimaryButton
        title="Open the tutorial"
        icon="school-outline"
        variant="ghost"
        onPress={() => router.push('/onboarding')}
      />

      <Text
        style={[
          font.small,
          { color: c.textFaint, textAlign: 'center', marginTop: space.xl },
        ]}
      >
        Speech by Gnani Prisma & Timbre · AI by{' '}
        {llm.provider === 'gemini' ? 'Gemini' : 'Evon'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  heroHelp: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  divider: { height: StyleSheet.hairlineWidth },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tileRow: { flexDirection: 'row', alignItems: 'stretch' },
  summary: { marginTop: space.lg, padding: space.lg, borderRadius: radius.md },
});
