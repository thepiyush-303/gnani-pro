/** Small animated effects: Waveform, Typewriter, MorphText, Underline, Pulse dot. */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { c } from '../theme';

/** Animated audio bars. `live` = moving; otherwise a still "recorded" shape. */
export function Waveform({ bars = 42, color = c.primary, live = true, height = 54 }: { bars?: number; color?: string; live?: boolean; height?: number }) {
  const shape = useMemo(
    () => Array.from({ length: bars }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)) * 0.75),
    [bars],
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height }}>
      {shape.map((h, i) => (
        <motion.div
          key={i}
          animate={live ? { scaleY: [h * 0.4, h, h * 0.55, h * 0.9, h * 0.4] } : { scaleY: h }}
          transition={live ? { duration: 1.1 + (i % 5) * 0.12, repeat: Infinity, ease: 'easeInOut', delay: (i % 7) * 0.05 } : { duration: 0.3 }}
          style={{ width: 5, height, borderRadius: 3, background: color, transformOrigin: 'center' }}
        />
      ))}
    </div>
  );
}

/** Types `text` out once it mounts (or when `text` changes). */
export function Typewriter({ text, speed = 38, delay = 0, caret = true }: { text: string; speed?: number; delay?: number; caret?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setN(i);
      if (i < text.length) t = setTimeout(tick, speed);
    };
    t = setTimeout(tick, delay);
    return () => clearTimeout(t);
  }, [text, speed, delay]);
  return (
    <span>
      {text.slice(0, n)}
      {caret && (
        <motion.span
          animate={{ opacity: n < text.length ? 1 : [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{ display: 'inline-block', width: 3, height: '1em', marginLeft: 3, background: 'currentColor', verticalAlign: '-0.12em' }}
        />
      )}
    </span>
  );
}

/** Crossfades between texts by index (e.g. English → Devanagari). */
export function MorphText({ texts, index, style }: { texts: string[]; index: number; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(8px)' }}
          transition={{ duration: 0.45 }}
        >
          {texts[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** A hand-drawn-feeling rose underline that draws itself. */
export function Underline({ width = 420, delay = 0.3, color = c.primary }: { width?: number; delay?: number; color?: string }) {
  return (
    <svg width={width} height={22} viewBox={`0 0 ${width} 22`} style={{ display: 'block', overflow: 'visible' }}>
      <motion.path
        d={`M4 14 C ${width * 0.25} 6, ${width * 0.55} 18, ${width - 4} 9`}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay, ease: 'easeInOut' }}
      />
    </svg>
  );
}

export function PulseDot({ color = c.primary, size = 12 }: { color?: string; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
      <motion.span
        animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }}
      />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
    </span>
  );
}
