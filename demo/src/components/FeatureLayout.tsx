/**
 * Feature slide layout: recording in a phone frame on the left; on the right the feature
 * header, the pipeline strip and the cards that build up step by step.
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PhoneVideo } from './PhoneVideo';
import { type Stage, StageStrip } from './StageStrip';
import { Icon } from './Icon';
import { c } from '../theme';

export function FeatureLayout({
  number,
  icon,
  title,
  tagline,
  clip,
  stages,
  activeStage,
  children,
}: {
  number: number;
  icon: string;
  title: string;
  tagline: string;
  clip: string;
  stages: Stage[];
  activeStage: number;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 64, height: '100%', padding: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <PhoneVideo clip={clip} height={880} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'flex', alignItems: 'center', gap: 22 }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              background: c.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 16px 36px -14px #C8143FAA',
              flex: 'none',
            }}
          >
            <Icon path={icon} size={42} color="#FFF1F2" />
          </div>
          <div>
            <div className="eyebrow">Feature {String(number).padStart(2, '0')}</div>
            <div className="h2">{title}</div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="lead"
          style={{ marginTop: 14, maxWidth: 1100 }}
        >
          {tagline}
        </motion.div>
        <div style={{ marginTop: 26 }}>
          <StageStrip stages={stages} active={activeStage} />
        </div>
        <div style={{ flex: 1, marginTop: 22, position: 'relative', minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
