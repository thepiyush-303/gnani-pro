/**
 * Presentation engine: a fixed 1920×1080 stage scaled to the window, arrow-key navigation
 * through slides and their build steps, position kept in the URL hash (#/slide/step, 1-based).
 *
 *   → Space PageDown  next step / slide      ← PageUp  back
 *   Home End          first / last slide      F  fullscreen
 *   H  hide HUD (clean recording)             M  mute clips   R  replay clip
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { SlideDef } from './types';
import { DeckContext } from './DeckContext';
import { Background } from '../components/Background';

function readHash(slides: SlideDef[]): { index: number; step: number } {
  const m = /^#\/(\d+)(?:\/(\d+))?/.exec(window.location.hash);
  if (!m) return { index: 0, step: 0 };
  const index = Math.min(Math.max(Number(m[1]) - 1, 0), slides.length - 1);
  const step = Math.min(Math.max(Number(m[2] ?? 1) - 1, 0), slides[index].steps - 1);
  return { index, step };
}

export function Deck({ slides }: { slides: SlideDef[] }) {
  const [{ index, step }, setPos] = useState(() => readHash(slides));
  const [dir, setDir] = useState(1);
  const [clean, setClean] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const [scale, setScale] = useState(1);

  // Fit the stage to the window
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const h = `#/${index + 1}/${step + 1}`;
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [index, step]);

  useEffect(() => {
    const onHash = () => setPos(readHash(slides));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [slides]);

  const next = useCallback(() => {
    setDir(1);
    setPos((p) => {
      if (p.step < slides[p.index].steps - 1) return { ...p, step: p.step + 1 };
      if (p.index < slides.length - 1) return { index: p.index + 1, step: 0 };
      return p;
    });
  }, [slides]);

  const prev = useCallback(() => {
    setDir(-1);
    setPos((p) => {
      if (p.step > 0) return { ...p, step: p.step - 1 };
      if (p.index > 0) return { index: p.index - 1, step: slides[p.index - 1].steps - 1 };
      return p;
    });
  }, [slides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          prev();
          break;
        case 'Home':
          setDir(-1);
          setPos({ index: 0, step: 0 });
          break;
        case 'End':
          setDir(1);
          setPos({ index: slides.length - 1, step: 0 });
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else document.documentElement.requestFullscreen().catch(() => {});
          break;
        case 'h':
        case 'H':
          setClean((v) => !v);
          break;
        case 'm':
        case 'M':
          setMuted((v) => !v);
          break;
        case 'r':
        case 'R':
          setReplayToken((t) => t + 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, slides.length]);

  const slide = slides[index];
  const ctx = useMemo(() => ({ clean, muted, replayToken }), [clean, muted, replayToken]);
  const total = slides.reduce((n, s) => n + s.steps, 0);
  const done = slides.slice(0, index).reduce((n, s) => n + s.steps, 0) + step + 1;

  return (
    <DeckContext.Provider value={ctx}>
      <div className="viewport">
        <div className="stage" style={{ transform: `scale(${scale})` }}>
          <Background index={index} />
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={slide.id}
              className="slide"
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 80, filter: 'blur(6px)' }),
                center: { opacity: 1, x: 0, filter: 'blur(0px)' },
                exit: (d: number) => ({ opacity: 0, x: d * -80, filter: 'blur(6px)' }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <slide.Component step={step} />
            </motion.div>
          </AnimatePresence>
          <div className="grain" />

          {!clean && (
            <div style={hud.wrap}>
              <div style={hud.track}>
                <motion.div style={hud.fill} animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.4 }} />
              </div>
              <div style={hud.row}>
                <span style={hud.label}>
                  {index + 1} / {slides.length} · {slide.title}
                  {slide.steps > 1 ? ` · ${step + 1}/${slide.steps}` : ''}
                </span>
                <span style={hud.keys}>
                  <kbd>←</kbd> <kbd>→</kbd> navigate · <kbd>F</kbd> fullscreen · <kbd>H</kbd> hide · <kbd>M</kbd>{' '}
                  {muted ? 'unmute' : 'mute'} · <kbd>R</kbd> replay clip
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </DeckContext.Provider>
  );
}

const hud = {
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 32px 18px', pointerEvents: 'none' },
  track: { height: 4, borderRadius: 2, background: '#FECDD3', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, background: '#C8143F' },
  row: { display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 15, color: '#9F1239' },
  label: { fontWeight: 600 },
  keys: { opacity: 0.85 },
} as const;
