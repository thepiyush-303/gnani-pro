/** Quality: real numbers from the prompt eval and the Kotlin unit tests (see src/data/quality.ts). */

import { motion } from 'framer-motion';
import { mdiCheckCircle, mdiInformationOutline } from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { Reveal } from '../components/Cards';
import { Icon } from '../components/Icon';
import { QUALITY } from '../data/quality';
import { c } from '../theme';

function Squiggle({ ok, delay }: { ok: boolean; delay: number }) {
  return (
    <svg width={44} height={20} viewBox="0 0 44 20">
      <motion.path
        d="M3 12 C 10 2, 16 2, 22 10 S 34 18, 41 8"
        fill="none"
        stroke={ok ? '#4D7C0F' : '#E11D48'}
        strokeWidth={4.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: ok ? 0.85 : 0.6 }}
        transition={{ duration: 0.35, delay }}
      />
    </svg>
  );
}

export function Quality({ step }: SlideProps) {
  const q = QUALITY;
  const pct = Math.round((q.prompt.passed / q.prompt.total) * 100);
  const cells = Array.from({ length: q.prompt.total }, (_, i) => i < q.prompt.passed);
  return (
    <div style={{ height: '100%', display: 'flex', gap: 56 }}>
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{
          width: 880,
          flex: 'none',
          alignSelf: 'center',
          padding: '40px 46px',
          borderRadius: 32,
          background: '#FFFFFFE6',
          border: '1.5px solid #9F123930',
          boxShadow: '0 40px 80px -44px #831843AA',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: c.text, letterSpacing: -0.8 }}>Prompt eval</div>
        <div style={{ fontSize: 19, color: c.primary, fontWeight: 600, marginTop: 4 }}>{q.prompt.subtitle}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 44px)', gap: '10px 18px', marginTop: 30 }}>
          {cells.map((ok, i) => (
            <Squiggle key={i} ok={ok} delay={0.3 + i * 0.025} />
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 12, delay: 1 }}
          style={{ fontSize: 150, fontWeight: 800, color: '#4D7C0F', letterSpacing: -5, lineHeight: 1, marginTop: 26 }}
        >
          {pct}%
        </motion.div>
        <div style={{ fontSize: 30, fontWeight: 600, color: c.text, marginTop: 8 }}>
          {q.prompt.passed} of {q.prompt.total} checks passed
        </div>
        <div style={{ fontSize: 20, color: c.textMuted, marginTop: 6 }}>{q.prompt.when}</div>
        <div style={{ display: 'flex', gap: 28, marginTop: 22, fontSize: 18, color: c.textMuted, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Squiggle ok delay={0} /> passed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Squiggle ok={false} delay={0} /> {q.prompt.missLabel}
          </span>
        </div>
      </motion.div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
        <div className="eyebrow">Tested, not just demoed</div>
        <div className="h2">Checks that run against the live model</div>
        {q.groups.map((g, i) => (
          <Reveal key={g.name} show={step >= 1} delay={i * 0.1} from="right">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '13px 22px',
                borderRadius: 18,
                background: '#FFFFFFE6',
                border: '1.5px solid #9F123926',
              }}
            >
              <Icon path={mdiCheckCircle} size={30} color={g.passed === g.total ? c.success : c.warning} />
              <span style={{ flex: 1, fontSize: 22, color: c.text }}>{g.name}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: g.passed === g.total ? c.success : c.warning }}>
                {g.passed}/{g.total}
              </span>
            </div>
          </Reveal>
        ))}
        <Reveal show={step >= 2} from="up">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '18px 22px',
              borderRadius: 20,
              background: '#1C0A12',
              color: '#FFF1F2',
              fontSize: 19,
              lineHeight: 1.5,
            }}
          >
            <span style={{ flex: 'none', marginTop: 2 }}>
              <Icon path={mdiInformationOutline} size={26} color="#FDA4AF" />
            </span>
            <span>{q.note}</span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
