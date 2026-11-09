/**
 * Pure part of ⏰ deadline detection (no native imports, so the Node eval can run it):
 * the LLM extraction call, due-date parsing and the per-message key.
 */

import type { ChatBubble } from '../../types/context';
import { asString, callLlmJson } from '../llm/llmClient';
import { buildChatPayload, toLlmMessages, toTaggedMessages } from '../llm/chatPayload';
import { COMMITMENTS_SYSTEM_PROMPT } from '../llm/prompts';

export interface ExtractedCommitment {
  id: number;
  kind: 'task' | 'event';
  owedBy: 'user' | 'contact' | 'both';
  task: string;
  dueAtMs: number;
  dueHasTime: boolean;
  confidence: 'high' | 'low';
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day as yyyy-MM-dd (same format as ChatBubble.sentDate). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-09T18:00" → local timestamp with time; "2026-11-16" → local midnight, date-only. */
export function parseDue(due: string): { dueAtMs: number; dueHasTime: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(due.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 0, mi ? Number(mi) : 0);
  if (Number.isNaN(date.getTime())) return null;
  return { dueAtMs: date.getTime(), dueHasTime: h !== undefined };
}

/** Stable identity of a chat message, used to analyse each message at most once. */
export function messageKey(chat: string, b: ChatBubble): string {
  return [chat, b.isSelf ? 'u' : 'c', b.sentDate ?? '', b.sentTime ?? '', b.text.trim().slice(0, 140)].join('|');
}

/** Sends the candidates to the LLM and returns the parsed commitments (all owners; caller filters). */
export async function extractCommitments(
  buffer: ChatBubble[],
  chat: string,
  candidates: ChatBubble[],
  now: Date = new Date(),
): Promise<ExtractedCommitment[]> {
  const tagged = candidates.map((b) => toTaggedMessages([b], now)[0]).filter(Boolean);
  const payload = {
    ...buildChatPayload(buffer, chat, { window: 20, now }),
    candidates: tagged.map((m, id) => ({ id, sender: m.sender, text: m.text, sent: m.sent ?? 'date unknown' })),
  };
  return callLlmJson(
    toLlmMessages(COMMITMENTS_SYSTEM_PROMPT, payload),
    (obj) => {
      const items = Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : [];
      return items
        .map((it): ExtractedCommitment | null => {
          const due = parseDue(asString(it.due));
          const task = asString(it.task).slice(0, 80);
          const id = typeof it.id === 'number' ? it.id : Number(it.id);
          if (!due || !task || !Number.isInteger(id) || id < 0 || id >= tagged.length) return null;
          const owed = asString(it.owed_by);
          return {
            id,
            kind: asString(it.kind) === 'event' ? 'event' : 'task',
            owedBy: owed === 'user' || owed === 'both' ? owed : 'contact',
            task,
            ...due,
            confidence: asString(it.confidence) === 'high' ? 'high' : 'low',
          };
        })
        .filter((x): x is ExtractedCommitment => x !== null);
    },
    { temperature: 0.1, maxTokens: 500, thinking: 'low' },
  );
}
