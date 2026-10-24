/**
 * IndicContext Assistant — Gnani Evon LLM Service
 *
 * Provides context-aware intelligence using Gnani Evon (v3.3 / Artha stack)
 * with on-device PII masking and resilient local fallback heuristics.
 */

import {
  ChatBubble,
  EnhancedUpdateResult,
  FactCheckResult,
  GlobalUserPersona,
  IcebreakerResult,
  ListenerContext,
  TemperatureLevel,
  ThreadSummaryResult,
  ToneOption,
  ToneSensitivityResult,
} from '../types/context';
import { sanitizeBubbles, sanitizeText } from '../utils/sanitizer';

// ─── API Configuration ───────────────────────────────────────────────────────

export const GNANI_API_KEY_DEFAULT =
  'vach_1ytE2CY5X2DI7nYe19xQ41pIcF75XgUXXFdRLhu4vuhN2qVlIHYqHNjYbqSZW3pAeBxWsMlcCQBgNUyg9O3hxFQoYUUpobcD_3d238769888eacc65a24109ee5f6fe78';

let configuredApiKey = GNANI_API_KEY_DEFAULT;

export function setEvonApiKey(key: string) {
  if (key && key.trim()) {
    configuredApiKey = key.trim();
  }
}

export function getEvonApiKey(): string {
  return configuredApiKey;
}

// Primary & fallback endpoints for Gnani LLM gateway
const EVON_ENDPOINTS = [
  'https://api.vachana.ai/v1/chat/completions',
  'https://api.inya.ai/platform/v1/chat/completions',
  'https://api.gnani.ai/v1/chat/completions',
];

