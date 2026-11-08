/**
 * Theme-aware building blocks shared by Home and the tutorial (DESIGN.md: Rose · Mono · Bento).
 *
 * Radius: 4 compact controls (chips, labels) · 8 cards, buttons, icon tiles · 12 feature / hero surfaces.
 * Interactive states: default, pressed, disabled, loading (focus is the platform's native ring).
 */

import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from './theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const APP_MARK = require('../../assets/new-icon.png');

/** The ConvoAI mascot icon. */
export function AppMark({ size = 44 }: { size?: number }) {
  return <Image source={APP_MARK} style={{ width: size, height: size, borderRadius: radius.lg }} accessibilityIgnoresInvertColors />;
}

type CardVariant = 'standard' | 'feature' | 'hero' | 'soft';

/** One card = one role. Don't nest cards inside cards. */
export function Card({
  children,
  style,
  variant = 'standard',
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: CardVariant;
}) {
  const { c } = useTheme();
  const look: ViewStyle =
    variant === 'hero'
      ? { backgroundColor: c.primary, borderColor: c.primary, borderRadius: radius.lg, padding: space.xl }
      : variant === 'feature'
        ? { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.lg, padding: space.xl }
        : variant === 'soft'
          ? { backgroundColor: c.primarySoft, borderColor: c.primarySoft, borderRadius: radius.md, padding: space.lg }
          : { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.md, padding: space.lg };
  return <View style={[styles.card, look, style]}>{children}</View>;
}

/** Bento module: a compact, tappable card used inside a 2-column row. */
export function Tile({
  children,
  onPress,
  selected,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={onPress ? { expanded: !!selected } : undefined}
      android_ripple={onPress ? { color: c.primarySoft } : undefined}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.borderStrong : c.border,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[font.label, { color: c.textFaint }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

/** Icon in an 8dp rounded square (echoes the mascot's screen shape). */
export function IconBadge({ icon, color, bg, size = 40 }: { icon: IconName; color: string; bg: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.5} color={color} />
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
  variant?: 'solid' | 'soft' | 'ghost' | 'onHero';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  const bg =
    variant === 'solid' ? c.primary : variant === 'soft' ? c.primarySoft : variant === 'onHero' ? c.onPrimary : 'transparent';
  const fg =
    // ghost text sits on the page bg: primaryStrong keeps AA in both themes (primary is ~3.2:1 on dark)
    variant === 'solid' ? c.onPrimary : variant === 'onHero' ? c.primary : c.primaryStrong;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      android_ripple={{ color: variant === 'solid' ? '#FFFFFF33' : c.primarySoft }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} style={{ marginRight: space.sm }} /> : null}
          <Text style={[font.bodyStrong, { color: fg }]}>{title}</Text>
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
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surfaceAlt,
          borderColor: selected ? c.primary : c.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[selected ? font.smallStrong : font.small, { color: selected ? c.onPrimary : c.text }]}>{label}</Text>
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
      <IconBadge
        icon={granted ? 'check' : icon}
        color={granted ? c.success : c.primaryStrong}
        bg={granted ? c.successSoft : c.primarySoft}
      />
      <View style={{ flex: 1, marginHorizontal: space.md }}>
        <Text style={[font.bodyStrong, { color: c.text }]}>{title}</Text>
        <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]}>{description}</Text>
        {!granted && hint ? <View style={{ marginTop: space.sm }}>{hint}</View> : null}
      </View>
      {granted ? (
        <StatusPill label="Granted" tone="success" />
      ) : (
        <PrimaryButton title="Grant" onPress={onGrant} style={{ paddingHorizontal: space.md, minHeight: 36 }} />
      )}
    </View>
  );
}

/** Status label: colour + dot + text (never colour alone). */
export function StatusPill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'muted' | 'onHero' }) {
  const { c } = useTheme();
  const fg =
    tone === 'success' ? c.success : tone === 'warning' ? c.warning : tone === 'onHero' ? c.onPrimary : c.textMuted;
  const bg =
    tone === 'success' ? c.successSoft : tone === 'warning' ? c.warningSoft : tone === 'onHero' ? '#FFFFFF2E' : c.surfaceAlt;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={[font.smallStrong, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StepDots({ count, index }: { count: number; index: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${index + 1} of ${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            width: i === index ? 24 : 6,
            borderRadius: radius.sm,
            backgroundColor: i === index ? c.primary : c.primarySoft,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
  },
  tile: {
    flex: 1,
    borderRadius: radius.md,
    padding: space.lg,
    overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    marginTop: space.lg,
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
  chip: {
    paddingHorizontal: space.md,
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    gap: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
});
