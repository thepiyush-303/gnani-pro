/**
 * The pipeline strip at the top of a feature slide (e.g. DRAFT → CONTEXT → GEMINI → INSERT).
 * Stages up to `active` light up; the current one pulses; captions appear under lit stages.
 */

import { motion } from 'framer-motion';
import { Fragment } from 'react';
import { c } from '../theme';

export interface Stage {
  label: string;
  caption?: string;
  /** Highlight as Gnani tech (green) instead of rose. */
  gnani?: boolean;
}

export function StageStrip({ stages, active }: { stages: Stage[]; active: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {stages.map((s, i) => {
        const lit = i <= active;
        const current = i === active;
        const hue = s.gnani ? c.success : c.primary;
        return (
          <Fragment key={s.label}>
            {i > 0 && (
              <div style={{ position: 'relative', width: 34, height: 3, marginTop: 30, background: '#9F123922' }}>
                <motion.div
                  initial={false}
                  animate={{ width: lit ? '100%' : '0%' }}
                  transition={{ duration: 0.35 }}
                  style={{ height: 3, background: hue }}
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110 }}>
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: lit ? (s.gnani ? '#DCFCE7' : '#FFFFFF') : '#FFF1F200',
                  borderColor: lit ? hue : '#9F123940',
                  color: lit ? (s.gnani ? c.success : c.text) : '#9F123980',
                  scale: current ? 1.06 : 1,
                  boxShadow: current ? `0 10px 30px -10px ${hue}AA` : '0 0 0 0 #0000',
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '2px solid',
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label}
              </motion.div>
              <motion.div
                initial={false}
                animate={{ opacity: lit && s.caption ? 1 : 0, y: lit ? 0 : -6 }}
                style={{ fontSize: 14, color: c.textMuted, marginTop: 8, height: 20, whiteSpace: 'nowrap' }}
              >
                {s.caption ?? ''}
              </motion.div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
