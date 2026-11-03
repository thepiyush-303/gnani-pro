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
}

export interface ChatPayload {
  /** Display name parsed from the chat header. Context only — never used for relationship mapping. */
  contact_name: string | null;
  /** Oldest → newest, strictly role-tagged. */
  conversation: ChatMessage[];
  /** Present only for draft-based features (Improve Text, Tone Guard, Fact Check). */
  draft?: string;
}

/** Number of attributed messages sent to the LLM. */
export const HISTORY_WINDOW = 15;

/** Bubbles whose sender could not be resolved are dropped, never guessed. */
export function toTaggedMessages(bubbles: ChatBubble[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const b of bubbles) {
    if (b.isSelf !== true && b.isSelf !== false) continue;
    const text = sanitizeText(b.text).sanitized.trim();
    if (!text) continue;
    out.push({ sender: b.isSelf ? 'user' : 'contact', text });
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
  opts: { draft?: string; window?: number } = {},
): ChatPayload {
  const payload: ChatPayload = {
    contact_name: cleanContactName(contactTitle),
    conversation: toTaggedMessages(bubbles).slice(-(opts.window ?? HISTORY_WINDOW)),
  };
  if (opts.draft !== undefined) payload.draft = sanitizeText(opts.draft).sanitized.trim();
  return payload;
}

export function toLlmMessages(systemPrompt: string, payload: ChatPayload): LlmMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}
