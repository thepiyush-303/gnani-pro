/** What makes ConvoAI unique: six tilt cards, then the privacy band. */

import { motion } from 'framer-motion';
import {
  mdiAccountQuestionOutline,
  mdiAccountVoice,
  mdiAlarm,
  mdiCalendarClock,
  mdiForumOutline,
  mdiShieldLockOutline,
  mdiWhatsapp,
} from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { Reveal, TiltCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { c } from '../theme';

const ITEMS = [
  { icon: mdiForumOutline, title: 'Reads the conversation', body: 'Not just your draft: every suggestion is grounded in what was actually said.' },
  { icon: mdiAccountQuestionOutline, title: 'No presets', body: 'Boss or best friend? Tone is inferred from how you two talk, never from a name.' },
  { icon: mdiCalendarClock, title: 'Knows what day it is', body: 'Every message carries its send date, so yesterday’s “kal” means today.' },
  { icon: mdiWhatsapp, title: 'Lives inside WhatsApp', body: 'No app switching, no copy-paste. A bubble right above the message box.' },
  { icon: mdiAccountVoice, title: 'Speaks India’s languages', body: '10 Indian languages in, 6 natural voices out, with Gnani Prisma and Timbre.' },
  { icon: mdiAlarm, title: 'Remembers your promises', body: 'Deadlines you owe become reminders, before they’re due.' },
];

const PRIVACY = [
  'Chats are never stored: memory only',
  'AI only when you tap (+ a filtered deadline check)',
  'Phone numbers masked before any AI call',
  'Failures show Retry, never fake replies',
  'Voice notes go only to the open chat',
];

export function Unique({ step }: SlideProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="eyebrow">What makes it different</div>
      <div className="h2" style={{ marginTop: 6 }}>Not another chatbot. A copilot that understands the chat.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 40 }}>
        {ITEMS.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 50, rotateX: -30 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ type: 'spring', stiffness: 140, damping: 16, delay: 0.1 + i * 0.1 }}
            style={{ transformPerspective: 900 }}
          >
            <TiltCard
              style={{
                height: 230,
                padding: '28px 30px',
                borderRadius: 26,
                background: '#FFFFFFE6',
                border: '1.5px solid #9F123926',
                boxShadow: '0 30px 60px -36px #831843AA',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    background: i % 2 ? c.primarySoft : c.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon path={it.icon} size={32} color={i % 2 ? c.primary : '#FFF1F2'} />
                </div>
                <div style={{ fontSize: 27, fontWeight: 700, color: c.text, letterSpacing: -0.4 }}>{it.title}</div>
              </div>
              <div style={{ fontSize: 21, lineHeight: 1.5, color: c.textMuted, marginTop: 16 }}>{it.body}</div>
            </TiltCard>
          </motion.div>
        ))}
      </div>

      <Reveal show={step >= 1} style={{ marginTop: 34 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            padding: '24px 32px',
            borderRadius: 26,
            background: 'linear-gradient(135deg, #1C0A12, #3D0C1E)',
            color: '#FFF1F2',
            boxShadow: '0 30px 60px -30px #1C0A12',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
            <Icon path={mdiShieldLockOutline} size={44} color="#FDA4AF" />
            <div style={{ fontSize: 28, fontWeight: 700 }}>Private by design</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {PRIVACY.map((p, i) => (
              <motion.span
                key={p}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                style={{ padding: '8px 16px', borderRadius: 999, background: '#FECDD31F', border: '1px solid #FDA4AF4D', fontSize: 18 }}
              >
                {p}
              </motion.span>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
