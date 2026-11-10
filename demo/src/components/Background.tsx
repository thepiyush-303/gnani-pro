/** Slowly drifting blurred rose blobs; they glide to new spots on every slide change. */

import { motion } from 'framer-motion';

const BLOBS = [
  { color: '#FECDD3', size: 720 },
  { color: '#FDA4AF', size: 520 },
  { color: '#FFE4E8', size: 640 },
];

const SPOTS: [number, number][][] = [
  [[-180, -200], [1380, 620], [700, 520]],
  [[1300, -260], [-120, 640], [820, 180]],
  [[-220, 520], [1420, -120], [600, -260]],
  [[1180, 560], [100, -240], [-200, 260]],
];

export function Background({ index }: { index: number }) {
  const spots = SPOTS[index % SPOTS.length];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          initial={false}
          animate={{ x: spots[i][0], y: spots[i][1] }}
          transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            background: b.color,
            filter: 'blur(110px)',
            opacity: 0.75,
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.12, 1], rotate: [0, 20, 0] }}
            transition={{ duration: 14 + i * 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '100%', height: '100%', borderRadius: '50%', background: b.color }}
          />
        </motion.div>
      ))}
    </div>
  );
}
