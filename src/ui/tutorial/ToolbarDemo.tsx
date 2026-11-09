/**
 * Interactive tutorial demo: a mock chat with the ConvoAI bubble, run as a guided tour.
 *
 *   A spotlight (dimmed phone + breathing glow) marks the ONE control to press next:
 *   bubble → ✨ → a suggestion → 🌐 → 💬 → 🎙 → 🗣 → 📤 Send → simulated "by 6 baje" message → ↩ Undo
 *   → 🎉 congratulations. While something plays out (typing, recording), the spotlight steps aside.
 *   After the tour every button is free to try again; ↺ Replay restarts it.
 *
 * Everything is simulated locally (no LLM / network calls).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppMark, type IconName } from '../components';
import { FadeIn, Pop, useReducedMotion } from '../motion';
import { font, motion, radius, space, useTheme } from '../theme';
import { Confetti, type Hole, Spotlight } from './Spotlight';

type ActionKey = 'improve' | 'translate' | 'voice' | 'replies' | 'dictate';

const ACTIONS: { key: ActionKey; icon: IconName; label: string; explain: string }[] = [
  { key: 'improve', icon: 'creation', label: 'Improve', explain: '✨ Rewrites your draft in the chat’s own tone.' },
  { key: 'translate', icon: 'translate', label: 'Translate', explain: '🌐 Swaps your draft into Hindi or English. Hold the button to pick the language.' },
  { key: 'voice', icon: 'account-voice', label: 'Voice note', explain: '🗣 Records you, then re-speaks your words in your chosen voice.' },
  { key: 'replies', icon: 'forum-outline', label: 'Smart replies', explain: '💬 Three replies that fit the conversation. Tap one to insert it.' },
  { key: 'dictate', icon: 'microphone-outline', label: 'Dictate', explain: '🎙 Speak and your words are typed into the message box.' },
];

const INCOMING = 'Shaam 6 baje tak address bhej dena 🙏';
const IMPROVE_CHIPS = ['Kal shaam aa jaunga, pakka!', 'Haan, kal shaam free hu, aata hu'];
const SEND_CHIP = '📤 Send to Ravi';
const UNDO_CHIP = '↩ Undo';
const DICTATED = 'kal shaam milte hain';

/**
 * The guided tour. `target` = the control to light up; null = a waiting step (something is
 * playing out) that the demo advances by itself.
 */
type Target = 'bubble' | ActionKey | 'simulate' | `chip:${string}`;
const GUIDE: { target: Target | null; coach: string }[] = [
  { target: 'bubble', coach: 'Tap the glowing ConvoAI bubble to open the toolbar' },
  { target: 'improve', coach: 'Tap ✨ Improve to rewrite your draft' },
  { target: `chip:${IMPROVE_CHIPS[0]}`, coach: 'Tap a suggestion to put it in the message box' },
  { target: 'translate', coach: 'Tap 🌐 Translate to switch it to Hindi' },
  { target: 'replies', coach: 'Tap 💬 Smart replies for ready-made answers' },
  { target: 'dictate', coach: 'Tap 🎙 Dictate to speak instead of typing' },
  { target: null, coach: '🎙 Listening… watch the message box' },
  { target: 'voice', coach: 'Tap 🗣 to record a voice note in another voice' },
  { target: null, coach: '🗣 Recording… (it stops by itself in the demo)' },
  { target: `chip:${SEND_CHIP}`, coach: 'Your voice note is ready. Send it to Ravi' },
  { target: 'simulate', coach: 'Now Ravi asks for something “by 6”. Tap to make his message arrive' },
  { target: null, coach: '⏰ ConvoAI is reading the new message…' },
  { target: `chip:${UNDO_CHIP}`, coach: 'It set a reminder by itself. Tap ↩ Undo: you stay in control' },
];
const TAP_STEPS = GUIDE.filter((g) => g.target !== null).length;

/** Number of steps the user completes in the tour (reported through onProgress). */
export const DEMO_STEPS = TAP_STEPS;

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

