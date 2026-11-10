/** Under the hood: the "powered by" card (Listens / Speaks / Thinks), then grouped tech stack cards. */

import { motion } from 'framer-motion';
import {
  mdiAndroid,
  mdiBrain,
  mdiCellphone,
  mdiPaletteOutline,
  mdiTestTube,
  mdiWaveform,
} from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { Reveal, TiltCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { c } from '../theme';

const POWER = [
  {
    k: 'Listens',
    v: 'Gnani Prisma v3',
    d: 'speech → text · 10 Indian languages',
    gnani: true,
  },
  {
    k: 'Speaks',
    v: 'Gnani Timbre v3.0',
    d: 'text → speech · 6 voices · Ogg/Opus',
    gnani: true,
  },
  {
    k: 'Thinks',
    v: 'Evon v3.3/Gemini 3.5 Flash Lite',
    d: 'JSON mode · Gnani Evon switchable',
  },
];

const GROUPS = [
  {
    icon: mdiCellphone,
    title: 'App',
    items: [
      'Expo SDK 51',
      'React Native 0.74',
      'TypeScript (strict)',
      'expo-router',
    ],
  },
  {
    icon: mdiAndroid,
    title: 'Android native',
    items: [
      'Kotlin Expo module',
      'AccessibilityService',
      'Overlay windows',
      'AlarmManager + notifications',
    ],
  },
  {
    icon: mdiBrain,
    title: 'AI layer',
    items: [
      'One LLM client, typed errors',
      'Role-tagged, dated chat payload',
      'Output validation',
      'No canned fallbacks',
    ],
  },
  {
    icon: mdiWaveform,
    title: 'Voice',
    items: [
      'MediaRecorder',
      'Gnani STT + TTS APIs',
      'Hold-and-glide pickers',
      'Guarded share-sheet send',
    ],
  },
  {
    icon: mdiPaletteOutline,
    title: 'Design',
    items: [
      'DESIGN.md tokens',
      'Rose palette',
      'Poppins',
      'Bento layout · dark mode',
    ],
  },
  {
    icon: mdiTestTube,
    title: 'Quality',
    items: ['Live prompt eval', 'Kotlin unit tests', 'Tested on a real phone'],
  },
];

export function Tech({ step }: SlideProps) {
  return (
    <div style={{ height: '100%', display: 'flex', gap: 48 }}>
      <div
        style={{
          width: 640,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="eyebrow">Under the hood</div>
        <div className="h2" style={{ marginTop: 6 }}>
          Built with
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 120,
            damping: 18,
            delay: 0.1,
          }}
          style={{
            marginTop: 30,
            padding: '34px 36px',
            borderRadius: 32,
            background: 'linear-gradient(160deg, #2A0F1B, #1C0A12)',
            color: '#FFF1F2',
            boxShadow: '0 40px 80px -40px #1C0A12',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Mascot size={86} float={false} />
            <div>
              <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>
                ConvoAI
              </div>
              <div style={{ fontSize: 18, color: '#F5C2CB' }}>
                Powered by Gnani AI speech + Gemini
              </div>
            </div>
          </div>
          {POWER.map((p, i) => (
            <motion.div
              key={p.k}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.18 }}
              style={{
                marginTop: 18,
                padding: '16px 20px',
                borderRadius: 18,
                background: p.gnani ? '#15803D26' : '#FECDD314',
                border: `1px solid ${p.gnani ? '#4ADE8066' : '#FDA4AF4D'}`,
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
                    fontSize: 18,
                    letterSpacing: 2,
                    fontWeight: 700,
                    color: p.gnani ? '#4ADE80' : '#FDA4AF',
                  }}
                >
                  {p.k.toUpperCase()}
                </span>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{p.v}</span>
              </div>
              <div
                style={{
                  fontSize: 17,
                  color: '#F5C2CB',
                  marginTop: 4,
                  textAlign: 'right',
                }}
              >
                {p.d}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridAutoRows: 'auto',
          alignContent: 'center',
          gap: 22,
        }}
      >
        {GROUPS.map((g, i) => (
          <Reveal
            key={g.title}
            show={step >= 1}
            delay={i * 0.08}
            from="pop"
            style={{ height: '100%' }}
          >
            <TiltCard
              style={{
                height: '100%',
                padding: '24px 26px',
                borderRadius: 24,
                background: '#FFFFFFE6',
                border: '1.5px solid #9F123926',
                boxShadow: '0 24px 50px -32px #831843AA',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon path={g.icon} size={30} color={c.primary} />
                <span style={{ fontSize: 24, fontWeight: 700, color: c.text }}>
                  {g.title}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                {g.items.map((it) => (
                  <span
                    key={it}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: c.surfaceAlt,
                      color: c.text,
                      fontSize: 17,
                      fontWeight: 500,
                    }}
                  >
                    {it}
                  </span>
                ))}
              </div>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
