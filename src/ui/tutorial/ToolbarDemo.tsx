/**
 * Interactive tutorial demo: a mock chat with the ConvoAI bubble.
 * Tap the bubble → toolbar slides out → try each button and see what it does.
 * Plus a simulated incoming "by 6 baje" message that shows the automatic ⏰ reminder card.
 * Everything is simulated locally (no LLM / network calls).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppMark, type IconName } from '../components';
import { FadeIn, Pulse, useReducedMotion } from '../motion';
import { font, motion, radius, space, useTheme } from '../theme';

type ActionKey = 'improve' | 'translate' | 'voice' | 'replies' | 'dictate';
type TryKey = ActionKey | 'reminder';

const ACTIONS: { key: ActionKey; icon: IconName; label: string; explain: string }[] = [
  { key: 'improve', icon: 'creation', label: 'Improve', explain: '✨ Rewrites your draft in the chat’s own tone. Tap a suggestion to use it.' },
  { key: 'translate', icon: 'translate', label: 'Translate', explain: '🌐 Swaps your draft into Hindi or English. Hold the button to pick the language.' },
  { key: 'voice', icon: 'account-voice', label: 'Voice note', explain: '🗣 Records you, then re-speaks your words in your chosen voice.' },
  { key: 'replies', icon: 'forum-outline', label: 'Smart replies', explain: '💬 Three replies that fit the conversation. Tap one to insert it.' },
  { key: 'dictate', icon: 'microphone-outline', label: 'Dictate', explain: '🎙 Speak and your words are typed into the message box.' },
];

const REMINDER_EXPLAIN =
  '⏰ No button needed: when a chat says you owe something by a time or day, ConvoAI sets a reminder (30 min before by default). Undo from the card.';
const INCOMING = 'Shaam 6 baje tak address bhej dena 🙏';

/** Everything the demo can teach: the 5 toolbar buttons + the automatic reminder. */
export const DEMO_STEPS = ACTIONS.length + 1;

const START_DRAFT = 'i can come tomorrow evening';

// Overlay colours: the real overlay is always dark-rose glass, so the mock is too.
const OV = { bar: '#1C0A12', border: '#FDA4AF4D', icon: '#FECDD3', text: '#FFF1F2', muted: '#F5C2CB', accent: '#FDA4AF', rose: '#C8143F' };

interface DemoCard {
  title: string;
  subtitle?: string;
  chips: string[];
  /** What tapping a chip does: insert it into the draft, or just show a notice. */
  onChip: 'insert' | 'notice';
}

