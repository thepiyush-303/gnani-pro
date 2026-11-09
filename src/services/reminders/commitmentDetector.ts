/**
 * ⏰ Deadline detection: turns chat messages into scheduled reminders.
 *
 *   buffer update → recent, dated messages with a deadline cue (on-phone regex)
 *     → claimMessages (each message analysed at most once, ever)
 *     → ONE LLM call per batch (COMMITMENTS_SYSTEM_PROMPT)
 *     → keep owed_by user/both + confidence high
 *     → addReminder (native: lead time / 9 AM rule, alarm, "⏰ Reminder set" card)
 *
 * Passive feature: failures are logged, never shown as error cards.
 */

import IndicContext from 'indic-context';
import type { ChatBubble } from '../../types/context';
import { isLlmError } from '../llm/llmClient';
import { hasDeadlineCue } from './deadlineCues';
import { type ExtractedCommitment, extractCommitments, isoDay, messageKey } from './commitments';

export { extractCommitments, messageKey, parseDue } from './commitments';

const TAG = '[Reminders]';
const DEBOUNCE_MS = 3000;
/** Only messages sent today or in the last 2 days can create reminders. */
const RECENT_DAYS = 2;

// ─── Live pipeline (called from CopilotBridge on every buffer update) ────────

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let latest: { buffer: ChatBubble[]; chat: string } | null = null;

export function onBuffer(buffer: ChatBubble[], chat: string | null | undefined): void {
  if (!chat) return;
  latest = { buffer, chat };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void processLatest();
  }, DEBOUNCE_MS);
}

async function processLatest(): Promise<void> {
  if (running || !latest) return;
  const { buffer, chat } = latest;
  latest = null;
  running = true;
  try {
    const settings = await IndicContext.getReminderSettings();
    if (!settings.autoDetect) return;

    const now = new Date();
    const oldest = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - RECENT_DAYS));
    const cued = buffer.filter(
      (b) =>
        (b.isSelf === true || b.isSelf === false) &&
        !!b.sentDate &&
        b.sentDate >= oldest &&
        hasDeadlineCue(b.text),
    );
    if (cued.length === 0) return;

    const keys = cued.map((b) => messageKey(chat, b));
    const fresh = new Set(await IndicContext.claimMessages(keys));
    const candidates = cued.filter((_, i) => fresh.has(keys[i]));
    if (candidates.length === 0) return;

    console.log(`${TAG} checking ${candidates.length} message(s) in "${chat}"`);
    let items: ExtractedCommitment[];
    try {
      items = await extractCommitments(buffer, chat, candidates, now);
    } catch (e) {
      // Offline / timeout / rate limit: release the messages so the next chat visit retries them.
      if (isLlmError(e) && (e.kind === 'network' || e.kind === 'timeout' || e.kind === 'http')) {
        await IndicContext.unclaimMessages(candidates.map((b) => messageKey(chat, b))).catch(() => {});
      }
      throw e;
    }
    for (const it of items) {
      if (it.confidence !== 'high' || it.owedBy === 'contact') continue;
      const src = candidates[it.id];
      const saved = await IndicContext.addReminder({
        task: it.task,
        chat,
        appPackage: src.appPackage || 'com.whatsapp',
        dueAtMs: it.dueAtMs,
        dueHasTime: it.dueHasTime,
        sourceKey: messageKey(chat, src),
      });
      console.log(`${TAG} ${saved ? 'scheduled' : 'skipped (too late)'}: ${it.task}`);
    }
  } catch (e) {
    console.warn(`${TAG} detection failed:`, isLlmError(e) ? `${e.kind} ${e.message}` : e);
  } finally {
    running = false;
    if (latest) void processLatest(); // a newer buffer arrived meanwhile
  }
}
