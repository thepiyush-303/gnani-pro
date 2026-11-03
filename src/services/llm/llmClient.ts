/**
 * LLM client — the single HTTP entry point for every AI feature.
 *
 * Providers (chosen by EXPO_PUBLIC_LLM_PROVIDER, default "gemini"):
 *  - gemini: Google Gemini API `generateContent` (native JSON mode). Default model
 *            gemini-3.5-flash-lite (free tier).
 *  - evon:   OpenAI-compatible /chat/completions (Gnani Evon / any compatible gateway).
 *
 * - One shared time budget per call (across endpoints and retries).
 * - Typed `LlmError`s instead of silent catches, so callers can show a retry
 *   card and logs say exactly why a call failed.
 * - `callLlmJson` extracts + validates the JSON object the prompts ask for.
 */

const TAG = '[IndicLLM]';

// NOTE: Expo only inlines EXPO_PUBLIC_* vars when read as literal `process.env.X` member accesses.
function clean(v: string | undefined): string | undefined {
  return v && v.trim() ? v.trim() : undefined;
}

export type LlmProvider = 'gemini' | 'evon';

const PROVIDER: LlmProvider = clean(process.env.EXPO_PUBLIC_LLM_PROVIDER)?.toLowerCase() === 'evon' ? 'evon' : 'gemini';

// ── Gemini ──
const GEMINI_API_KEY = clean(process.env.EXPO_PUBLIC_GEMINI_API_KEY);
const GEMINI_MODEL = clean(process.env.EXPO_PUBLIC_GEMINI_MODEL) ?? 'gemini-3.5-flash-lite';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── Evon (OpenAI-compatible) ──
const GNANI_DEFAULT_KEY =
  'vach_1ytE2CY5X2DI7nYe19xQ41pIcF75XgUXXFdRLhu4vuhN2qVlIHYqHNjYbqSZW3pAeBxWsMlcCQBgNUyg9O3hxFQoYUUpobcD_3d238769888eacc65a24109ee5f6fe78';
/**
 * Guessed Gnani endpoints. As of 2026-11 none serve chat completions for the
 * project key (vachana → 403 SCOPE_NOT_ALLOWED, inya → 404, gnani.ai → DNS).
 * Set EXPO_PUBLIC_EVON_ENDPOINT to override.
 */
const EVON_LEGACY_ENDPOINTS = [
  'https://api.vachana.ai/v1/chat/completions',
  'https://api.inya.ai/platform/v1/chat/completions',
  'https://api.gnani.ai/v1/chat/completions',
];
const EVON_ENDPOINT = clean(process.env.EXPO_PUBLIC_EVON_ENDPOINT);
const EVON_ENDPOINTS = EVON_ENDPOINT ? [EVON_ENDPOINT] : EVON_LEGACY_ENDPOINTS;
const EVON_MODEL = clean(process.env.EXPO_PUBLIC_EVON_MODEL) ?? 'evon-3.3';
const EVON_API_KEY =
  clean(process.env.EXPO_PUBLIC_EVON_API_KEY) ?? clean(process.env.EXPO_PUBLIC_GNANI_API_KEY) ?? GNANI_DEFAULT_KEY;

/** Gnani speech (Prisma STT) key — kept separate so an LLM key never reaches STT. */
export function getGnaniSttKey(): string {
  return clean(process.env.EXPO_PUBLIC_GNANI_API_KEY) ?? GNANI_DEFAULT_KEY;
}

/** For diagnostics / dashboard display. */
export function getLlmInfo(): { provider: LlmProvider; model: string } {
  return PROVIDER === 'gemini'
    ? { provider: 'gemini', model: GEMINI_MODEL }
    : { provider: 'evon', model: EVON_MODEL };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type LlmErrorKind = 'config' | 'timeout' | 'http' | 'network' | 'empty' | 'blocked' | 'parse';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly endpoint?: string;

  constructor(kind: LlmErrorKind, message: string, opts: { status?: number; endpoint?: string } = {}) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = opts.status;
    this.endpoint = opts.endpoint;
  }
}

export function isLlmError(e: unknown): e is LlmError {
  return e instanceof LlmError;
}