// ─── HTTP Dispatcher with Retry & Fallback ───────────────────────────────────

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callEvonLlm(
  messages: LlmMessage[],
  temperature: number = 0.3,
  timeoutMs: number = 6000,
): Promise<string> {
  const cleanKey = configuredApiKey.trim();

  for (const endpoint of EVON_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cleanKey,
          'X-API-Key-ID': cleanKey,
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: 'evon-3.3',
          messages,
          temperature,
          max_tokens: 512,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content =
          data?.choices?.[0]?.message?.content ||
          data?.result ||
          data?.text ||
          '';
        if (content.trim()) return content.trim();
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  throw new Error('Evon LLM API currently unreachable');
}

// ─── 1. Listener-Aware Disrespect & Tone Guard ──────────────────────────────

export async function checkToneSensitivity(
  draft: string,
  listener: ListenerContext,
  buffer: ChatBubble[] = [],
  globalPersona?: GlobalUserPersona,
): Promise<ToneSensitivityResult> {
  const sanitizedDraft = sanitizeText(draft).sanitized;
  const safeBubbles = sanitizeBubbles(buffer.slice(-10));

  const promptContext = safeBubbles
    .map((b) => `${b.isSelf ? 'User' : listener.threadTitle}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are an Indic cultural tone and respect analyzer.
The user is drafting a message to a "${listener.persona}" (Hierarchy formality: ${listener.formalityLevel}/5).
Honorifics required: ${listener.honorificRequired ? 'Yes (use Ji, Sir, Aap, etc.)' : 'No'}.
Analyze if the draft sounds disrespectful, blunt, arrogant, rude, or overly casual for this listener.
Respond ONLY in valid JSON format:
{
  "isDisrespectful": boolean,
  "severity": "none" | "low" | "medium" | "high",
  "toneDetected": string,
  "reasons": string[],
  "suggestedDraft": string
}`;

  const userPrompt = `Conversation History:\n${promptContext}\n\nDraft: "${sanitizedDraft}"`;

  try {
    const raw = await callEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      0.2,
      4000,
    );
    const parsed = JSON.parse(raw);
    return {
      isDisrespectful: Boolean(parsed.isDisrespectful),
      severity: parsed.severity || (parsed.isDisrespectful ? 'medium' : 'none'),
      toneDetected: parsed.toneDetected || 'Casual',
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      suggestedDraft: parsed.suggestedDraft || draft,
      originalDraft: draft,
    };
  } catch {
    // ── Resilient Local Heuristic Fallback ──
    return evaluateToneLocally(draft, listener, globalPersona);
  }
}

function evaluateToneLocally(
  draft: string,
  listener: ListenerContext,
  globalPersona?: GlobalUserPersona,
): ToneSensitivityResult {
  const lower = draft.toLowerCase().trim();
  const reasons: string[] = [];
  let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
  let suggested = draft;

  const isSenior = listener.persona === 'Boss' || listener.persona === 'Elder';

  // Check 1: Informal Hindi pronoun 'tu' used with seniors
  if (isSenior && /\b(tu|tera|teri|tere)\b/i.test(lower)) {
    reasons.push(`Used informal pronoun "tu/tera" with a ${listener.persona}. Use "Aap" or "Aapka".`);
    severity = 'high';
    suggested = suggested
      .replace(/\btu\b/gi, 'aap')
      .replace(/\btera\b/gi, 'aapka')
      .replace(/\bteri\b/gi, 'aapki')
      .replace(/\btere\b/gi, 'aapke');
  }

  // Check 2: Abrupt imperative commands (e.g., "send it now", "do this", "reply fast")
  const abruptPatterns = [
    { regex: /\b(send it now|do this now|reply fast|give it to me)\b/i, fix: 'Could you please share this when convenient?' },
    { regex: /\b(karo abhi|jaldi bhej|bhejo abhi)\b/i, fix: 'Kripya samay milte hi bhej dijiye.' },
    { regex: /\b(why didn't you|why haven't you)\b/i, fix: 'Just wanted to check in regarding the status.' },
  ];

  for (const pattern of abruptPatterns) {
    if (pattern.regex.test(lower)) {
      if (isSenior || listener.formalityLevel >= 4) {
        reasons.push('Phrasing sounds abrupt or demanding for a senior/client.');
        severity = severity === 'high' ? 'high' : 'medium';
        suggested = pattern.fix;
      }
    }
  }

  // Check 3: Missing honorific for Elder/Boss when greeting
  if (isSenior && /^(hi|hey|hello)\b/i.test(lower) && !/(sir|ma'am|ji)\b/i.test(lower)) {
    reasons.push(`Greeting does not include an honorific ("Sir", "Ji") for ${listener.persona}.`);
    if (severity === 'none') severity = 'low';
    const honorific = listener.persona === 'Boss' ? 'Sir' : 'Ji';
    suggested = suggested.replace(/^(hi|hey|hello)\b/i, `Hello ${honorific},`);
  }

  return {
    isDisrespectful: reasons.length > 0,
    severity,
    toneDetected: reasons.length > 0 ? 'Abrupt / Overly Casual' : 'Polite',
    reasons,
    suggestedDraft: suggested,
    originalDraft: draft,
  };
}

// ─── 2. Thread Catch-Up Summarizer ──────────────────────────────────────────

export async function summarizeThread(
  buffer: ChatBubble[],
  listener?: ListenerContext,
): Promise<ThreadSummaryResult> {
  const safeBubbles = sanitizeBubbles(buffer);
  if (safeBubbles.length === 0) {
    return {
      brief: 'No messages in the current conversation buffer.',
      keyPoints: [],
      directAsks: [],
      actionItems: [],
      messageCount: 0,
    };
  }

  const threadTitle = listener?.threadTitle || 'Contact';
  const chatTranscript = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : threadTitle}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are a chat summarization assistant for Indian professional and personal messaging.
Given the chat history, produce a clear, concise catch-up summary.
Respond ONLY in valid JSON:
{
  "brief": "1-2 sentence overall summary",
  "keyPoints": ["bullet 1", "bullet 2"],
  "directAsks": ["questions or items the other person explicitly asked the user"],
  "actionItems": ["commitments or tasks pending from either side"]
}`;

  try {
    const raw = await callEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Chat:\n${chatTranscript}` },
      ],
      0.3,
      5000,
    );
    const parsed = JSON.parse(raw);
    return {
      brief: parsed.brief || 'Recent conversation summary.',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      directAsks: Array.isArray(parsed.directAsks) ? parsed.directAsks : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      messageCount: safeBubbles.length,
    };
  } catch {
    // ── Local Fallback Summary ──
    return summarizeLocally(safeBubbles, threadTitle);
  }
}

function summarizeLocally(bubbles: ChatBubble[], contactTitle: string): ThreadSummaryResult {
  const keyPoints: string[] = [];
  const directAsks: string[] = [];
  const actionItems: string[] = [];

  for (const b of bubbles) {
    const t = b.text.trim();
    // Questions directed at user
    if (!b.isSelf && t.endsWith('?')) {
      directAsks.push(`${contactTitle} asked: "${t}"`);
    }
    // Action markers
    if (/\b(will|shall|by|deadline|tomorrow|meeting|send|update|call)\b/i.test(t)) {
      actionItems.push(t);
    }
  }

  const lastFew = bubbles.slice(-3).map((b) => `"${b.text}"`).join(', ');
  const brief = `Recent conversation with ${contactTitle} discussing: ${lastFew.slice(0, 120)}...`;

  return {
    brief,
    keyPoints: bubbles.slice(-4).map((b) => `${b.isSelf ? 'You' : contactTitle}: ${b.text}`),
    directAsks: directAsks.slice(-3),
    actionItems: actionItems.slice(-3),
    messageCount: bubbles.length,
  };
}

