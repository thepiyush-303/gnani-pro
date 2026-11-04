/**
 * Tutorial — shown on first launch and from Home ("How to use" / help icon).
 * 1 Welcome · 2 Display over apps · 3 Accessibility · 4 Microphone · 5 Using the bubble
 */

import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCopilot } from '../src/hooks/CopilotBridge';
import { usePermissions, type PermissionStatus } from '../src/hooks/usePermissions';
import { setOnboarded } from '../src/services/onboardingStore';
import { font, radius, space, useTheme } from '../src/ui/theme';
import { AppMark, IconBadge, type IconName, PrimaryButton, StepDots } from '../src/ui/components';

type Step =
  | { kind: 'welcome' }
  | { kind: 'permission'; perm: 'overlay' | 'accessibility' | 'microphone' }
  | { kind: 'usage' };

const STEPS: Step[] = [
  { kind: 'welcome' },
  { kind: 'permission', perm: 'overlay' },
  { kind: 'permission', perm: 'accessibility' },
  { kind: 'permission', perm: 'microphone' },
  { kind: 'usage' },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'creation', title: 'Improve your draft', body: 'Rewrites what you typed to fit the chat, formal or full banter.' },
  { icon: 'forum-outline', title: 'Smart replies', body: 'Three replies in the chat’s own language and tone, remembering what’s due today.' },
  { icon: 'microphone-outline', title: 'Dictate', body: 'Speak in 10 Indian languages, and the text lands in the message box.' },
  { icon: 'account-voice', title: 'Voice notes in another voice', body: 'Your words, spoken by one of 6 natural voices, sent to the chat.' },
];

const PERMISSION_COPY: Record<
  'overlay' | 'accessibility' | 'microphone',
  { icon: IconName; title: string; why: string; steps: string[]; button: string }
