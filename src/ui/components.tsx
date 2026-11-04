/**
 * Small, theme-aware building blocks shared by Home and the tutorial.
 */

import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from './theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const APP_MARK = require('../../assets/icon.png');

export function AppMark({ size = 44 }: { size?: number }) {
  return <Image source={APP_MARK} style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[font.label, { color: c.textFaint }]}>{children}</Text>
      {right}
    </View>
  );
}

export function IconBadge({ icon, color, bg, size = 40 }: { icon: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={icon} size={size * 0.52} color={color} />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  variant = 'solid',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'solid' | 'soft' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  const bg = variant === 'solid' ? c.primary : variant === 'soft' ? c.primarySoft : 'transparent';
  const fg = variant === 'solid' ? c.onPrimary : c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: '#ffffff22' }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? c.primary : c.surfaceAlt, borderColor: selected ? c.primary : c.border },
      ]}
    >
      <Text style={[font.small, { color: selected ? c.onPrimary : c.text, fontWeight: selected ? '700' : '500' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export type PermissionState = 'granted' | 'denied' | 'unknown';

export function PermissionRow({
  icon,
  title,
  description,
  status,
  onGrant,
  hint,
}: {
  icon: IconName;
  title: string;
  description: string;
  status: PermissionState;
  onGrant: () => void;
  hint?: React.ReactNode;
}) {
  const { c } = useTheme();
  const granted = status === 'granted';
  return (
    <View style={styles.permRow}>
      <IconBadge icon={granted ? 'check' : icon} color={granted ? c.success : c.primary} bg={granted ? c.successSoft : c.primarySoft} />
      <View style={{ flex: 1, marginHorizontal: space.md }}>
        <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>{title}</Text>
        <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]}>{description}</Text>
        {!granted && hint ? <View style={{ marginTop: space.sm }}>{hint}</View> : null}
      </View>
      {granted ? (
        <Text style={[font.small, { color: c.success, fontWeight: '700' }]}>Granted</Text>
      ) : (
        <PrimaryButton title="Grant" onPress={onGrant} style={{ paddingHorizontal: space.md, minHeight: 36 }} />
      )}
    </View>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'muted' }) {
  const { c } = useTheme();
  const fg = tone === 'success' ? c.success : tone === 'warning' ? c.warning : c.textMuted;
  const bg = tone === 'success' ? c.successSoft : tone === 'warning' ? c.warningSoft : c.surfaceAlt;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={[font.small, { color: fg, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

export function StepDots({ count, index }: { count: number; index: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            width: i === index ? 22 : 6,
            borderRadius: 3,
            backgroundColor: i === index ? c.primary : c.border,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    marginBottom: space.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    marginTop: space.xs,
  },
  button: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontSize: 14, fontWeight: '700' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    gap: 6,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
});
