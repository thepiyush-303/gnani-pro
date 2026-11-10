import { AnimatePresence, motion } from 'framer-motion';
import { c } from '../theme';

/** Numbered caption at the bottom of a build-up slide. */
export function CaptionBar({ n, text }: { n?: number; text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        minHeight: 104,
        borderRadius: 24,
        background: '#FFFFFFE6',
        border: '1.5px solid #9F123930',
        boxShadow: '0 24px 50px -30px #83184380',
        display: 'flex',
        alignItems: 'center',
        padding: '20px 32px',
        overflow: 'hidden',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 26, lineHeight: 1.4, color: c.text }}
        >
          {n !== undefined && (
            <span
              style={{
                flex: 'none',
                width: 52,
                height: 52,
                borderRadius: 16,
                background: c.primary,
                color: '#FFF1F2',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {n}
            </span>
          )}
          <span>{text}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
