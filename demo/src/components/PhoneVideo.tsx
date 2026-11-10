/**
 * Phone frame (9:20) that plays public/videos/<clip>.mp4 while its slide is on screen.
 * Starts from the beginning on mount, unmuted when the browser allows it (a key press counts
 * as user interaction), else muted. Missing clip → an empty screen with the expected file name
 * (the name hides with H for clean recording).
 */

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useDeck } from '../deck/DeckContext';
import { Icon } from './Icon';
import { mdiVideoOutline } from '@mdi/js';

export function PhoneVideo({ clip, height = 900 }: { clip: string; height?: number }) {
  const { clean, muted, replayToken } = useDeck();
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const width = Math.round((height * 9) / 20);
  const src = `${import.meta.env.BASE_URL}videos/${clip}.mp4`;

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.play().catch(() => {
      v.muted = true; // autoplay with sound blocked: play muted instead
      v.play().catch(() => {});
    });
  };

  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (state !== 'ready' || !ref.current) return;
    ref.current.currentTime = 0;
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayToken, state]);

  useEffect(() => () => ref.current?.pause(), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.1 }}
      style={{
        width: width + 24,
        height: height + 24,
        padding: 12,
        borderRadius: 52,
        background: 'linear-gradient(145deg, #2A0F1B, #12050A)',
        boxShadow: '0 40px 80px -30px #4C0519AA, inset 0 0 0 2px #FDA4AF33',
        position: 'relative',
        flex: 'none',
      }}
    >
      <div
        data-clip-state={state}
        style={{
          width,
          height,
          borderRadius: 40,
          overflow: 'hidden',
          background: '#0B0306',
          position: 'relative',
        }}
      >
        <video
          ref={ref}
          src={src}
          playsInline
          preload="auto"
          onLoadedData={() => setState('ready')}
          onError={() => setState('missing')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: state === 'ready' ? 'block' : 'none',
          }}
        />
        {state !== 'ready' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              color: '#FDA4AF',
              background: 'radial-gradient(ellipse at 50% 30%, #2A0F1B 0%, #0B0306 75%)',
            }}
          >
            {!clean && (
              <>
                <Icon path={mdiVideoOutline} size={44} color="#FDA4AF" />
                <div style={{ fontSize: 18, fontWeight: 600 }}>Your recording</div>
                <code style={{ fontSize: 15, color: '#F5C2CB', fontFamily: 'Poppins' }}>videos/{clip}.mp4</code>
              </>
            )}
          </div>
        )}
      </div>
      {/* camera notch */}
      <div
        style={{
          position: 'absolute',
          top: 22,
          left: '50%',
          width: 14,
          height: 14,
          marginLeft: -7,
          borderRadius: 7,
          background: '#000',
          boxShadow: 'inset 0 0 0 2px #333',
        }}
      />
    </motion.div>
  );
}
