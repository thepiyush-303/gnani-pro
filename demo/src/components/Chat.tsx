/** Mini WhatsApp-style visuals and the ConvoAI overlay (toolbar, glide menu, result card). */

import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { mdiAccountVoice, mdiChevronRight, mdiCreation, mdiForumOutline, mdiMicrophoneOutline, mdiTranslate } from '@mdi/js';
import { Icon } from './Icon';
import { ov } from '../theme';

export function ChatBubble({
  from,
  children,
  time,
  delay = 0,
  style,
}: {
  from: 'them' | 'me';
  children: ReactNode;
  time?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const me = from === 'me';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay }}
      style={{
        alignSelf: me ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        background: me ? '#D9FDD3' : '#FFFFFF',
        color: '#111B21',
        borderRadius: 14,
        borderTopRightRadius: me ? 4 : 14,
        borderTopLeftRadius: me ? 14 : 4,
        padding: '10px 14px 8px',
        fontSize: 19,
        lineHeight: 1.4,
        boxShadow: '0 1px 1px #0000001A',
        ...style,
      }}
    >
      {children}
      {time && <div style={{ fontSize: 12, color: '#667781', textAlign: 'right', marginTop: 2 }}>{time}</div>}
    </motion.div>
  );
}

const TOOLS = [
  { key: 'improve', path: mdiCreation },
  { key: 'translate', path: mdiTranslate },
  { key: 'voice', path: mdiAccountVoice },
  { key: 'replies', path: mdiForumOutline },
  { key: 'dictate', path: mdiMicrophoneOutline },
] as const;

export type ToolKey = (typeof TOOLS)[number]['key'];

/** The overlay toolbar, with one tool highlighted (glowing). */
export function OverlayToolbar({ active, scale = 1 }: { active?: ToolKey; scale?: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8 * scale,
        padding: 8 * scale,
        borderRadius: 16 * scale,
        background: ov.bar,
        border: `1px solid ${ov.border}`,
        boxShadow: '0 20px 40px -20px #1C0A12',
      }}
    >
      {TOOLS.map((t) => {
        const on = t.key === active;
        return (
          <motion.div
            key={t.key}
            animate={on ? { boxShadow: ['0 0 0 0 #FDA4AF00', '0 0 0 8px #FDA4AF40', '0 0 0 0 #FDA4AF00'] } : {}}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{
              width: 48 * scale,
              height: 48 * scale,
              borderRadius: 12 * scale,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: on ? ov.rose : '#FECDD314',
              border: `1px solid ${on ? ov.accent : '#FECDD31F'}`,
            }}
          >
            <Icon path={t.path} size={24 * scale} color={ov.icon} />
          </motion.div>
        );
      })}
      <div style={{ width: 22 * scale, display: 'flex', justifyContent: 'center' }}>
        <Icon path={mdiChevronRight} size={22 * scale} color={ov.icon} />
      </div>
    </div>
  );
}

/** Hold-and-glide picker: the highlighted row moves to `selected`. */
export function GlideMenu({ items, selected, title }: { items: string[]; selected: number; title: string }) {
  return (
    <div
      style={{
        width: 280,
        borderRadius: 18,
        background: ov.bar,
        border: `1px solid ${ov.border}`,
        padding: 10,
        color: ov.text,
        boxShadow: '0 30px 60px -30px #1C0A12',
      }}
    >
      <div style={{ fontSize: 13, letterSpacing: 2, color: ov.accent, fontWeight: 700, padding: '6px 10px 8px' }}>{title}</div>
      <div style={{ position: 'relative' }}>
        <motion.div
          animate={{ y: selected * 50 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          style={{ position: 'absolute', left: 0, right: 0, height: 46, borderRadius: 12, background: ov.rose, boxShadow: '0 0 24px #C8143F88' }}
        />
        {items.map((it, i) => (
          <div
            key={it}
            style={{
              position: 'relative',
              height: 46,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              fontSize: 19,
              fontWeight: i === selected ? 700 : 500,
            }}
          >
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The overlay's result card (title + chips). */
export function OverlayCard({ title, subtitle, chips, highlight }: { title: string; subtitle?: string; chips: string[]; highlight?: number }) {
  return (
    <div
      style={{
        borderRadius: 20,
        background: ov.bar,
        border: `1px solid ${ov.border}`,
        padding: '18px 20px',
        color: ov.text,
        boxShadow: '0 30px 60px -30px #1C0A12',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: ov.accent }}>{title}</div>
      {subtitle && <div style={{ fontSize: 15, color: ov.muted, marginTop: 4, whiteSpace: 'pre-line' }}>{subtitle}</div>}
      {chips.map((ch, i) => (
        <motion.div
          key={ch}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.12 }}
          style={{
            marginTop: 10,
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 17,
            background: i === highlight ? '#C8143F40' : '#FECDD314',
            border: `1px solid ${i === highlight ? ov.accent : '#FECDD31F'}`,
          }}
        >
          {ch}
        </motion.div>
      ))}
    </div>
  );
}