export function ToolbarDemo({ onProgress }: { onProgress?: (done: number) => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(START_DRAFT);
  const [card, setCard] = useState<DemoCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [last, setLast] = useState<ActionKey | 'reminder' | null>(null);
  /** Index into GUIDE; GUIDE.length = tour finished. */
  const [step, setStep] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [hole, setHole] = useState<Hole | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toolbarAnim = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const phoneRef = useRef<View>(null);
  const targetRefs = useRef<Record<string, View | null>>({});
  const reg = (id: Target) => (r: View | null) => {
    targetRefs.current[id] = r;
  };

  const guide = GUIDE[step] ?? null;
  const touring = step < GUIDE.length;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  useEffect(() => {
    onProgress?.(GUIDE.slice(0, step).filter((g) => g.target !== null).length);
  }, [step, onProgress]);

  /** Moves the tour on if the user pressed the lit control (or a waiting step finished). */
  const advance = useCallback((from: Target | null) => {
    setStep((i) => (i < GUIDE.length && GUIDE[i].target === from ? i + 1 : i));
  }, []);

  useEffect(() => {
    if (step === GUIDE.length) setCelebrate(true);
  }, [step]);

  useEffect(() => {
    Animated.timing(toolbarAnim, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : motion.normal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, reduced, toolbarAnim]);

  // ── Spotlight position: measure the target relative to the phone mock. Re-measured a few times
  //    because toolbars/cards animate in.
  const measure = useCallback(() => {
    const id = guide?.target;
    const t = id ? targetRefs.current[id] : null;
    const p = phoneRef.current;
    if (!t || !p || !touring || celebrate) {
      setHole(null);
      return;
    }
    p.measureInWindow((px, py) => {
      t.measureInWindow((x, y, w, h) => {
        if (!w || !h) setHole(null);
        else setHole({ x: x - px, y: y - py, w, h });
      });
    });
  }, [guide, touring, celebrate]);

  useEffect(() => {
    setHole(null);
    const ids = [0, 120, 300, 550].map((ms) => setTimeout(measure, ms));
    return () => ids.forEach(clearTimeout);
  }, [measure, open, card, notice, incoming, recording]);

  /** Tapped outside the lit control: shake the coach card (it's never dimmed) to point back at it. */
  const nudge = () => {
    if (reduced) return;
    shake.setValue(0);
    Animated.sequence(
      [8, -8, 6, -6, 3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true })),
    ).start();
  };

  const flash = (msg: string) => {
    setNotice(msg);
    later(() => setNotice(null), 1800);
  };

  const typeInto = (text: string, done?: () => void) => {
    if (reduced) {
      setDraft(text);
      done?.();
      return;
    }
    setDraft('');
    text.split('').forEach((_, i) => later(() => setDraft(text.slice(0, i + 1)), 55 * (i + 1)));
    if (done) later(done, 55 * text.length + 250);
  };

  const run = (key: ActionKey) => {
    clearTimers();
    setCard(null);
    setNotice(null);
    setRecording(null);
    setLast(key);
    advance(key);
    switch (key) {
      case 'improve':
        setCard({ title: '✨ Improved for Ravi', chips: IMPROVE_CHIPS, onChip: 'insert' });
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
          setCard({ title: '✅ Ready in Lakshmi’s voice', subtitle: `“${DICTATED}”`, chips: [SEND_CHIP, '▶ Play', '🔄 Other voice'], onChip: 'notice' });
          advance(null);
        }, 2600);
        break;
      }
      case 'dictate':
        flash('🎙 Listening…');
        later(() => typeInto(DICTATED, () => advance(null)), 1100);
        break;
    }
  };

  const simulateIncoming = () => {
    clearTimers();
    setCard(null);
    setNotice(null);
    setRecording(null);
    setIncoming(true);
    setLast('reminder');
    advance('simulate');
    later(() => {
      setCard({
        title: '⏰ Reminder set',
        subtitle: 'Send Ravi the address\nReminds 5:30 PM today · due 6:00 PM',
        chips: [UNDO_CHIP, '⏰ Remind 1 hr before'],
        onChip: 'notice',
      });
      advance(null);
    }, reduced ? 0 : 1100);
  };

  const pressChip = (chip: string) => {
    if (!card) return;
    if (card.onChip === 'insert') {
      setDraft(chip);
      flash('Inserted into the message box');
    } else {
      flash(
        chip === SEND_CHIP
          ? 'Sent to Ravi (demo)'
          : chip.startsWith('▶')
            ? 'Playing preview (demo)'
            : chip === UNDO_CHIP
              ? 'Reminder removed (demo)'
              : chip.startsWith('⏰')
                ? 'Now reminds you at 5:00 PM (demo)'
                : 'Pick any of 6 voices',
      );
    }
    setCard(null);
    advance(`chip:${chip}`);
  };

  const openToolbar = () => {
    setOpen(true);
    advance('bubble');
  };

  const tapOutside = () => {
    if (!open || recording !== null || touring) return;
    clearTimers();
    setOpen(false);
    setCard(null);
    flash('Touching anywhere else closes the toolbar');
  };

  const replay = () => {
    clearTimers();
    setOpen(false);
    setCard(null);
    setNotice(null);
    setRecording(null);
    setDraft(START_DRAFT);
    setIncoming(false);
    setLast(null);
    setCelebrate(false);
    setStep(0);
  };

  const doneCount = GUIDE.slice(0, step).filter((g) => g.target !== null).length;
  const explain =
    last === 'reminder'
      ? '⏰ No button needed: ConvoAI spots “by 6 PM” deadlines you owe and reminds you before.'
      : last
        ? ACTIONS.find((a) => a.key === last)!.explain
        : null;

  return (
    <View>
      {/* Coach line: what to do now (and what the last button did) */}
      <Animated.View style={[styles.hint, { backgroundColor: touring ? c.primary : c.primarySoft, transform: [{ translateX: shake }] }]}>
        <MaterialCommunityIcons
          name={touring ? (guide?.target ? 'gesture-tap' : 'timer-sand') : 'check-decagram'}
          size={20}
          color={touring ? c.onPrimary : c.primaryStrong}
        />
        <View style={{ flex: 1, marginLeft: space.sm }}>
          {touring ? (
            <>
              <Text style={[font.label, { color: c.onPrimaryMuted }]}>
                Step {Math.min(doneCount + 1, TAP_STEPS)} of {TAP_STEPS}
              </Text>
              <Text style={[font.bodyStrong, { color: c.onPrimary }]}>{guide?.coach}</Text>
              {explain ? <Text style={[font.small, { color: c.onPrimaryMuted, marginTop: 2 }]}>{explain}</Text> : null}
            </>
          ) : (
            <Text style={[font.small, { color: c.primaryStrong }]}>
              {explain ?? 'Tour complete. Try any button again, or replay the tour.'}
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Phone mock */}
      <View ref={phoneRef} collapsable={false} style={[styles.phone, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
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
              ref={reg('simulate')}
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
                ref={reg(`chip:${chip}`)}
                onPress={() => pressChip(chip)}
                accessibilityRole="button"
                style={[styles.chip, { borderColor: '#FECDD31F' }]}
              >
                <Text style={[font.small, { color: OV.text }]}>{chip}</Text>
              </Pressable>
            ))}
          </FadeIn>
        )}

        {/* Bubble ⇄ toolbar, docked right like the real overlay */}
        <View style={styles.overlayRow}>
          {/* Transient notice floats above the toolbar, so it never shifts the buttons under a finger */}
          {notice && !celebrate ? (
            <View pointerEvents="none" style={styles.noticeAnchor}>
              <FadeIn key={notice} from={6} duration={motion.fast} style={[styles.notice, { backgroundColor: OV.bar }]}>
                <Text style={[font.small, { color: OV.text }]}>{notice}</Text>
              </FadeIn>
            </View>
          ) : null}
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
                return (
                  <Pressable
                    key={a.key}
                    ref={reg(a.key)}
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
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => recording === null && (setOpen(false), setCard(null))}
                style={styles.tbClose}
                accessibilityLabel="Close toolbar"
              >
                <MaterialCommunityIcons name="chevron-right" size={18} color={OV.icon} />
              </Pressable>
            </Animated.View>
          ) : (
            <Pressable
              ref={reg('bubble')}
              onPress={openToolbar}
              accessibilityRole="button"
              accessibilityLabel="Open the ConvoAI toolbar"
            >
              <AppMark size={40} />
            </Pressable>
          )}
        </View>

        {/* Message box */}
        <View style={[styles.input, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[font.small, { color: draft ? c.text : c.textFaint, flex: 1 }]} numberOfLines={2}>
            {draft || 'Message'}
          </Text>
          <MaterialCommunityIcons name="send" size={18} color={c.primary} />
        </View>

        {/* Focus: dim everything except the control to press next */}
        {touring && !celebrate ? (
          hole ? (
            <Spotlight hole={hole} color={OV.accent} onMiss={nudge} />
          ) : (
            // Waiting step (typing / recording / message arriving): hold touches so nothing interrupts it
            <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} />
          )
        ) : null}

        {/* Finish */}
        {celebrate ? (
          <View style={styles.celebrateWrap}>
            <Pop style={StyleSheet.flatten([styles.celebrateCard, { backgroundColor: c.surface, borderColor: c.border }])}>
              <Text style={styles.celebrateEmoji}>🎉</Text>
              <Text style={[font.title, { color: c.text, textAlign: 'center' }]}>Congratulations!</Text>
              <Text style={[font.small, { color: c.textMuted, textAlign: 'center', marginTop: space.xs }]}>
                You’ve tried every ConvoAI feature. It works the same way inside your WhatsApp chats.
              </Text>
              <View style={styles.celebrateRow}>
                <Pressable onPress={replay} accessibilityRole="button" style={[styles.celebrateBtn, { borderColor: c.border }]}>
                  <Text style={[font.smallStrong, { color: c.primaryStrong }]}>↺ Replay</Text>
                </Pressable>
                <Pressable
                  onPress={() => setCelebrate(false)}
                  accessibilityRole="button"
                  style={[styles.celebrateBtn, { backgroundColor: c.primary, borderColor: c.primary, marginLeft: space.sm }]}
                >
                  <Text style={[font.smallStrong, { color: c.onPrimary }]}>Explore freely</Text>
                </Pressable>
              </View>
            </Pop>
            <Confetti />
          </View>
        ) : null}
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        <View style={[styles.track, { backgroundColor: c.primarySoft }]}>
          <View style={[styles.fill, { backgroundColor: c.primary, width: `${(doneCount / TAP_STEPS) * 100}%` }]} />
        </View>
        <Text style={[font.small, { color: c.textMuted, marginLeft: space.md }]}>
          {doneCount}/{TAP_STEPS}
        </Text>
        <Pressable onPress={replay} hitSlop={8} accessibilityRole="button" accessibilityLabel="Replay the tour" style={{ marginLeft: space.md }}>
          <Text style={[font.smallStrong, { color: c.primaryStrong }]}>↺ Replay</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed-ish height: coach + explanation lines vary, and a height change would shift the lit target.
  hint: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderRadius: radius.md, marginBottom: space.md, minHeight: 124 },
  phone: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 28, height: 28, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: space.md, minHeight: 110 },
  msgIn: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, marginBottom: space.sm, maxWidth: '80%' },
  card: { marginHorizontal: space.md, marginBottom: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
  chip: { marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, backgroundColor: '#FECDD314' },
  overlayRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 52, marginBottom: space.sm },
  noticeAnchor: { position: 'absolute', right: space.md, bottom: '100%', zIndex: 2, elevation: 2 },
  notice: { marginBottom: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },
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
  input: { flexDirection: 'row', alignItems: 'center', margin: space.md, marginTop: 0, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  progress: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
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
  celebrateWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 6, 12, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  celebrateCard: { width: '100%', padding: space.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  celebrateEmoji: { fontSize: 40, lineHeight: 52 },
  celebrateRow: { flexDirection: 'row', marginTop: space.lg },
  celebrateBtn: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
});