/** Short, user-facing explanation for an overlay error card. */
export function describeLlmError(e: unknown): string {
  if (!isLlmError(e)) return 'Something went wrong. Tap Retry.';
  switch (e.kind) {
    case 'config':
      return `AI is not configured: ${e.message}`;
    case 'timeout':
      return 'The AI took too long to respond. Tap Retry.';
    case 'network':
      return "Couldn't reach the AI service. Check your connection and tap Retry.";
    case 'http':
      if (e.status === 429) return 'Free-tier rate limit reached. Wait a few seconds and tap Retry.';
      return `AI service error${e.status ? ` (HTTP ${e.status})` : ''}. Tap Retry.`;
    case 'blocked':
      return 'The AI declined to answer for this chat. Try rephrasing.';
    case 'empty':
    case 'parse':
      return 'The AI returned an unusable answer. Tap Retry.';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  /** Total budget for the call (all endpoints/retries), in ms. */
  budgetMs?: number;
  /** Ask the provider for a JSON-only response when it supports it. */
  json?: boolean;
  /** Gemini thinking level (ignored by evon). Default "minimal" for lowest latency. */
  thinking?: 'minimal' | 'low' | 'medium' | 'high';
}

const DEFAULT_BUDGET_MS = 15000;
const MIN_ATTEMPT_MS = 1500;

export async function callLlm(messages: LlmMessage[], opts: CallOptions = {}): Promise<string> {
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  return PROVIDER === 'gemini' ? callGemini(messages, opts, deadline) : callEvon(messages, opts, deadline);
}

/**
 * Calls the LLM and returns the parsed JSON object.
 * `validate` must return the typed value or throw; any failure becomes `LlmError('parse')`.
 */
export async function callLlmJson<T>(
  messages: LlmMessage[],
  validate: (obj: Record<string, unknown>) => T,
  opts: CallOptions = {},
): Promise<T> {
  const raw = await callLlm(messages, { ...opts, json: true });
  try {
    const obj = extractJsonObject(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Completion is not a JSON object');
    return validate(obj as Record<string, unknown>);
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.warn(`${TAG} parse failure: ${msg}. Raw: ${raw.slice(0, 300)}`);
    throw new LlmError('parse', msg);
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  deadline: number,
  label: string,
): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining < MIN_ATTEMPT_MS) throw new LlmError('timeout', 'LLM time budget exhausted', { endpoint: label });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`${TAG} HTTP ${res.status} from ${label}: ${text.slice(0, 200)}`);
      throw new LlmError('http', `HTTP ${res.status}`, { status: res.status, endpoint: label });
    }
    const data = await res.json();
    console.log(`${TAG} ok ${label} in ${Date.now() - startedAt}ms`);
    return data;
  } catch (e: unknown) {
    if (isLlmError(e)) throw e;
    const aborted = (e as { name?: string })?.name === 'AbortError';
    const msg = (e as { message?: string })?.message ?? String(e);
    console.warn(`${TAG} ${aborted ? 'timeout' : 'network error'} at ${label} after ${Date.now() - startedAt}ms: ${msg}`);
    throw new LlmError(aborted ? 'timeout' : 'network', msg, { endpoint: label });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Gemini provider ─────────────────────────────────────────────────────────

/** Affectionate abuse/banter is common in the chats we handle; only block clearly severe content. */
const GEMINI_SAFETY = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

async function callGemini(messages: LlmMessage[], opts: CallOptions, deadline: number): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new LlmError('config', 'EXPO_PUBLIC_GEMINI_API_KEY is not set');
  }

  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.5,
      maxOutputTokens: opts.maxTokens ?? 1024,
      thinkingConfig: { thinkingLevel: opts.thinking ?? 'minimal' },
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
    safetySettings: GEMINI_SAFETY,
  };
  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const label = `gemini/${GEMINI_MODEL}`;

  let data: GeminiResponse;
  try {
    data = (await postJson(url, { 'x-goog-api-key': GEMINI_API_KEY }, body, deadline, label)) as GeminiResponse;
  } catch (e) {
    // One retry for transient free-tier throttling / overload, if budget allows.
    if (isLlmError(e) && e.kind === 'http' && (e.status === 429 || e.status === 503) && deadline - Date.now() > 4000) {
      await sleep(1500);
      data = (await postJson(url, { 'x-goog-api-key': GEMINI_API_KEY }, body, deadline, label)) as GeminiResponse;
    } else {
      throw e;
    }
  }

  if (data.promptFeedback?.blockReason) {
    throw new LlmError('blocked', `Prompt blocked: ${data.promptFeedback.blockReason}`, { endpoint: label });
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) {
    const reason = cand?.finishReason ?? 'unknown';
    console.warn(`${TAG} empty Gemini completion (finishReason=${reason})`);
    throw new LlmError(reason === 'SAFETY' ? 'blocked' : 'empty', `No text (finishReason=${reason})`, { endpoint: label });
  }
  return text;
}

// ─── Evon / OpenAI-compatible provider ───────────────────────────────────────

async function callEvon(messages: LlmMessage[], opts: CallOptions, deadline: number): Promise<string> {
  let lastError: LlmError | null = null;

  for (const endpoint of EVON_ENDPOINTS) {
    try {
      const data = (await postJson(
        endpoint,
        { 'x-api-key': EVON_API_KEY, 'X-API-Key-ID': EVON_API_KEY, Authorization: `Bearer ${EVON_API_KEY}` },
        { model: EVON_MODEL, messages, temperature: opts.temperature ?? 0.5, max_tokens: opts.maxTokens ?? 400 },
        deadline,
        endpoint,
      )) as { choices?: Array<{ message?: { content?: string } }>; result?: string; text?: string };
      const content = data?.choices?.[0]?.message?.content ?? data?.result ?? data?.text ?? '';
      if (typeof content === 'string' && content.trim()) return content.trim();
      lastError = new LlmError('empty', 'Empty completion', { endpoint });
    } catch (e) {
      if (!isLlmError(e)) throw e;
      lastError = e;
      if (e.kind === 'timeout' && deadline - Date.now() < MIN_ATTEMPT_MS) break;
    }
  }

  throw lastError ?? new LlmError('timeout', 'LLM time budget exhausted');
}

// ─── JSON extraction & validation helpers ────────────────────────────────────

/** Pulls the first top-level JSON object out of a completion (handles ``` fences and chatter). */
export function extractJsonObject(raw: string): unknown {
  const unfenced = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // fall through to brace scan
  }
  const start = unfenced.indexOf('{');
  if (start === -1) throw new Error('No JSON object in completion');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(unfenced.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON object in completion');
}

export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];
}
