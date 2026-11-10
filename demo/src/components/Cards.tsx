/**
 * Card primitives:
 *  - InfoCard: pipeline card with a title and a right-aligned tech badge (light / glass / gnani).
 *  - Reveal: springs its children in once `show` is true (used for step-by-step builds).
 *  - HangingCard: a card on a string that swings in, sways, and can be dragged (springs back).
 *  - TiltCard: 3-D tilt following the pointer.
 */

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { c, ov } from '../theme';

type Variant = 'light' | 'glass' | 'gnani' | 'soft';

const VARIANTS: Record<Variant, { bg: string; border: string; title: string; text: string; badge: string }> = {
  light: { bg: '#FFFFFFE6', border: '#9F123926', title: c.primary, text: c.text, badge: c.textMuted },
  soft: { bg: '#FFE4E8', border: '#9F123926', title: c.primary, text: c.text, badge: c.textMuted },
  glass: { bg: `linear-gradient(160deg, ${ov.barSoft}, ${ov.bar})`, border: ov.border, title: ov.accent, text: ov.text, badge: ov.muted },
  gnani: { bg: '#F0FDF4', border: '#15803D55', title: c.success, text: '#14532D', badge: c.success },
};

export function InfoCard({
  title,
  badge,
  variant = 'light',
  children,
  style,
}: {
  title: string;
  badge?: string;
  variant?: Variant;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const v = VARIANTS[variant];
  return (
    <div
      style={{
        background: v.bg,
        border: `1.5px solid ${v.border}`,
        borderRadius: 22,
        padding: '22px 26px',
        color: v.text,
        boxShadow: variant === 'glass' ? '0 30px 60px -30px #1C0A12' : '0 20px 50px -30px #83184355',
        backdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2.5, color: v.title }}>{title}</span>
        {badge && <span style={{ fontSize: 15, fontWeight: 600, color: v.badge }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export function Reveal({
  show,
  children,
  delay = 0,
  from = 'up',
  style,
}: {
  show: boolean;
  children: ReactNode;
  delay?: number;
  from?: 'up' | 'left' | 'right' | 'pop';
  style?: CSSProperties;
}) {
  const initial =
    from === 'pop'
      ? { opacity: 0, scale: 0.6 }
      : { opacity: 0, x: from === 'left' ? -60 : from === 'right' ? 60 : 0, y: from === 'up' ? 40 : 0, scale: 0.97 };
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={initial}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 200, damping: 22, delay }}
          style={style}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function HangingCard({
  children,
  delay = 0,
  string = 120,
  width = 360,
  tilt = 0,
}: {
  children: ReactNode;
  delay?: number;
  string?: number;
  width?: number;
  tilt?: number;
}) {
  return (
    <motion.div
      initial={{ y: -500, rotate: tilt * 4 }}
      animate={{ y: 0, rotate: tilt }}
      transition={{ type: 'spring', stiffness: 70, damping: 9, delay }}
      style={{ transformOrigin: 'top center', width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <motion.div
        animate={{ rotate: [tilt - 2.5, tilt + 2.5, tilt - 2.5] }}
        transition={{ duration: 4 + delay, repeat: Infinity, ease: 'easeInOut', delay: delay + 1.2 }}
        style={{ transformOrigin: 'top center', display: 'flex', flexDirection: 'column', alignItems: 'center', width }}
      >
        {/* pin + string */}
        <div style={{ width: 16, height: 16, borderRadius: 8, background: c.primary, boxShadow: '0 2px 6px #4C051966' }} />
        <div style={{ width: 2, height: string, background: 'linear-gradient(#831843, #83184366)' }} />
        <motion.div
          drag
          dragSnapToOrigin
          dragElastic={0.6}
          whileDrag={{ scale: 1.04, rotate: 4, cursor: 'grabbing' }}
          whileHover={{ scale: 1.02 }}
          style={{
            width,
            cursor: 'grab',
            background: '#FFFFFF',
            borderRadius: 24,
            border: '1.5px solid #9F123926',
            boxShadow: '0 30px 60px -28px #83184380',
            padding: '28px 28px 30px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -7,
              left: '50%',
              marginLeft: -7,
              width: 14,
              height: 14,
              borderRadius: 7,
              border: '2px solid #831843',
              background: '#FFF1F2',
            }}
          />
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function TiltCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [10, -10]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-12, 12]), { stiffness: 200, damping: 20 });
  return (
    <motion.div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
      whileHover={{ scale: 1.03, z: 30 }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, ...style }}
    >
      {children}
    </motion.div>
  );
}
