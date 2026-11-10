/**
 * 3 · How ConvoAI works: the architecture builds box by box (arrows draw, packets flow),
 * with a numbered caption for each step. Step 0 = intro caption only.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { SlideProps } from '../deck/types';
import { CaptionBar } from '../components/CaptionBar';
import { c } from '../theme';

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  tag: string;
  body: string;
  gnani?: boolean;
  /** Step at which the box appears. */
  at: number;
}

// Diagram area: 1728 × 620, placed under the header.
const BOXES: Box[] = [
  {
    id: 'chat',
    x: 0,
    y: 0,
    w: 470,
    h: 150,
    title: 'You chat in WhatsApp',
    tag: 'Indic',
    body: 'English, Hindi, Hinglish or any mix',
    at: 1,
  },
  {
    id: 'a11y',
    x: 629,
    y: 0,
    w: 470,
    h: 150,
    title: 'Accessibility service',
    tag: 'Android',
    body: 'reads the open chat: who said what, and when',
    at: 2,
  },
  {
    id: 'overlay',
    x: 1258,
    y: 0,
    w: 470,
    h: 150,
    title: 'Bubble & toolbar',
    tag: 'Overlay',
    body: 'appears only inside chats, above the message box',
    at: 3,
  },
  {
    id: 'gemini',
    x: 1258,
    y: 240,
    w: 470,
    h: 160,
    title: 'Evon v3.3/Gemini 3.5 Flash',
    tag: 'LLM',
    body: '✨ improve · 💬 replies · 🌐 translate · ⏰ deadlines',
    at: 4,
  },
  {
    id: 'prisma',
    x: 629,
    y: 240,
    w: 470,
    h: 160,
    title: 'Gnani Prisma v3',
    tag: 'STT',
    body: 'speech → text in 10 Indian languages',
    gnani: true,
    at: 5,
  },
  {
    id: 'timbre',
    x: 0,
    y: 240,
    w: 470,
    h: 160,
    title: 'Gnani Timbre v3.0',
    tag: 'TTS',
    body: 'text → speech in 6 natural voices',
    gnani: true,
    at: 6,
  },
  {
    id: 'back',
    x: 0,
    y: 490,
    w: 1099,
    h: 120,
    title: 'Back into your chat',
    tag: 'Result',
    body: 'text in the message box · voice note sent to the open chat',
    at: 7,
  },
  {
    id: 'remind',
    x: 1258,
    y: 490,
    w: 470,
    h: 120,
    title: 'Reminder notification',
    tag: 'Alarm',
    body: 'before what you owe is due',
    at: 7,
  },
];

const ARROWS: {
  d: string;
  at: number;
  label?: string;
  lx?: number;
  ly?: number;
}[] = [
  { d: 'M470 75 L629 75', at: 2, label: 'screen', lx: 520, ly: 62 },
  { d: 'M1099 75 L1258 75', at: 3, label: 'context', lx: 1140, ly: 62 },
  { d: 'M1493 150 L1493 240', at: 4, label: 'text', lx: 1505, ly: 202 },
  {
    d: 'M1350 150 C 1300 200, 1000 190, 864 240',
    at: 5,
    label: 'audio',
    lx: 1100,
    ly: 186,
  },
  { d: 'M629 320 L470 320', at: 6, label: 'voice notes', lx: 482, ly: 306 },
  { d: 'M235 400 L235 490', at: 7 },
  { d: 'M864 400 L864 490', at: 7, label: 'dictation', lx: 876, ly: 452 },
  { d: 'M1350 400 C 1300 450, 1150 440, 1099 530', at: 7 },
  { d: 'M1493 400 L1493 490', at: 7 },
  { d: 'M0 560 C -60 540, -60 100, 0 75', at: 7 },
];

const CAPTIONS = [
  'ConvoAI turns one tap inside WhatsApp into the right words, in the right language. Here’s how.',
  'You chat on WhatsApp as usual, in English, Hindi, Hinglish or any mix.',
  'An Android accessibility service reads the chat you have open: who said what, and when. In memory only, never stored.',
  'The ConvoAI bubble appears above the message box, only inside chats. Tap it for the toolbar.',
  'Text features (✨ Improve, 💬 Replies, 🌐 Translate, ⏰ Deadlines) go to Gemini with the role-tagged, dated conversation.',
  'Your voice goes to Gnani Prisma v3: speech to text in 10 Indian languages.',
  'For voice notes, Gnani Timbre v3.0 speaks your words again in one of 6 natural voices.',
  'The result lands back in your chat, and deadlines you owe become reminders.',
];

export function HowItWorks({ step }: SlideProps) {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div className="eyebrow">How it works</div>
      <div className="h2" style={{ marginTop: 6 }}>
        From a WhatsApp chat to the right words
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 150,
          width: 1728,
          height: 620,
        }}
      >
        <svg
          width={1728}
          height={620}
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={c.primaryStrong} />
            </marker>
          </defs>
          {ARROWS.map((a, i) =>
            step >= a.at ? (
              <g key={i}>
                <motion.path
                  d={a.d}
                  fill="none"
                  stroke={c.primaryStrong}
                  strokeWidth={3}
                  strokeLinecap="round"
                  markerEnd="url(#arrow)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.25 }}
                />
                <circle r={7} fill={c.primary} opacity={0}>
                  <set attributeName="opacity" to="1" begin="0.9s" />
                  <animateMotion
                    dur="1.8s"
                    repeatCount="indefinite"
                    path={a.d}
                    begin="0.9s"
                  />
                </circle>
                {a.label && (
                  <motion.text
                    x={a.lx}
                    y={a.ly}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    fill={c.primary}
                    fontSize={18}
                    fontWeight={600}
                    fontFamily="Poppins"
                  >
                    {a.label}
                  </motion.text>
                )}
              </g>
            ) : null,
          )}
        </svg>

        <AnimatePresence>
          {BOXES.filter((b) => step >= b.at).map((b) => {
            const current = step === b.at;
            const hue = b.gnani ? c.success : c.primary;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  boxShadow: current
                    ? `0 0 0 4px ${hue}55, 0 30px 60px -30px ${hue}`
                    : '0 20px 40px -30px #831843AA',
                }}
                transition={{ type: 'spring', stiffness: 180, damping: 18 }}
                style={{
                  position: 'absolute',
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  borderRadius: 24,
                  padding: '22px 26px',
                  background: current
                    ? b.gnani
                      ? '#F0FDF4'
                      : '#FFFFFF'
                    : '#FFFFFFD0',
                  border: `2px solid ${current ? hue : '#9F123930'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: c.text,
                      letterSpacing: -0.4,
                    }}
                  >
                    {b.title}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: hue,
                      letterSpacing: 1.5,
                    }}
                  >
                    {b.tag.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: c.textMuted,
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {b.body}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <CaptionBar n={step === 0 ? undefined : step} text={CAPTIONS[step]} />
    </div>
  );
}

export const HOW_STEPS = CAPTIONS.length;
