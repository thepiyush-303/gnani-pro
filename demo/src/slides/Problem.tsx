/**
 * 2 · The problem. Step 0: the formal statement. Step 1: the ConvoAI line underlines in.
 * Step 2: the statement moves up and four pain points drop in as hanging cards (draggable).
 */

import { motion } from 'framer-motion';
import { mdiAccountSwitchOutline, mdiCalendarAlertOutline, mdiKeyboardOutline, mdiTranslate } from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { HangingCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { Underline } from '../components/Effects';
import { c } from '../theme';

const PAINS = [
  { icon: mdiAccountSwitchOutline, title: 'Wrong tone', body: 'The same words go to your boss and your best friend.' },
  { icon: mdiTranslate, title: 'Three languages, one chat', body: 'English, Hindi and Hinglish, often in a single message.' },
  { icon: mdiKeyboardOutline, title: 'Typing is slow', body: 'Many people would rather speak, and not always in their own voice.' },
  { icon: mdiCalendarAlertOutline, title: 'Promises slip', body: '“I’ll send it by Monday”… and Monday comes and goes.' },
];

export function Problem({ step }: SlideProps) {
  const compact = step >= 2;
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <motion.div
        className="eyebrow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        The problem
      </motion.div>

      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{
          position: 'absolute',
          left: compact ? 0 : 160,
          right: compact ? 0 : 160,
          top: compact ? 50 : 230,
          padding: compact ? '30px 48px' : '70px 80px',
          borderRadius: 36,
          background: '#FFFFFFD9',
          border: '1.5px solid #9F123926',
          boxShadow: '0 40px 80px -40px #83184380',
          textAlign: 'center',
        }}
      >
        <motion.div
          layout="position"
          style={{
            fontSize: compact ? 40 : 64,
            fontWeight: 700,
            letterSpacing: compact ? -0.8 : -1.5,
            lineHeight: 1.2,
            color: c.text,
          }}
        >
          Your boss and your best friend
          {compact ? ' ' : <br />}
          shouldn’t get the same message.
        </motion.div>
        {step >= 1 && (
          <motion.div
            layout="position"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'inline-block', marginTop: compact ? 12 : 36 }}
          >
            <div style={{ fontSize: compact ? 32 : 48, fontWeight: 700, color: c.primary, letterSpacing: -0.5 }}>
              With ConvoAI, every message fits the chat.
            </div>
            <Underline width={compact ? 640 : 960} delay={0.25} />
          </motion.div>
        )}
      </motion.div>

      {compact && (
        <div
          style={{
            position: 'absolute',
            top: 300,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 10px',
          }}
        >
          {PAINS.map((p, i) => (
            <HangingCard key={p.title} delay={0.15 + i * 0.18} string={60 + (i % 2) * 50} width={380} tilt={i % 2 ? 2 : -2}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: c.primarySoft,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon path={p.icon} size={36} color={c.primary} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 18, color: c.text, letterSpacing: -0.4 }}>{p.title}</div>
              <div style={{ fontSize: 21, lineHeight: 1.5, marginTop: 8, color: c.textMuted }}>{p.body}</div>
            </HangingCard>
          ))}
        </div>
      )}
    </div>
  );
}
