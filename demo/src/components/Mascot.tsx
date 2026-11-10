import { motion } from 'framer-motion';
import mascot from '../assets/mascot.png';

/** The ConvoAI mascot (assets/new-icon.png) with a soft float. */
export function Mascot({ size = 160, float = true, delay = 0 }: { size?: number; float?: boolean; delay?: number }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -12 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 14, delay }}
      style={{ width: size, height: size, flex: 'none' }}
    >
      <motion.img
        src={mascot}
        alt="ConvoAI"
        animate={float ? { y: [0, -10, 0] } : undefined}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.24,
          boxShadow: '0 24px 60px -20px #C8143F80',
          display: 'block',
        }}
      />
    </motion.div>
  );
}
