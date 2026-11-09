/**
 * Home → ⏰ Reminders: the auto-detect switch, "Remind me before" lead time, and the
 * upcoming reminders (✓ Done / delete). Refreshes on the native onRemindersChanged event.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IndicContext, { type Reminder, type ReminderSettings } from 'indic-context';
import { font, radius, space, useTheme } from './theme';
import { Card, Chip, IconBadge, SectionTitle, StatusPill } from './components';

const LEADS = [10, 15, 30, 60];

const pad = (n: number) => String(n).padStart(2, '0');

function timeLabel(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

function dayLabel(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
  return diff > 1 && diff < 7 ? wd : `${wd} ${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
}

export function dueText(r: Reminder): string {
  return r.dueHasTime ? `${dayLabel(r.dueAtMs)} ${timeLabel(r.dueAtMs)}` : `${dayLabel(r.dueAtMs)} (no time)`;
}

export function RemindersSection({ notificationsOk, onGrantNotifications }: {
  notificationsOk: boolean;
  onGrantNotifications: () => void;
}) {
  const { c } = useTheme();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([IndicContext.getReminderSettings(), IndicContext.listReminders()]);
      setSettings(s);
      setItems([...list].sort((a, b) => a.remindAtMs - b.remindAtMs));
    } catch (e) {
      console.warn('[Reminders] load failed:', e);
    }
  }, []);

  useEffect(() => {
    load();
    const sub = IndicContext.addRemindersChangedListener(load);
    // Exact-alarm access can change in Settings while we're away; refresh now and then.
    const t = setInterval(load, 15000);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [load]);

  const save = useCallback(
    async (next: Partial<Pick<ReminderSettings, 'autoDetect' | 'leadMinutes'>>) => {
      if (!settings) return;
      const merged = { ...settings, ...next };
      setSettings(merged);
      await IndicContext.setReminderSettings(merged.autoDetect, merged.leadMinutes).catch(() => {});
      load();
    },
    [settings, load],
  );

  const done = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await IndicContext.completeReminder(id).catch(() => {});
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await IndicContext.deleteReminder(id).catch(() => {});
  }, []);

  const on = settings?.autoDetect ?? true;

  return (
    <>
      <SectionTitle right={items.length > 0 ? <StatusPill label={`${items.length} upcoming`} tone="muted" /> : undefined}>
        Reminders
      </SectionTitle>
      <Card>
        <View style={styles.row}>
          <IconBadge icon="alarm" color={c.primaryStrong} bg={c.primarySoft} />
          <View style={{ flex: 1, marginHorizontal: space.md }}>
            <Text style={[font.bodyStrong, { color: c.text }]}>Detect deadlines in chats</Text>
            <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]}>
              “Update me by 6 PM”, “I’ll send it by Monday”: ConvoAI sets a reminder for what you owe.
            </Text>
          </View>
          <Switch
            value={on}
            onValueChange={(v) => save({ autoDetect: v })}
            accessibilityLabel="Detect deadlines in chats"
            trackColor={{ false: c.border, true: c.primarySoft }}
            thumbColor={on ? c.primary : c.surfaceAlt}
          />
        </View>

        {on && (
          <>
            <Text style={[font.label, { color: c.textFaint, marginTop: space.lg }]}>Remind me before</Text>
            <View style={styles.wrap} accessibilityRole="radiogroup">
              {LEADS.map((m) => (
                <Chip
                  key={m}
                  label={m === 60 ? '1 hr' : `${m} min`}
                  selected={settings?.leadMinutes === m}
                  onPress={() => save({ leadMinutes: m })}
                />
              ))}
            </View>
            <Text style={[font.small, { color: c.textFaint }]}>
              Deadlines without a time (“by Monday”) remind you at 9:00 AM that day.
            </Text>
          </>
        )}

        {!notificationsOk && (
          <Hint
            icon="bell-off-outline"
            text="Notifications are off, so reminders can’t reach you."
            action="Turn on"
            onPress={onGrantNotifications}
          />
        )}
        {notificationsOk && settings && !settings.exactAlarms && (
          <Hint
            icon="clock-alert-outline"
            text="Reminders may arrive a few minutes late. Allow “Alarms & reminders” for exact times."
            action="Allow"
            onPress={() => IndicContext.openExactAlarmSettings().catch(() => {})}
          />
        )}
      </Card>

      {items.length === 0 ? (
        <Card variant="soft" style={{ marginTop: space.md }}>
          <Text style={[font.small, { color: c.primaryStrong }]}>
            No upcoming reminders. When a chat you open mentions something you need to do by a time or day, it shows up
            here and you get a notification before it’s due.
          </Text>
        </Card>
      ) : (
        items.map((r) => (
          <Card key={r.id} style={{ marginTop: space.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[font.bodyStrong, { color: c.text }]} numberOfLines={2}>
                  {r.task}
                </Text>
                <Text style={[font.small, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
                  {r.chat} · due {dueText(r)}
                </Text>
                <Text style={[font.smallStrong, { color: r.notified ? c.warning : c.primaryStrong, marginTop: space.xs }]}>
                  {r.notified ? '⏰ Reminded' : `⏰ Reminds ${dayLabel(r.remindAtMs).toLowerCase()} ${timeLabel(r.remindAtMs)}`}
                </Text>
              </View>
              <IconButton icon="check" label={`Mark “${r.task}” done`} color={c.success} bg={c.successSoft} onPress={() => done(r.id)} />
              <IconButton icon="trash-can-outline" label={`Delete “${r.task}”`} color={c.textMuted} bg={c.surfaceAlt} onPress={() => remove(r.id)} />
            </View>
          </Card>
        ))
      )}
    </>
  );
}

function Hint({ icon, text, action, onPress }: { icon: any; text: string; action: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.hint, { backgroundColor: c.warningSoft }]}>
      <MaterialCommunityIcons name={icon} size={18} color={c.warning} />
      <Text style={[font.small, { color: c.text, flex: 1, marginHorizontal: space.sm }]}>{text}</Text>
      <Text style={[font.smallStrong, { color: c.primaryStrong }]} onPress={onPress} accessibilityRole="button">
        {action}
      </Text>
    </View>
  );
}

function IconButton({ icon, label, color, bg, onPress }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  hint: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, padding: space.md, borderRadius: radius.md },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm },
});