// ─── 3. Contextual Update Enhancer ──────────────────────────────────────────

export async function enhanceUpdateWithContext(
  draft: string,
  buffer: ChatBubble[],
  tone: ToneOption = 'polite',
  temperatureLevel: TemperatureLevel = 3,
  listener?: ListenerContext,
): Promise<EnhancedUpdateResult> {
  const sanitizedDraft = sanitizeText(draft).sanitized;
  const safeBubbles = sanitizeBubbles(buffer.slice(-12));

  const contactName = listener?.threadTitle || 'the contact';
  const historyText = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : contactName}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are an expert Indic writing assistant.
The user has written a draft message or update: "${sanitizedDraft}".
Rewrite and enhance this update so it naturally references the recent conversation context (tasks, milestones, topics discussed).
Tone requirement: "${tone}".
Expansion level: ${temperatureLevel} out of 5 (1 = minimal expansion, 5 = detailed professional breakdown).
Respond ONLY in valid JSON:
{
  "enhancedDraft": "The rewritten message",
  "contextReferences": ["file/task/topic referenced from buffer"]
}`;

  try {
    const raw = await callEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation Context:\n${historyText}\n\nDraft: "${sanitizedDraft}"` },
      ],
      0.35,
      4500,
    );
    const parsed = JSON.parse(raw);
    return {
      enhancedDraft: parsed.enhancedDraft || draft,
      toneUsed: tone,
      contextReferences: Array.isArray(parsed.contextReferences) ? parsed.contextReferences : [],
    };
  } catch {
    // ── Local Fallback Enhancement ──
    return enhanceLocally(draft, safeBubbles, tone);
  }
}

function enhanceLocally(draft: string, bubbles: ChatBubble[], tone: ToneOption): EnhancedUpdateResult {
  const lastContactMsg = [...bubbles].reverse().find((b) => !b.isSelf);
  let enhanced = draft;
  const references: string[] = [];

  if (lastContactMsg) {
    const topic = lastContactMsg.text.slice(0, 30).trim();
    references.push(topic);

    if (/^(done|ho gaya|completed|yes)\b/i.test(draft.trim())) {
      if (tone === 'respectful' || tone === 'polite') {
        enhanced = `Yes, this is completed. I have taken care of the update regarding "${topic}".`;
      } else {
        enhanced = `Done! All set regarding "${topic}".`;
      }
    } else if (/^(wait|later|thodi der mein|busy)\b/i.test(draft.trim())) {
      enhanced = `Currently reviewing "${topic}", will share the full update shortly.`;
    } else {
      enhanced = `${draft}. (Following up on: ${topic})`;
    }
  }

  return {
    enhancedDraft: enhanced,
    toneUsed: tone,
    contextReferences: references,
  };
}

// ─── 4. Fact & Inconsistency Guard ──────────────────────────────────────────

export async function checkFactsAndInconsistencies(
  draft: string,
  buffer: ChatBubble[],
): Promise<FactCheckResult> {
  const sanitizedDraft = sanitizeText(draft).sanitized;
  const safeBubbles = sanitizeBubbles(buffer.slice(-15));

  const history = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : 'Other'}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are a factual consistency checker for messaging apps.