export function ToolbarDemo({ onProgress }: { onProgress?: (tried: number) => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(START_DRAFT);
  const [card, setCard] = useState<DemoCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [tried, setTried] = useState<TryKey[]>([]);
  const [last, setLast] = useState<TryKey | null>(null);
  const [incoming, setIncoming] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toolbarAnim = useRef(new Animated.Value(0)).current;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);
  useEffect(() => onProgress?.(tried.length), [tried, onProgress]);

  useEffect(() => {
    Animated.timing(toolbarAnim, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : motion.normal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, reduced, toolbarAnim]);

  const flash = (msg: string) => {
    setNotice(msg);
    later(() => setNotice(null), 1800);
  };

  const typeInto = (text: string) => {
    if (reduced) {
      setDraft(text);
      return;
    }
    setDraft('');
    text.split('').forEach((_, i) => later(() => setDraft(text.slice(0, i + 1)), 55 * (i + 1)));
  };

  const run = useCallback(
    (key: ActionKey) => {
      clearTimers();
      setCard(null);
      setNotice(null);
      setRecording(null);
      setLast(key);
      setTried((t) => (t.includes(key) ? t : [...t, key]));
      switch (key) {
        case 'improve':
          setCard({ title: '✨ Improved for Ravi', chips: ['Kal shaam aa jaunga, pakka!', 'Haan, kal shaam free hu, aata hu'], onChip: 'insert' });
          break;
        case 'translate':
          setDraft('मैं कल शाम आ सकता हूँ');
          flash('🌐 Translated to Hindi');
          break;
        case 'replies':
          setCard({ title: '💬 Smart replies for Ravi', chips: ['Haan pakka! Kitne baje?', 'Ravi, Ankit ko bhi bol diya?', 'Kal shaam fix 👍'], onChip: 'insert' });
          break;
        case 'voice': {
          setRecording(0);
          [1, 2, 3].forEach((s) => later(() => setRecording(s), s * 700));
          later(() => {
            setRecording(null);
            setCard({
              title: '✅ Ready in Lakshmi’s voice',
              subtitle: '“kal shaam milte hain”',
              chips: ['📤 Send to Ravi', '▶ Play', '🔄 Other voice'],
              onChip: 'notice',
            });
          }, 2600);
          break;
        }
        case 'dictate':
          flash('🎙 Listening…');
          later(() => typeInto('kal shaam milte hain'), 1100);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced],
  );

  const simulateIncoming = () => {
    clearTimers();
    setCard(null);
    setNotice(null);
    setRecording(null);
    setIncoming(true);
    setLast('reminder');
    setTried((t) => (t.includes('reminder') ? t : [...t, 'reminder']));
    later(
      () =>
        setCard({
          title: '⏰ Reminder set',
          subtitle: 'Send Ravi the address\nReminds 5:30 PM today · due 6:00 PM',
          chips: ['↩ Undo', '⏰ Remind 1 hr before'],
          onChip: 'notice',
        }),
      reduced ? 0 : 900,
    );
  };

  const tapOutside = () => {
    if (!open || recording !== null) return;
    clearTimers();
    setOpen(false);
    setCard(null);
    flash('Touching anywhere else closes the toolbar');
  };

  const reset = () => {
    clearTimers();
    setOpen(false);
    setCard(null);
    setNotice(null);
    setRecording(null);
    setDraft(START_DRAFT);
    setTried([]);
    setLast(null);
    setIncoming(false);
  };

  const hint = !open
    ? 'Tap the bubble to open the toolbar'
    : last
      ? last === 'reminder'
        ? REMINDER_EXPLAIN
        : ACTIONS.find((a) => a.key === last)!.explain
      : 'Now tap any button to try it';

  return (
    <View>
      {/* Instruction */}
      <View style={[styles.hint, { backgroundColor: c.primarySoft }]}>
        <MaterialCommunityIcons name={open ? 'gesture-tap' : 'gesture-tap-button'} size={18} color={c.primaryStrong} />
        <Text style={[font.small, { color: c.primaryStrong, flex: 1, marginLeft: space.sm }]}>{hint}</Text>
      </View>

      {/* Phone mock */}
      <View style={[styles.phone, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.chatHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
            <Text style={[font.smallStrong, { color: c.primaryStrong }]}>R</Text>
          </View>
          <Text style={[font.bodyStrong, { color: c.text, flex: 1, marginLeft: space.sm }]}>Ravi</Text>
          <Text style={[font.label, { color: c.textFaint }]}>Demo</Text>
        </View>

        <Pressable onPress={tapOutside} style={styles.messages} accessibilityLabel="Chat area">
          <View style={[styles.msgIn, { backgroundColor: c.surface }]}>
            <Text style={[font.small, { color: c.text }]}>Kal ka plan pakka?</Text>
          </View>
          <View style={[styles.msgIn, { backgroundColor: c.surface }]}>
            <Text style={[font.small, { color: c.text }]}>Ankit bhi aa raha hai 😄</Text>
          </View>
          {incoming ? (
            <FadeIn from={8} duration={motion.normal} style={[styles.msgIn, { backgroundColor: c.surface }]}>
              <Text style={[font.small, { color: c.text }]}>{INCOMING}</Text>
            </FadeIn>
          ) : (
            <Pressable
              onPress={simulateIncoming}
              accessibilityRole="button"
              accessibilityLabel="Simulate a new message from Ravi with a deadline"
              style={[styles.simulate, { borderColor: c.borderStrong }]}
            >
              <MaterialCommunityIcons name="alarm" size={16} color={c.primaryStrong} />
              <Text style={[font.smallStrong, { color: c.primaryStrong, marginLeft: space.xs }]}>
                Simulate: Ravi asks for something “by 6”
              </Text>
            </Pressable>
          )}
        </Pressable>

        {/* Card above the toolbar */}
        {card && (
          <FadeIn key={card.title} duration={motion.normal} style={[styles.card, { backgroundColor: OV.bar, borderColor: OV.border }]}>
            <Text style={[font.smallStrong, { color: OV.accent }]}>{card.title}</Text>
            {card.subtitle ? <Text style={[font.small, { color: OV.muted, marginTop: 2 }]}>{card.subtitle}</Text> : null}
            {card.chips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => {
                  if (card.onChip === 'insert') {
                    setDraft(chip);
                    flash('Inserted into the message box');
                  } else {
                    flash(
                      chip.startsWith('📤')
                        ? 'Sent to Ravi (demo)'
                        : chip.startsWith('▶')
                          ? 'Playing preview (demo)'
                          : chip.startsWith('↩')
                            ? 'Reminder removed (demo)'
                            : chip.startsWith('⏰')
                              ? 'Now reminds you at 5:00 PM (demo)'
                              : 'Pick any of 6 voices',
                    );
                  }
                  setCard(null);
                }}
                style={[styles.chip, { borderColor: '#FECDD31F' }]}
              >
                <Text style={[font.small, { color: OV.text }]}>{chip}</Text>
              </Pressable>
            ))}
          </FadeIn>
        )}

        {/* Transient notice (own line so the toolbar never squeezes it) */}
        {notice ? (
          <FadeIn key={notice} from={6} duration={motion.fast} style={[styles.notice, { backgroundColor: OV.bar }]}>
            <Text style={[font.small, { color: OV.text }]}>{notice}</Text>
          </FadeIn>
        ) : null}

        {/* Bubble ⇄ toolbar, docked right like the real overlay */}
        <View style={styles.overlayRow}>
          <View style={{ flex: 1 }} />
          {open ? (
            <Animated.View
              style={[
                styles.toolbar,
                {
                  backgroundColor: OV.bar,
                  borderColor: OV.border,
                  opacity: toolbarAnim,
                  transform: [{ translateX: toolbarAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
                },
              ]}
            >
              {ACTIONS.map((a) => {
                const isRec = a.key === 'voice' && recording !== null;
                const done = tried.includes(a.key);
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => (recording === null ? run(a.key) : undefined)}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    style={[
                      styles.tbBtn,
                      isRec && { width: 64, backgroundColor: OV.rose },
                      last === a.key && !isRec && { borderColor: OV.accent },
                    ]}
                  >
                    {isRec ? (
                      <Text style={[font.smallStrong, { color: OV.text }]}>● 0:0{recording}</Text>
                    ) : (
                      <MaterialCommunityIcons name={a.icon} size={18} color={OV.icon} />
                    )}
                    {done && !isRec ? <View style={[styles.doneDot, { backgroundColor: OV.accent }]} /> : null}
                  </Pressable>
                );
              })}
              <Pressable onPress={() => recording === null && (setOpen(false), setCard(null))} style={styles.tbClose} accessibilityLabel="Close toolbar">
                <MaterialCommunityIcons name="chevron-right" size={18} color={OV.icon} />
              </Pressable>
            </Animated.View>
          ) : (
            <Pulse active={tried.length === 0}>
              <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open the ConvoAI toolbar">
                <AppMark size={40} />
              </Pressable>
            </Pulse>
          )}
        </View>

        {/* Message box */}
        <View style={[styles.input, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[font.small, { color: draft ? c.text : c.textFaint, flex: 1 }]} numberOfLines={2}>
            {draft || 'Message'}
          </Text>
          <MaterialCommunityIcons name="send" size={18} color={c.primary} />
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[...ACTIONS.map((a) => a.key as TryKey), 'reminder' as TryKey].map((k) => (
            <View
              key={k}
              style={{ width: 18, height: 6, borderRadius: radius.sm, backgroundColor: tried.includes(k) ? c.primary : c.primarySoft }}
            />
          ))}
        </View>
        <Text style={[font.small, { color: c.textMuted, flex: 1, marginLeft: space.md }]}>
          Tried {tried.length} of {DEMO_STEPS}
        </Text>
        <Pressable onPress={reset} hitSlop={8} accessibilityRole="button" accessibilityLabel="Replay demo">
          <Text style={[font.smallStrong, { color: c.primaryStrong }]}>↺ Replay</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderRadius: radius.md, marginBottom: space.md, minHeight: 56 },
  phone: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 28, height: 28, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: space.md, minHeight: 110 },
  msgIn: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, marginBottom: space.sm, maxWidth: '80%' },
  card: { marginHorizontal: space.md, marginBottom: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
  chip: { marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, backgroundColor: '#FECDD314' },
  overlayRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 52, marginBottom: space.sm },
  notice: { alignSelf: 'flex-end', marginHorizontal: space.md, marginBottom: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', padding: 6, borderRadius: radius.lg, borderWidth: 1, gap: 6 },
  tbBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FECDD314',
    borderWidth: 1,
    borderColor: '#FECDD31F',
  },
  tbClose: { width: 24, height: 36, alignItems: 'center', justifyContent: 'center' },
  doneDot: { position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 3 },
  input: { flexDirection: 'row', alignItems: 'center', margin: space.md, marginTop: 0, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  progress: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  simulate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 40,
  },
});
