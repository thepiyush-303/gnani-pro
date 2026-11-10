/** Closing card: name, tagline, Listens / Speaks / Thinks, GitHub, credits, confetti. */

import { motion } from 'framer-motion';
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { mdiAndroid, mdiGithub } from '@mdi/js';
import { Mascot } from '../components/Mascot';
import { Icon } from '../components/Icon';
import { Underline } from '../components/Effects';
import { c } from '../theme';

const LINES = [
  ['Listens', 'Gnani Prisma v3'],
  ['Speaks', 'Gnani Timbre v3.0'],
  ['Thinks', 'Evon v3.3/Gemini 3.5 Flash Lite'],
];

export function Closing() {
  useEffect(() => {
    const colors = ['#C8143F', '#FDA4AF', '#FECDD3', '#15803D', '#FBBF24'];
    const t = setTimeout(() => {
      confetti({
        particleCount: 140,
        spread: 100,
        origin: { y: 0.35 },
        colors,
        scalar: 1.1,
      });
      confetti({
        particleCount: 60,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.6 },
        colors,
      });
      confetti({
        particleCount: 60,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.6 },
        colors,
      });
    }, 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <Mascot size={150} />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: 120,
          fontWeight: 800,
          letterSpacing: -4,
          lineHeight: 1,
          marginTop: 24,
          color: c.text,
        }}
      >
        Convo<span style={{ color: c.primary }}>AI</span>
      </motion.div>
      <div style={{ marginTop: 6 }}>
        <Underline width={420} delay={0.6} />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        style={{
          fontSize: 32,
          fontWeight: 600,
          color: c.primary,
          marginTop: 18,
        }}
      >
        Write better, in every language, in every chat.
      </motion.div>

      <div style={{ display: 'flex', gap: 18, marginTop: 34 }}>
        {LINES.map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.12 }}
            style={{
              padding: '14px 24px',
              borderRadius: 18,
              background: '#FFFFFFE6',
              border: '1.5px solid #9F123926',
              fontSize: 22,
              color: c.text,
            }}
          >
            <span
              style={{ fontWeight: 700, color: i < 2 ? c.success : c.primary }}
            >
              {k}:
            </span>{' '}
            {v}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 22,
          color: c.textMuted,
          marginTop: 22,
        }}
      >
        <Icon path={mdiAndroid} size={26} color={c.success} />
        Runs as a standalone Android APK
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.6, type: 'spring', stiffness: 160, damping: 14 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          marginTop: 34,
          padding: '22px 44px',
          borderRadius: 24,
          background: '#1C0A12',
          color: '#FFF1F2',
          boxShadow: '0 30px 60px -30px #1C0A12',
        }}
      >
        <Icon path={mdiGithub} size={46} color="#FFF1F2" />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.5 }}>
            github.com/thepiyush-303
          </div>
          <div style={{ fontSize: 18, color: '#F5C2CB' }}>
            repository: gnani-pro
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.9 }}
        style={{ marginTop: 30 }}
      >
        <div style={{ fontSize: 22, fontWeight: 600, color: c.text }}>
          Prisma + Timbre by Gnani AI
        </div>
        <div style={{ fontSize: 19, color: c.textMuted, marginTop: 4 }}>
          Built for the Gnani AI Internship Hackathon
        </div>
      </motion.div>
    </div>
  );
}
