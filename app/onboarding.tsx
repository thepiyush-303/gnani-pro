/**
 * Tutorial: interactive and animated. Shown on first launch and from Home.
 *   1 Welcome · 2 Try it (interactive toolbar demo) · 3 Choose your voice ·
 *   4–7 Permissions (live status, animated; notifications optional) · 8 All set
 * Animations respect the system "Remove animations" setting (src/ui/motion.tsx).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IndicContext, { type TimbreVoice } from 'indic-context';

import { useCopilot } from '../src/hooks/CopilotBridge';
import { usePermissions, type PermissionStatus } from '../src/hooks/usePermissions';
import { setOnboarded } from '../src/services/onboardingStore';
import { font, radius, space, useTheme } from '../src/ui/theme';
import { AppMark, Card, IconBadge, type IconName, PrimaryButton, StepDots, Tile } from '../src/ui/components';
import { FadeIn, Pop, Pulse } from '../src/ui/motion';
import { VoicePicker } from '../src/ui/VoicePicker';
import { DEMO_STEPS, ToolbarDemo } from '../src/ui/tutorial/ToolbarDemo';

type Perm = 'overlay' | 'accessibility' | 'microphone' | 'notifications';
const PERM_ORDER: Perm[] = ['overlay', 'accessibility', 'microphone', 'notifications'];
type Step = { kind: 'welcome' } | { kind: 'try' } | { kind: 'voice' } | { kind: 'permission'; perm: Perm } | { kind: 'done' };

const STEPS: Step[] = [
  { kind: 'welcome' },
  { kind: 'try' },
  { kind: 'voice' },
  { kind: 'permission', perm: 'overlay' },
  { kind: 'permission', perm: 'accessibility' },
  { kind: 'permission', perm: 'microphone' },
  { kind: 'permission', perm: 'notifications' },
  { kind: 'done' },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'creation', title: 'Improve your draft', body: 'Rewrites what you typed to fit the chat, formal or full banter.' },
  { icon: 'forum-outline', title: 'Smart replies', body: 'Three replies in the chat’s own language and tone, remembering what’s due today.' },
  { icon: 'microphone-outline', title: 'Dictate', body: 'Speak in 10 Indian languages, and the text lands in the message box.' },
  { icon: 'account-voice', title: 'Voice notes in another voice', body: 'Your words, spoken by one of 6 natural voices, sent to the chat.' },
  { icon: 'alarm', title: 'Deadline reminders', body: 'Boss says “update me by 6 PM”? You get a reminder at 5:30.' },
];

const PERMISSION_COPY: Record<Perm, { icon: IconName; title: string; why: string; steps: string[]; button: string }> = {
  overlay: {
    icon: 'layers-outline',
    title: 'Display over other apps',
    why: 'Lets the assistant bubble and toolbar float on top of WhatsApp.',
    steps: ['Tap “Open settings”.', 'Find ConvoAI in the list.', 'Turn on “Allow display over other apps”, then come back.'],
    button: 'Open settings',
  },
  accessibility: {
    icon: 'gesture-tap',
    title: 'Accessibility',
    why: 'Lets the assistant read the open chat (so suggestions fit the conversation) and put text into the message box. It only works inside WhatsApp and never stores chats; only the ⏰ reminders it sets are saved on your phone.',
    steps: [
      'Tap “Open settings”, then Installed apps / Downloaded apps.',
      'Choose ConvoAI and turn it on.',
      'Switch greyed out with “Restricted setting”? Tap “App info” below → ⋮ (top right) → Allow restricted settings, then try again.',
    ],
    button: 'Open settings',
  },
  microphone: {
    icon: 'microphone-outline',
    title: 'Microphone',
    why: 'Needed for 🎙 dictation and 🗣 voice notes. Audio is only recorded while you hold a recording.',
    steps: ['Tap “Allow microphone”.', 'Choose “While using the app” / “Allow”.'],
    button: 'Allow microphone',
  },
  notifications: {
    icon: 'bell-outline',
    title: 'Notifications',
    why: 'Optional. When a chat says you need to do something by a time or day (“update me by 6 PM”, “I’ll send it by Monday”), ConvoAI reminds you before it’s due.',
    steps: ['Tap “Allow notifications”.', 'Choose “Allow”.', 'Change how early you’re reminded, or turn detection off, under Reminders on Home.'],
    button: 'Allow notifications',
  },
};

const RECAP: { icon: IconName; text: string }[] = [
  { icon: 'whatsapp', text: 'Open any WhatsApp chat. The bubble appears above the message box (only inside chats).' },
  { icon: 'gesture-tap-button', text: 'Tap the bubble for the toolbar. Touching anything else closes it.' },
  { icon: 'creation', text: '✨ Improve · 🌐 Translate · 💬 Smart replies: tap a suggestion to insert it.' },
  { icon: 'microphone-outline', text: '🎙 Tap to dictate. Hold and glide to change the language.' },
  { icon: 'account-voice', text: '🗣 Tap to record a voice note. Hold and glide to switch voices.' },
  { icon: 'alarm', text: '⏰ Deadlines you owe are spotted in open chats and you’re reminded before they’re due. Undo from the card.' },
  { icon: 'gesture-swipe-down', text: 'Drag the bubble to the bottom of the screen to turn ConvoAI off.' },
];

export default function OnboardingScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setCopilotEnabled } = useCopilot();
  const {
    perms,
    allGranted,
    openOverlaySettings,
    openAccessibilitySettings,
    openAppInfo,
    requestMicrophone,
    requestNotifications,
  } = usePermissions();
  const [index, setIndex] = useState(0);
  const [demoTried, setDemoTried] = useState(0);
  const [voices, setVoices] = useState<TimbreVoice[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    IndicContext.getVoices().then(setVoices).catch(() => {});
    IndicContext.getVoice().then(setVoice).catch(() => {});
  }, []);

  const pickVoice = useCallback(async (id: string) => {
    setVoice(id);
    await IndicContext.setVoice(id).catch(() => {});
  }, []);

  const finish = useCallback(async () => {
    await IndicContext.stopVoicePreview().catch(() => {});
    await setOnboarded(true);
    if (allGranted) await setCopilotEnabled(true).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [allGranted, router, setCopilotEnabled]);

  const go = (to: number) => {
    IndicContext.stopVoicePreview().catch(() => {});
    setIndex(to);
  };

  const grant = (perm: Perm) =>
    perm === 'overlay'
      ? openOverlaySettings()
      : perm === 'accessibility'
        ? openAccessibilitySettings()
        : perm === 'microphone'
          ? requestMicrophone()
          : requestNotifications();

  const nextLabel = isLast
    ? allGranted
      ? 'Turn on & finish'
      : 'Finish'
    : step.kind === 'try' && demoTried < DEMO_STEPS
      ? 'Skip demo'
      : step.kind === 'voice' && voice
        ? `Use ${voice}`
        : 'Next';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <StepDots count={STEPS.length} index={index} />
        {!isLast && (
          <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
            <Text style={[font.bodyStrong, { color: c.textMuted }]}>Skip</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* key = index → each step animates in when it appears */}
        <FadeIn key={index} from={16}>
          {step.kind === 'welcome' && (
            <>
              <Card variant="hero">
                <Pop>
                  <AppMark size={72} />
                </Pop>
                <Text style={[font.label, { color: c.onPrimaryMuted, marginTop: space.lg }]}>Welcome to ConvoAI</Text>
                <Text style={[font.display, { color: c.onPrimary, marginTop: space.xs }]}>Write better in every chat</Text>
                <Text style={[font.body, { color: c.onPrimaryMuted, marginTop: space.sm }]}>
                  ConvoAI lives inside WhatsApp and understands the conversation you’re in.
                </Text>
              </Card>
              <FadeIn delay={120}>
                <Card variant="soft">
                  <View style={styles.row}>
                    <IconBadge icon={FEATURES[0].icon} color={c.onPrimary} bg={c.primary} size={44} />
                    <View style={{ flex: 1, marginLeft: space.md }}>
                      <Text style={[font.heading, { color: c.primaryStrong }]}>{FEATURES[0].title}</Text>
                      <Text style={[font.small, { color: c.primaryStrong, marginTop: 2 }]}>{FEATURES[0].body}</Text>
                    </View>
                  </View>
                </Card>
              </FadeIn>
              <View style={styles.row}>
                {FEATURES.slice(1, 3).map((f, i) => (
                  <React.Fragment key={f.title}>
                    {i > 0 && <View style={{ width: space.md }} />}
                    <FadeIn delay={220 + i * 100} style={{ flex: 1 }}>
                      <Tile>
                        <IconBadge icon={f.icon} color={c.primaryStrong} bg={c.primarySoft} size={32} />
                        <Text style={[font.bodyStrong, { color: c.text, marginTop: space.md }]}>{f.title}</Text>
                        <Text style={[font.small, { color: c.textMuted, marginTop: space.xs }]}>{f.body}</Text>
                      </Tile>
                    </FadeIn>
                  </React.Fragment>
                ))}
              </View>
              {FEATURES.slice(3).map((f) => (
                <FadeIn key={f.title} delay={420}>
                  <Card style={{ marginTop: space.md }}>
                    <View style={styles.row}>
                      <IconBadge icon={f.icon} color={c.primaryStrong} bg={c.primarySoft} />
                      <View style={{ flex: 1, marginLeft: space.md }}>
                        <Text style={[font.bodyStrong, { color: c.text }]}>{f.title}</Text>
                        <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]}>{f.body}</Text>
                      </View>
                    </View>
                  </Card>
                </FadeIn>
              ))}
            </>
          )}

          {step.kind === 'try' && (
            <>
              <Text style={[font.label, { color: c.primaryStrong }]}>Try it</Text>
              <Text style={[font.title, { color: c.text, marginTop: space.xs }]}>Here’s how it works in a chat</Text>
              <Text style={[font.body, { color: c.textMuted, marginTop: space.sm, marginBottom: space.lg }]}>
                Follow the glowing light: it shows the next button to press. This is a safe practice chat, so nothing is sent and no AI is used.
              </Text>
              <ToolbarDemo onProgress={setDemoTried} />
            </>
          )}

          {step.kind === 'voice' && (
            <>
              <Text style={[font.label, { color: c.primaryStrong }]}>Voice notes</Text>
              <Text style={[font.title, { color: c.text, marginTop: space.xs }]}>Choose your voice</Text>
              <Text style={[font.body, { color: c.textMuted, marginTop: space.sm, marginBottom: space.lg }]}>
                When you record a 🗣 voice note, ConvoAI speaks your words in this voice. Tap ▶ to hear a sample. You
                can change it any time from Home or by holding 🗣 in the toolbar.
              </Text>
              <VoicePicker voices={voices} selected={voice} onSelect={pickVoice} />
            </>
          )}

          {step.kind === 'permission' && (
            <PermissionStep
              copy={PERMISSION_COPY[step.perm]}
              status={perms[step.perm]}
              stepNo={PERM_ORDER.indexOf(step.perm) + 1}
              onGrant={() => grant(step.perm)}
              onAppInfo={step.perm === 'accessibility' ? openAppInfo : undefined}
            />
          )}

          {step.kind === 'done' && (
            <>
              <View style={{ alignItems: 'center', marginBottom: space.xl }}>
                <Pop>
                  <AppMark size={88} />
                </Pop>
                <FadeIn delay={150}>
                  <Text style={[font.title, { color: c.text, marginTop: space.lg, textAlign: 'center' }]}>
                    You’re all set
                  </Text>
                  <Text style={[font.body, { color: c.textMuted, marginTop: space.sm, textAlign: 'center' }]}>
                    AI runs when you tap a button. The only automatic check is for deadlines, and only on messages that mention a time or day.
                  </Text>
                </FadeIn>
              </View>
              {RECAP.map((r, i) => (
                <FadeIn key={i} delay={250 + i * 70}>
                  <View style={styles.recapRow}>
                    <IconBadge icon={r.icon} color={c.primaryStrong} bg={c.primarySoft} size={34} />
                    <Text style={[font.body, { color: c.text, flex: 1, marginLeft: space.md }]}>{r.text}</Text>
                  </View>
                </FadeIn>
              ))}
              {!allGranted && (
                <View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color={c.warning} />
                  <Text style={[font.small, { color: c.warning, marginLeft: space.sm, flex: 1 }]}>
                    Some permissions are still missing. You can grant them later from Home.
                  </Text>
                </View>
              )}
            </>
          )}
        </FadeIn>
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { borderTopColor: c.border }]}>
        {index > 0 ? (
          <PrimaryButton title="Back" variant="ghost" onPress={() => go(index - 1)} style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <PrimaryButton
          title={nextLabel}
          icon={isLast ? 'check' : 'arrow-right'}
          onPress={isLast ? finish : () => go(index + 1)}
          style={{ flex: 2, marginLeft: space.md }}
        />
      </View>
    </View>
  );
}

