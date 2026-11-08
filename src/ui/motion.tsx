/**
 * Motion helpers (DESIGN.md: 120 / 180 / 260 ms, motion clarifies state, reduced-motion fallback).
 * Built on React Native's Animated with the native driver; no extra dependency.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ViewStyle } from 'react-native';
import { motion } from './theme';

/** True when the user turned on "Remove animations" (system setting). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** Fades + slides its children in on mount (staggered with `delay`). */
export function FadeIn({
  children,
  delay = 0,
  from = 12,
  duration = motion.slow,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: number;
  duration?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduced, v, delay, duration]);
  return (
    <Animated.View
      style={[
        style as ViewStyle,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Gentle repeating scale pulse (e.g. "tap me" hints). Static when reduced motion is on or `active` is false. */
export function Pulse({ children, active = true, style }: { children: React.ReactNode; active?: boolean; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !active) {
      v.stopAnimation();
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, active, v]);
  return (
    <Animated.View style={[style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Springs from 0 → 1 scale when it mounts (success checks, celebrations). */
export function Pop({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.spring(v, { toValue: 1, delay, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [reduced, v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v }] }]}>{children}</Animated.View>;
}
