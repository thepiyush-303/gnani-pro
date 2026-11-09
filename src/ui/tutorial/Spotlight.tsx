/**
 * Coach-mark helpers for the tutorial demo:
 *  - <Spotlight>: dims its container except a cut-out "hole" around the target, with a breathing glow
 *    ring. The dimmed area swallows taps (calls onMiss), so only the lit control can be pressed.
 *  - <Confetti>: a one-shot burst for the finish card.
 * Both respect the system "Remove animations" setting (static ring, no confetti).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../motion';
import { radius } from '../theme';

export interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const DIM = 'rgba(18, 6, 12, 0.62)';

export function Spotlight({ hole, color, onMiss }: { hole: Hole; color: string; onMiss: () => void }) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      breath.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, breath]);

  const x = Math.max(0, hole.x - PAD);
  const y = Math.max(0, hole.y - PAD);
  const w = hole.w + PAD * 2;
  const h = hole.h + PAD * 2;
  const r = Math.min(radius.md, h / 2); // near-square hole → the ring hugs its corners

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Four dim panels around the hole: taps on them are "misses" */}
      <Pressable onPress={onMiss} style={[styles.dim, { left: 0, right: 0, top: 0, height: y }]} accessible={false} />
      <Pressable onPress={onMiss} style={[styles.dim, { left: 0, right: 0, top: y + h, bottom: 0 }]} accessible={false} />
      <Pressable onPress={onMiss} style={[styles.dim, { left: 0, width: x, top: y, height: h }]} accessible={false} />
      <Pressable onPress={onMiss} style={[styles.dim, { left: x + w, right: 0, top: y, height: h }]} accessible={false} />

      {/* Breathing halo (outer) + crisp ring (inner); never intercept touches */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: x - 6,
            top: y - 6,
            width: w + 12,
            height: h + 12,
            borderRadius: r + 6,
            borderColor: color,
            borderWidth: 6,
            opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
            transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) }],
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[styles.ring, { left: x, top: y, width: w, height: h, borderRadius: r, borderColor: color, borderWidth: 2 }]}
      />
    </View>
  );
}

const CONFETTI_COLORS = ['#F43F5E', '#FDA4AF', '#FBBF24', '#34D399', '#60A5FA', '#C084FC'];

export function Confetti({ count = 18 }: { count?: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + (i % 2 ? 0.2 : -0.2);
        const dist = 70 + (i % 4) * 22;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 30,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          size: 6 + (i % 3) * 2,
          round: i % 3 !== 0,
        };
      }),
    [count],
  );

  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduced, v]);

  if (reduced) return null;
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: { position: 'absolute' },
  confetti: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
});