function PermissionStep({
  copy,
  status,
  stepNo,
  onGrant,
  onAppInfo,
}: {
  copy: (typeof PERMISSION_COPY)['overlay'];
  status: PermissionStatus;
  stepNo: number;
  onGrant: () => void;
  onAppInfo?: () => void;
}) {
  const { c } = useTheme();
  const granted = status === 'granted';
  return (
    <>
      <Text style={[font.label, { color: c.primaryStrong }]}>Permission {stepNo} of {PERM_ORDER.length}</Text>
      <View style={[styles.row, { marginTop: space.md }]}>
        {/* Pulses while waiting; pops into a check once granted */}
        {granted ? (
          <Pop key="granted">
            <IconBadge icon="check-bold" color={c.onPrimary} bg={c.success} size={56} />
          </Pop>
        ) : (
          <Pulse>
            <IconBadge icon={copy.icon} color={c.onPrimary} bg={c.primary} size={56} />
          </Pulse>
        )}
        <Text style={[font.title, { color: c.text, marginLeft: space.md, flex: 1 }]}>{copy.title}</Text>
      </View>
      <Text style={[font.body, { color: c.textMuted, marginTop: space.lg }]}>{copy.why}</Text>

      <View style={[styles.stepsBox, { backgroundColor: c.surface, borderColor: c.border }]}>
        {copy.steps.map((s, i) => (
          <FadeIn key={i} delay={100 + i * 90}>
            <View style={{ flexDirection: 'row', marginBottom: i < copy.steps.length - 1 ? space.md : 0 }}>
              <View style={[styles.stepNum, { backgroundColor: granted ? c.successSoft : c.primarySoft }]}>
                {granted ? (
                  <MaterialCommunityIcons name="check" size={14} color={c.success} />
                ) : (
                  <Text style={[font.smallStrong, { color: c.primaryStrong }]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[font.body, { color: c.text, flex: 1, marginLeft: space.md }]}>{s}</Text>
            </View>
          </FadeIn>
        ))}
      </View>

      {granted ? (
        <Pop>
          <View style={[styles.notice, { backgroundColor: c.successSoft }]}>
            <MaterialCommunityIcons name="check-circle" size={20} color={c.success} />
            <Text style={[font.bodyStrong, { color: c.success, marginLeft: space.sm }]}>Granted, all good. Tap Next.</Text>
          </View>
        </Pop>
      ) : (
        <>
          <PrimaryButton title={copy.button} icon="open-in-new" onPress={onGrant} style={{ marginTop: space.lg }} />
          {onAppInfo && (
            <PrimaryButton title="App info (restricted setting)" variant="ghost" onPress={onAppInfo} style={{ marginTop: space.sm }} />
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center' },
  recapRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  stepsBox: { marginTop: space.lg, padding: space.lg, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  stepNum: { width: 24, height: 24, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, padding: space.md, borderRadius: radius.md },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
