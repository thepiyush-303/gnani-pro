/**
 * Role-tagged chat payload — the ONLY way conversation history reaches the LLM.
 *
 * Every bubble is tagged `user` (the person using this app) or `contact`
 * (the other party). Bubbles whose sender could not be resolved on-device are
 * dropped rather than guessed, so the model never sees misattributed lines.
 */

import type { ChatBubble } from '../../types/context';
import { sanitizeText } from '../../utils/sanitizer';
import type { LlmMessage } from './llmClient';

export type Sender = 'user' | 'contact';

export interface ChatMessage {
  sender: Sender;
  text: string;
  /**
   * When it was sent, e.g. "2026-11-02 20:56 (Mon, yesterday)". Omitted when
   * unknown; "20:56 (date unknown)" when only the time is known.
   */
  sent?: string;
}

export interface ChatPayload {
  /** The user's current local date/time, e.g. "2026-11-03 15:00 (Tue)". */
  now: string;
  /** How long ago the newest message was sent, e.g. "4 days" / "18 hours" (omitted if unknown). */
  since_last_message?: string;
  /** Display name parsed from the chat header. Context only — never used for relationship mapping. */
  contact_name: string | null;
  /** Oldest → newest, strictly role-tagged. */
  conversation: ChatMessage[];
  /** Present only for draft-based features (Improve Text, Tone Guard, Fact Check). */
  draft?: string;
}

/** Number of attributed messages sent to the LLM. */
export const HISTORY_WINDOW = 15;

// ─── Dates ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "yyyy-MM-dd" as a LOCAL calendar day. */
function parseIsoDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "today" / "yesterday" / "3 days ago" / "in the future" relative to `now`'s calendar day. */
function relativeDay(day: Date, now: Date): string {
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((startOfNow.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1) return `${diff} days ago`;
  return 'in the future';
}

export function formatNow(now: Date): string {
  return `${isoDay(now)} ${pad(now.getHours())}:${pad(now.getMinutes())} (${WEEKDAYS[now.getDay()]})`;
}

/** "45 minutes" / "18 hours" / "4 days" since the bubble was sent, or undefined if its day is unknown. */
function ageOf(b: ChatBubble, now: Date): string | undefined {
  const day = b.sentDate ? parseIsoDay(b.sentDate) : null;
  if (!day) return undefined;
  const tm = b.sentTime ? /^(\d{2}):(\d{2})$/.exec(b.sentTime) : null;
  if (tm) {
    const sent = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(tm[1]), Number(tm[2]));
    const mins = Math.max(0, Math.round((now.getTime() - sent.getTime()) / 60_000));
    if (mins < 60) return `${mins} minutes`;
    if (mins < 48 * 60) return `${Math.round(mins / 60)} hours`;
    return `${Math.round(mins / 1440)} days`;
  }
  const rel = relativeDay(day, now);
  return rel === 'today' ? 'less than a day' : rel === 'yesterday' ? '1 day' : rel.replace(' ago', '');
}

function formatSent(b: ChatBubble, now: Date): string | undefined {
  const time = b.sentTime ?? undefined;
  const day = b.sentDate ? parseIsoDay(b.sentDate) : null;
  if (day) {
    return `${b.sentDate}${time ? ` ${time}` : ''} (${WEEKDAYS[day.getDay()]}, ${relativeDay(day, now)})`;
  }
  return time ? `${time} (date unknown)` : undefined;
}

// ─── Payload ─────────────────────────────────────────────────────────────────

/** Bubbles whose sender could not be resolved are dropped, never guessed. */
export function toTaggedMessages(bubbles: ChatBubble[], now: Date = new Date()): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const b of bubbles) {
    if (b.isSelf !== true && b.isSelf !== false) continue;
    const text = sanitizeText(b.text).sanitized.trim();
    if (!text) continue;
    const msg: ChatMessage = { sender: b.isSelf ? 'user' : 'contact', text };
    const sent = formatSent(b, now);
    if (sent) msg.sent = sent;
    out.push(msg);
  }
  return out;
}

export function cleanContactName(title: string | null | undefined): string | null {
  const t = (title ?? '').replace(/[‎‏‪-‮]/g, '').trim();
  if (!t || /^(contact|whatsapp|default_thread)$/i.test(t)) return null;
  return t;
}

export function buildChatPayload(
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
  opts: { draft?: string; window?: number; now?: Date } = {},
): ChatPayload {
  const now = opts.now ?? new Date();
  const payload: ChatPayload = {
    now: formatNow(now),
    contact_name: cleanContactName(contactTitle),
    conversation: toTaggedMessages(bubbles, now).slice(-(opts.window ?? HISTORY_WINDOW)),
  };
  // Age of the newest attributed bubble (from the source bubbles, which carry the raw date/time)
  const newest = [...bubbles].reverse().find((b) => b.isSelf === true || b.isSelf === false);
  const age = newest ? ageOf(newest, now) : undefined;
  if (age) payload.since_last_message = age;
  if (opts.draft !== undefined) payload.draft = sanitizeText(opts.draft).sanitized.trim();
  return payload;
}

export function toLlmMessages(systemPrompt: string, payload: ChatPayload): LlmMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}
