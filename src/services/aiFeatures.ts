/**
 * IndicContext Assistant — Smart Replies & Improve Text
 *
 * Both features send the role-tagged conversation (see llm/chatPayload.ts)
 * to the LLM and let it infer relationship, tone and language. There are no
 * persona buckets and no template fallbacks: failures throw `LlmError` so the
 * UI can show a retry card instead of canned text.
 */

import type { ChatBubble, ImproveTextResult, SmartRepliesResult } from '../types/context';
import { asString, asStringArray, callLlmJson } from './llm/llmClient';
import { buildChatPayload, toLlmMessages, type ChatPayload } from './llm/chatPayload';
import { IMPROVE_TEXT_SYSTEM_PROMPT, SMART_REPLIES_SYSTEM_PROMPT } from './llm/prompts';

const EMPTY_SMART_REPLIES: SmartRepliesResult = {
  replies: [],
  tone: 'unknown',
  relationship: 'unknown',
  language: 'unknown',
};

/** Case/whitespace/punctuation-insensitive key used to drop duplicate suggestions. */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?'"…]+/g, ' ').trim();
}

function uniqueNonEmpty(items: string[], exclude: string[] = []): string[] {
  const seen = new Set(exclude.map(normKey));
  const out: string[] = [];
  for (const item of items) {
    const k = normKey(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

// ─── Output guards ───────────────────────────────────────────────────────────
// Small deterministic checks for the two failure modes the prompt alone doesn't
// fully prevent with flash-lite models (see docs/AI_OVERHAUL.md, verification log).

/** Address/filler words that must never be bolted on unless someone in this chat uses them. */
const FILLER_WORDS = ['bhai', 'yaar', 'bro'];

function sourceTextOf(payload: ChatPayload): string {
  return [...payload.conversation.map((m) => m.text), payload.draft ?? ''].join('\n').toLowerCase();
}

/** true if `text` contains a number (time, date, price…) that appears nowhere in the chat or draft. */
function introducesNewNumbers(text: string, source: string): boolean {
  return (text.match(/\d+/g) ?? []).some((n) => !new RegExp(`(^|\\D)${n}(\\D|$)`).test(source));
}

function stripUnusedFiller(text: string, source: string): string {
  let out = text;
  for (const w of FILLER_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(source)) continue;
    out = out.replace(new RegExp(`(^|\\s)${w}\\b`, 'gi'), '$1');
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/,([.!?])/g, '$1')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

function guardSuggestions(items: string[], payload: ChatPayload): string[] {
  const source = sourceTextOf(payload);
  return items
    .map((t) => stripUnusedFiller(t, source))
    .filter((t) => t && !introducesNewNumbers(t, source));
}

// ─── Smart Replies ───────────────────────────────────────────────────────────

export async function generateSmartReplies(
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
): Promise<SmartRepliesResult> {
  const payload = buildChatPayload(bubbles, contactTitle);
  if (payload.conversation.length === 0) return EMPTY_SMART_REPLIES;

  return callLlmJson(
    toLlmMessages(SMART_REPLIES_SYSTEM_PROMPT, payload),
    (obj) => {
      const replies = uniqueNonEmpty(guardSuggestions(asStringArray(obj.replies), payload)).slice(0, 3);
      if (replies.length === 0) throw new Error('"replies" missing, empty, or all rejected by guards');
      return {
        replies,
        tone: asString(obj.tone, 'unknown'),
        relationship: asString(obj.relationship, 'unknown'),
        language: asString(obj.language, 'unknown'),
      };
    },
    { temperature: 0.7, maxTokens: 400 },
  );
}

// ─── Improve Text ────────────────────────────────────────────────────────────

export async function improveText(
  draft: string,
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
): Promise<ImproveTextResult> {
  const trimmed = draft.trim();
  if (!trimmed) throw new Error('improveText called with an empty draft');

  const payload = buildChatPayload(bubbles, contactTitle, { draft: trimmed });

  return callLlmJson(
    toLlmMessages(IMPROVE_TEXT_SYSTEM_PROMPT, payload),
    (obj) => {
      const raw = [asString(obj.improved), ...asStringArray(obj.alternatives)].filter(Boolean);
      if (raw.length === 0) throw new Error('"improved" missing or empty');
      const options = uniqueNonEmpty(guardSuggestions(raw, payload));
      const tone = asString(obj.tone, 'unknown');
      const relationship = asString(obj.relationship, 'unknown');
      if (options.length === 0) {
        // Every rewrite guessed details (e.g. a time) that the user never wrote — keep their draft.
        return {
          improved: trimmed,
          alternatives: [],
          tone,
          relationship,
          note: "Couldn't improve this without guessing details, so your draft is unchanged.",
          wasModified: false,
        };
      }
      const [improved, ...alternatives] = options;
      return {
        improved,
        alternatives: alternatives.slice(0, 2),
        tone,
        relationship,
        note: improved === raw[0] ? asString(obj.note) : 'Adjusted to avoid adding details you did not write.',
        wasModified: normKey(improved) !== normKey(trimmed),
      };
    },
    { temperature: 0.4, maxTokens: 400, thinking: 'low' },
  );
}