Compare the user's drafted message against earlier statements in the conversation.
Check for:
1. Time/date contradictions (e.g. agreed to meet at 4 PM, but draft says 2 PM).
2. Number, price, or quantity discrepancies.
3. Logical inconsistencies with prior statements.
Respond ONLY in valid JSON:
{
  "hasConflict": boolean,
  "inconsistencies": [
    {
      "statement": "draft statement",
      "earlierStatement": "conflicting buffer statement",
      "explanation": "why they conflict"
    }
  ],
  "claims": [
    {
      "claim": "assertion",
      "isAccurate": boolean,
      "explanation": "explanation"
    }
  ],
  "suggestedCorrection": "corrected draft"
}`;

  try {
    const raw = await callEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `History:\n${history}\n\nDraft: "${sanitizedDraft}"` },
      ],
      0.1,
      4000,
    );
    const parsed = JSON.parse(raw);
    const inconsistencies = Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [];
    return {
      hasConflict: Boolean(parsed.hasConflict) || inconsistencies.length > 0,
      flagged: Boolean(parsed.hasConflict) || inconsistencies.length > 0,
      inconsistencies,
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
      suggestedCorrection: parsed.suggestedCorrection || draft,
    };
  } catch {
    // ── Local Fallback Consistency Check ──
    return checkInconsistenciesLocally(draft, safeBubbles);
  }
}

function checkInconsistenciesLocally(draft: string, bubbles: ChatBubble[]): FactCheckResult {
  const timeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje))\b/gi;
  const draftTimes = draft.match(timeRegex) || [];
  const inconsistencies: FactCheckResult['inconsistencies'] = [];

  if (draftTimes.length > 0) {
    for (const b of bubbles) {
      const bufferTimes = b.text.match(timeRegex) || [];
      for (const bt of bufferTimes) {
        for (const dt of draftTimes) {
          if (bt.toLowerCase().trim() !== dt.toLowerCase().trim()) {
            inconsistencies.push({
              statement: `Draft mentions ${dt}`,
              earlierStatement: `Earlier message mentioned ${bt} ("${b.text.slice(0, 40)}")`,
              explanation: `Potential time mismatch: ${dt} vs earlier ${bt}`,
            });
          }
        }
      }
    }
  }

  const hasConflict = inconsistencies.length > 0;
  return {
    hasConflict,
    flagged: hasConflict,
    inconsistencies,
    claims: [],
    suggestedCorrection: hasConflict
      ? `${draft} (Note: double-check the time mentioned earlier)`
      : draft,
  };
}

// ─── 5. Context-Driven Icebreakers ──────────────────────────────────────────

export async function generateIcebreakers(
  buffer: ChatBubble[],
  listener?: ListenerContext,
  globalPersona?: GlobalUserPersona,
): Promise<IcebreakerResult> {
  const safeBubbles = sanitizeBubbles(buffer.slice(-10));
  const contactTitle = listener?.threadTitle || 'Contact';
  const persona = listener?.persona || 'Colleague';

  const history = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : contactTitle}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are a conversational icebreaker generator for Indian users.
Generate 3 distinct, culturally authentic, and engaging opening lines to send to ${contactTitle} (${persona}).
If there is conversation history, follow up warmly on topics discussed.
If there is little/no history, create an appropriate conversation starter.
Respond ONLY in valid JSON:
{
  "suggestions": ["Option 1", "Option 2", "Option 3"],
  "category": "followup" | "conversation_starter" | "reconnect"
}`;

  try {
    const raw = await callEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `History:\n${history}` },
      ],
      0.6,
      4000,
    );
    const parsed = JSON.parse(raw);
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    if (suggestions.length > 0) {
      return {
        suggestions: suggestions.slice(0, 3),
        category: parsed.category || 'followup',
      };
    }
  } catch {
    // Proceed to local fallback
  }

  // ── Local Fallback Icebreakers ──
  return generateIcebreakersLocally(safeBubbles, listener);
}

function generateIcebreakersLocally(
  bubbles: ChatBubble[],
  listener?: ListenerContext,
): IcebreakerResult {
  const title = listener?.threadTitle || 'there';
  const persona = listener?.persona || 'Colleague';

  if (bubbles.length > 0) {
    const lastMsg = bubbles[bubbles.length - 1].text.slice(0, 35);
    return {
      category: 'followup',
      suggestions: [
        `Hey ${title}, following up on our discussion about "${lastMsg}"!`,
        `Hi ${title}, just wanted to check in and see how everything is progressing.`,
        `Hello ${title}, let me know if you need any assistance on the discussed points.`,
      ],
    };
  }

  // Cold starter based on persona
  if (persona === 'Boss' || persona === 'Client') {
    return {
      category: 'conversation_starter',
      suggestions: [
        `Good day ${title}, hope you're having a productive week.`,
        `Hello ${title}, just checking in to see if there's anything you'd like me to prioritize today.`,
        `Hi ${title}, sharing a quick check-in regarding our ongoing milestones.`,
      ],
    };
  }

  if (persona === 'Elder') {
    return {
      category: 'reconnect',
      suggestions: [
        `Pranam / Hello ${title}, kaisa chal raha hai sab? Hope you are doing well.`,
        `Hello ${title}, just thought of calling or checking in on you!`,
        `Namaste ${title}, hope you're having a wonderful day.`,
      ],
    };
  }

  // Friend / Colleague
  return {
    category: 'conversation_starter',
    suggestions: [
      `Hey ${title}! What's the latest update?`,
      `Arre ${title}, hope you're having a good week! Free for a quick sync?`,
      `Hi ${title}, wanted to quickly catch up with you whenever you have a moment.`,
    ],
  };
}