> = {
  overlay: {
    icon: 'layers-outline',
    title: 'Display over other apps',
    why: 'Lets the assistant bubble and toolbar float on top of WhatsApp.',
    steps: ['Tap “Open settings”.', 'Find IndicContext Assistant in the list.', 'Turn on “Allow display over other apps”, then come back.'],
    button: 'Open settings',
  },
  accessibility: {
    icon: 'gesture-tap',
    title: 'Accessibility',
    why: 'Lets the assistant read the open chat (so suggestions fit the conversation) and put text into the message box. It only works inside WhatsApp and never stores chats.',
    steps: [
      'Tap “Open settings”, then Installed apps / Downloaded apps.',
      'Choose IndicContext Assistant and turn it on.',
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
};

const USAGE: { icon: IconName; text: string }[] = [
  { icon: 'whatsapp', text: 'Open any WhatsApp chat. The bubble appears just above the message box (only inside chats).' },
  { icon: 'gesture-tap-button', text: 'Tap the bubble to open the toolbar. Touching anything else closes it again.' },
  { icon: 'creation', text: 'Type a draft and tap ✨ to improve it, or tap 💬 for smart replies. Tap a suggestion to insert it.' },
  { icon: 'microphone-outline', text: '🎙 Tap to dictate. Hold and glide your finger to change the language.' },
  { icon: 'account-voice', text: '🗣 Tap to record, tap again to stop. Hold and glide to pick a voice, then Send.' },
  { icon: 'gesture-swipe-down', text: 'Drag the bubble to the bottom of the screen to turn the assistant off.' },
];

export default function OnboardingScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setCopilotEnabled } = useCopilot();
  const { perms, allGranted, openOverlaySettings, openAccessibilitySettings, openAppInfo, requestMicrophone } =
    usePermissions();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const finish = useCallback(async () => {
    await setOnboarded(true);
    if (allGranted) await setCopilotEnabled(true).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [allGranted, router, setCopilotEnabled]);

  const grant = (perm: 'overlay' | 'accessibility' | 'microphone') =>
    perm === 'overlay' ? openOverlaySettings() : perm === 'accessibility' ? openAccessibilitySettings() : requestMicrophone();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <StepDots count={STEPS.length} index={index} />
        {!isLast && (
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={[font.body, { color: c.textMuted, fontWeight: '600' }]}>Skip</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step.kind === 'welcome' && (
          <>
            <View style={{ alignItems: 'center', marginBottom: space.xl }}>
              <AppMark size={84} />
              <Text style={[font.title, { color: c.text, marginTop: space.lg, textAlign: 'center' }]}>
                Write better in every chat
              </Text>
              <Text style={[font.body, { color: c.textMuted, marginTop: space.sm, textAlign: 'center' }]}>
                IndicContext lives inside WhatsApp and understands the conversation you’re in.
              </Text>
            </View>
            {FEATURES.map((f) => (
              <View key={f.title} style={[styles.feature, { backgroundColor: c.surface, borderColor: c.border }]}>
                <IconBadge icon={f.icon} color={c.primary} bg={c.primarySoft} />
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>{f.title}</Text>
                  <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]}>{f.body}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {step.kind === 'permission' && (
          <PermissionStep
            copy={PERMISSION_COPY[step.perm]}
            status={perms[step.perm]}
            stepNo={index}
            onGrant={() => grant(step.perm)}
            onAppInfo={step.perm === 'accessibility' ? openAppInfo : undefined}
          />
        )}

        {step.kind === 'usage' && (
          <>
            <IconBadge icon="gesture-tap-button" color={c.onPrimary} bg={c.primary} size={64} />
            <Text style={[font.title, { color: c.text, marginTop: space.lg }]}>Using the bubble</Text>
            <Text style={[font.body, { color: c.textMuted, marginTop: space.sm, marginBottom: space.lg }]}>
              Everything happens inside your chats. Nothing runs or uses AI until you tap a button.
            </Text>
            {USAGE.map((u, i) => (
              <View key={i} style={styles.usageRow}>
                <IconBadge icon={u.icon} color={c.primary} bg={c.primarySoft} size={34} />
                <Text style={[font.body, { color: c.text, flex: 1, marginLeft: space.md }]}>{u.text}</Text>
              </View>
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
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {index > 0 ? (
          <PrimaryButton title="Back" variant="ghost" onPress={() => setIndex(index - 1)} style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <PrimaryButton
          title={isLast ? (allGranted ? 'Turn on & finish' : 'Finish') : 'Next'}
          icon={isLast ? 'check' : 'arrow-right'}
          onPress={isLast ? finish : () => setIndex(index + 1)}
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
      <Text style={[font.label, { color: c.primary }]}>Permission {stepNo} of 3</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
        <IconBadge icon={copy.icon} color={c.onPrimary} bg={c.primary} size={56} />
        <Text style={[font.title, { color: c.text, marginLeft: space.md, flex: 1 }]}>{copy.title}</Text>
      </View>
      <Text style={[font.body, { color: c.textMuted, marginTop: space.lg }]}>{copy.why}</Text>

      <View style={[styles.stepsBox, { backgroundColor: c.surface, borderColor: c.border }]}>
        {copy.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: i < copy.steps.length - 1 ? space.md : 0 }}>
            <View style={[styles.stepNum, { backgroundColor: c.primarySoft }]}>
              <Text style={[font.small, { color: c.primary, fontWeight: '800' }]}>{i + 1}</Text>
            </View>
            <Text style={[font.body, { color: c.text, flex: 1, marginLeft: space.md }]}>{s}</Text>
          </View>
        ))}
      </View>

      {granted ? (
        <View style={[styles.notice, { backgroundColor: c.successSoft }]}>
          <MaterialCommunityIcons name="check-circle" size={20} color={c.success} />
          <Text style={[font.body, { color: c.success, marginLeft: space.sm, fontWeight: '700' }]}>Granted, all good</Text>
        </View>
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
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  usageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  stepsBox: { marginTop: space.lg, padding: space.lg, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, padding: space.md, borderRadius: radius.md },
  bottomBar: { flexDirection: 'row', paddingHorizontal: space.xl, paddingVertical: space.md },
});
