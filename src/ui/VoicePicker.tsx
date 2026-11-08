/**
 * Voice list for 🗣 voice notes: tap a row to choose, ▶ to hear a sample.
 * Used by Home (settings) and the tutorial ("Choose your voice").
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IndicContext, { type TimbreVoice } from 'indic-context';
import { font, radius, space, useTheme } from './theme';
import { IconBadge } from './components';

/** No playback-finished event from native, so the ■ state clears after a sample-length timeout. */
const SAMPLE_MS = 4500;

export function VoicePicker({
  voices,
  selected,
  onSelect,
}: {
  voices: TimbreVoice[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { c } = useTheme();
  const [preview, setPreview] = useState<{ id: string; state: 'loading' | 'playing' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      IndicContext.stopVoicePreview().catch(() => {});
    },
    [],
  );

  const togglePreview = useCallback(
    async (id: string) => {
      if (timer.current) clearTimeout(timer.current);
      if (preview?.id === id) {
        setPreview(null);
        await IndicContext.stopVoicePreview().catch(() => {});
        return;
      }
      setPreview({ id, state: 'loading' });
      try {
        await IndicContext.previewVoice(id);
        setPreview({ id, state: 'playing' });
        timer.current = setTimeout(() => setPreview(null), SAMPLE_MS);
      } catch (e: any) {
        setPreview(null);
        ToastAndroid.show('Couldn’t play the sample. Check your connection.', ToastAndroid.SHORT);
      }
    },
    [preview],
  );

  return (
    <View accessibilityRole="radiogroup">
      {voices.map((v, i) => {
        const isSel = selected === v.id;
        const p = preview?.id === v.id ? preview.state : null;
        return (
          <View
            key={v.id}
            style={[
              styles.row,
              { borderColor: isSel ? c.borderStrong : c.border, backgroundColor: isSel ? c.primarySoft : c.surface },
              i > 0 && { marginTop: space.sm },
            ]}
          >
            <Pressable
              onPress={() => onSelect(v.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${v.id}, ${v.gender}, ${v.style}`}
              android_ripple={{ color: c.primarySoft }}
              style={styles.main}
            >
              <IconBadge
                icon={v.gender === 'male' ? 'face-man-outline' : 'face-woman-outline'}
                color={isSel ? c.onPrimary : c.primaryStrong}
                bg={isSel ? c.primary : c.primarySoft}
                size={36}
              />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={[isSel ? font.bodyStrong : font.body, { color: c.text }]}>{v.id}</Text>
                <Text style={[font.small, { color: c.textMuted }]}>
                  {v.gender === 'male' ? 'Male' : 'Female'} · {v.style}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={isSel ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={isSel ? c.primary : c.textFaint}
              />
            </Pressable>
            <Pressable
              onPress={() => togglePreview(v.id)}
              accessibilityRole="button"
              accessibilityLabel={p === 'playing' ? `Stop ${v.id} sample` : `Play ${v.id} sample`}
              hitSlop={6}
              style={[styles.play, { backgroundColor: p ? c.primary : c.surfaceAlt, borderColor: c.border }]}
            >
              {p === 'loading' ? (
                <ActivityIndicator size="small" color={c.onPrimary} />
              ) : (
                <MaterialCommunityIcons
                  name={p === 'playing' ? 'stop' : 'play'}
                  size={20}
                  color={p ? c.onPrimary : c.primaryStrong}
                />
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    paddingRight: space.md,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: space.md },
  play: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
});
