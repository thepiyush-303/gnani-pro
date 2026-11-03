/**
 * IndicContext Assistant — Smart Replies & Improve Text
 *
 * Both features send the role-tagged conversation (see llm/chatPayload.ts)
 * to the LLM and let it infer relationship, tone and language. There are no
 * persona buckets and no template fallbacks: failures throw `LlmError` so the
 * UI can show a retry card instead of canned text.
 */

import type { ChatBubble, ImproveTextResult, SmartRepliesResult } from '../types/context';
import { asString, asStringArray, callLlmJson, type LlmMessage } from './llm/llmClient';
import { buildChatPayload, toLlmMessages, type ChatPayload } from './llm/chatPayload';
import { IMPROVE_TEXT_SYSTEM_PROMPT, SMART_REPLIES_SYSTEM_PROMPT } from './llm/prompts';

const EMPTY_SMART_REPLIES: SmartRepliesResult = {
  replies: [],
  followUp: '',
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

/** Everything the model was given, so numbers taken from it (incl. dates/times) are allowed. */
function sourceTextOf(payload: ChatPayload): string {
  return [
    payload.now,
    ...payload.conversation.map((m) => `${m.text} ${m.sent ?? ''}`),
    payload.draft ?? '',
  ].join('\n').toLowerCase();
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

/**
 * The model only EXTRACTS the latest promise (item, resolved due_date, done).
 * Whether it is due is decided here by comparing dates, not by the model,
 * which proved unreliable at that comparison (see docs/AI_OVERHAUL.md).
 */
export function parseFollowUp(v: unknown, todayIso: string): string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
  const o = v as Record<string, unknown>;
  if (o.done === true) return '';
  const due = asString(o.due_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due > todayIso) return ''; // no deadline / not due yet
  const note = asString(o.note);
  if (note) return note;
  const item = asString(o.item);
  return item ? `${due === todayIso ? 'Due today' : `Overdue since ${due}`}: ${item}` : '';
}

// ─── Day-word guard (Improve Text) ───────────────────────────────────────────
// "Never change the draft's time words" is not followed reliably by flash-lite
// (it "corrects" tomorrow→Sunday). Rewrites must keep the draft's day references
// (translation allowed: tomorrow↔kal) and must not add weekdays.

const DAY_WORDS: Record<string, RegExp> = {
  today: /\b(today|tonight|aaj|aj)\b|आज/i,
  tomorrow: /\b(tomorrow|tmrw|kal)\b|कल/i,
  dayAfter: /\b(day after tomorrow|parso|parson)\b|परसों/i,
};
const WEEKDAY_RE = /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar)\b/gi;

function weekdaysIn(text: string): Set<string> {
  return new Set((text.match(WEEKDAY_RE) ?? []).map((w) => w.toLowerCase()));
}

export function keepsDayWords(draft: string, option: string): boolean {
  for (const re of Object.values(DAY_WORDS)) {
    if (re.test(draft) && !re.test(option)) return false;
  }
  const draftDays = weekdaysIn(draft);
  for (const d of weekdaysIn(option)) if (!draftDays.has(d)) return false;
  return true;
}

export interface AiCallOptions {
  /** Override the current time (tests / evals). */
  now?: Date;
}

export async function generateSmartReplies(
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
  opts: AiCallOptions = {},
): Promise<SmartRepliesResult> {
  const payload = buildChatPayload(bubbles, contactTitle, { now: opts.now });
  if (payload.conversation.length === 0) return EMPTY_SMART_REPLIES;

  return callLlmJson(
    toLlmMessages(SMART_REPLIES_SYSTEM_PROMPT, payload),
    (obj) => {
      const replies = uniqueNonEmpty(guardSuggestions(asStringArray(obj.replies), payload)).slice(0, 3);
      if (replies.length === 0) throw new Error('"replies" missing, empty, or all rejected by guards');
      return {
        replies,
        followUp: parseFollowUp(obj.follow_up, payload.now.slice(0, 10)),
        tone: asString(obj.tone, 'unknown'),
        relationship: asString(obj.relationship, 'unknown'),
        language: asString(obj.language, 'unknown'),
      };
    },
    // "low" thinking: replies now reason over the timeline (what's due, what's done)
    { temperature: 0.7, maxTokens: 500, thinking: 'low' },
  );
}

// ─── Improve Text ────────────────────────────────────────────────────────────

export async function improveText(
  draft: string,
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
  opts: AiCallOptions = {},
): Promise<ImproveTextResult> {
  const trimmed = draft.trim();
  if (!trimmed) throw new Error('improveText called with an empty draft');

  const payload = buildChatPayload(bubbles, contactTitle, { draft: trimmed, now: opts.now });

  const messages = toLlmMessages(IMPROVE_TEXT_SYSTEM_PROMPT, payload);
  const config = { temperature: 0.4, maxTokens: 400, thinking: 'low' as const };

  const parse = (obj: Record<string, unknown>) => {
    const raw = [asString(obj.improved), ...asStringArray(obj.alternatives)].filter(Boolean);
    if (raw.length === 0) throw new Error('"improved" missing or empty');
    return {
      obj,
      raw,
      // Drop options that invent numbers/filler or change the draft's day words
      options: uniqueNonEmpty(guardSuggestions(raw, payload)).filter((o) => keepsDayWords(trimmed, o)),
      tone: asString(obj.tone, 'unknown'),
      relationship: asString(obj.relationship, 'unknown'),
      note: asString(obj.note),
    };
  };

  let result = await callLlmJson(messages, parse, config);

  if (result.options.length === 0) {
    // One corrective retry: tell the model exactly what it changed.
    console.warn('[IndicLLM] improve: all options rejected by guards, retrying once:', result.raw);
    const correction: LlmMessage[] = [
      ...messages,
      { role: 'assistant', content: JSON.stringify(result.obj) },
      {
        role: 'user',
        content:
          `Every option was rejected because it changed or added details the draft does not contain (${result.raw
            .map((r) => JSON.stringify(r))
            .join(', ')}). Rewrite again. Keep the draft's day/time words (e.g. "tomorrow", "kal") and numbers ` +
          'exactly as the user wrote them, even if the chat mentions something different, and mention any mismatch only in "note". Same JSON format.',
      },
    ];
    try {
      result = await callLlmJson(correction, parse, config);
    } catch (e) {
      console.warn('[IndicLLM] improve: corrective retry failed:', e);
    }
  }

  if (result.options.length === 0) {
    return {
      improved: trimmed,
      alternatives: [],
      tone: result.tone,
      relationship: result.relationship,
      note: "Couldn't improve this without changing details you wrote, so your draft is unchanged.",
      wasModified: false,
    };
  }
  const [improved, ...alternatives] = result.options;
  return {
    improved,
    alternatives: alternatives.slice(0, 2),
    tone: result.tone,
    relationship: result.relationship,
    note: improved === result.raw[0] ? result.note : 'Adjusted to avoid adding details you did not write.',
    wasModified: normKey(improved) !== normKey(trimmed),
  };
}
