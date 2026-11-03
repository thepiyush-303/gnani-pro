/**
 * IndicContext Assistant — Draft guards & thread summary (Gnani Evon)
 *
 * Tone Guard, Fact Check and Catch-Up Summary. Like Smart Replies / Improve
 * Text (see aiFeatures.ts), every call uses the role-tagged payload and the
 * shared client; there are no persona inputs and no local heuristic
 * fallbacks — failures throw `LlmError`.
 */

import type {
  ChatBubble,
  FactCheckResult,
  FactConflictItem,
  ThreadSummaryResult,
  ToneSensitivityResult,
} from '../types/context';
import { asString, asStringArray, callLlmJson } from './llm/llmClient';
import { buildChatPayload, toLlmMessages } from './llm/chatPayload';
import { FACT_CHECK_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT, TONE_GUARD_SYSTEM_PROMPT } from './llm/prompts';

export { getLlmInfo } from './llm/llmClient';

const SEVERITIES = ['none', 'low', 'medium', 'high'] as const;

// ─── Tone Guard ──────────────────────────────────────────────────────────────

export async function checkToneSensitivity(
  draft: string,
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
): Promise<ToneSensitivityResult> {
  const payload = buildChatPayload(bubbles, contactTitle, { draft });

  return callLlmJson(
    toLlmMessages(TONE_GUARD_SYSTEM_PROMPT, payload),
    (obj) => {
      const isDisrespectful = obj.isDisrespectful === true;
      const sev = asString(obj.severity) as (typeof SEVERITIES)[number];
      return {
        isDisrespectful,
        severity: SEVERITIES.includes(sev) ? sev : isDisrespectful ? 'medium' : 'none',
        toneDetected: asString(obj.toneDetected, 'unknown'),
        reasons: asStringArray(obj.reasons),
        suggestedDraft: asString(obj.suggestedDraft) || draft,
        originalDraft: draft,
      };
    },
    { temperature: 0.2, thinking: 'low' },
  );
}

// ─── Catch-Up Summary ────────────────────────────────────────────────────────

export async function summarizeThread(
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
): Promise<ThreadSummaryResult> {
  // Summaries use the whole buffer, not just the reply window.
  const payload = buildChatPayload(bubbles, contactTitle, { window: bubbles.length });
  if (payload.conversation.length === 0) {
    return { brief: 'No attributed messages captured yet.', keyPoints: [], directAsks: [], actionItems: [], messageCount: 0 };
  }

  return callLlmJson(
    toLlmMessages(SUMMARY_SYSTEM_PROMPT, payload),
    (obj) => {
      const brief = asString(obj.brief);
      if (!brief) throw new Error('"brief" missing');
      return {
        brief,
        keyPoints: asStringArray(obj.keyPoints),
        directAsks: asStringArray(obj.directAsks),
        actionItems: asStringArray(obj.actionItems),
        messageCount: payload.conversation.length,
      };
    },
    { temperature: 0.3, maxTokens: 512 },
  );
}

// ─── Fact & Inconsistency Guard ──────────────────────────────────────────────

export async function checkFactsAndInconsistencies(
  draft: string,
  bubbles: ChatBubble[],
  contactTitle: string | null | undefined,
): Promise<FactCheckResult> {
  const payload = buildChatPayload(bubbles, contactTitle, { draft, window: 20 });

  return callLlmJson(
    toLlmMessages(FACT_CHECK_SYSTEM_PROMPT, payload),
    (obj) => {
      const inconsistencies: FactConflictItem[] = Array.isArray(obj.inconsistencies)
        ? (obj.inconsistencies as Record<string, unknown>[])
            .filter((i) => i && typeof i === 'object')
            .map((i) => ({
              statement: asString(i.statement),
              earlierStatement: asString(i.earlierStatement),
              explanation: asString(i.explanation),
            }))
            .filter((i) => i.explanation)
        : [];
      const hasConflict = obj.hasConflict === true || inconsistencies.length > 0;
      return {
        hasConflict,
        flagged: hasConflict,
        inconsistencies,
        claims: [],
        suggestedCorrection: asString(obj.suggestedCorrection) || draft,
      };
    },
    { temperature: 0.1, thinking: 'low' },
  );
}
