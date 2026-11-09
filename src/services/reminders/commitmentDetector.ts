/**
 * ⏰ Deadline detection: turns chat messages into scheduled reminders.
 *
 *   buffer update (processed at once; no timers, see below) → recent, dated messages with a deadline cue (on-phone regex)
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
/** Logs to logcat (tag ConvoAI.JS) in every build, and to the Metro console in dev. */
const log = (...parts: unknown[]) => {
  const line = `${TAG} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`;
  console.log(line);
  IndicContext.debugLog(line);
};
/** Only messages sent today or in the last 2 days can create reminders. */
const RECENT_DAYS = 2;

// ─── Live pipeline (called from CopilotBridge on every buffer update) ────────

// No setTimeout debounce: React Native pauses JS timers while ConvoAI's own screen is in the
// background, which it always is while the user is in WhatsApp. Instead, one check runs at a
// time and the newest buffer waits in `latest`; claimMessages stops repeat AI calls.
let running = false;
let latest: { buffer: ChatBubble[]; chat: string } | null = null;

export function onBuffer(buffer: ChatBubble[], chat: string | null | undefined): void {
  if (!chat || buffer.length === 0) return;
  latest = { buffer, chat };
  void processLatest();
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
    if (cued.length === 0) {
      const undated = buffer.filter((b) => !b.sentDate && (b.isSelf === true || b.isSelf === false) && hasDeadlineCue(b.text));
      if (undated.length > 0) log(`${undated.length} deadline message(s) skipped: send date unknown`);
      return;
    }

    const keys = cued.map((b) => messageKey(chat, b));
    const fresh = new Set(await IndicContext.claimMessages(keys));
    const candidates = cued.filter((_, i) => fresh.has(keys[i]));
    if (candidates.length === 0) {
      log(`${cued.length} deadline message(s) in "${chat}" already checked`);
      return;
    }

    log(`checking ${candidates.length} message(s) in "${chat}"`);
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
    log(`AI found ${items.length} item(s):`, items.map((x) => ({ owedBy: x.owedBy, conf: x.confidence, task: x.task, due: new Date(x.dueAtMs).toString().slice(0, 21), timed: x.dueHasTime })));
    for (const it of items) {
      if (it.confidence !== 'high' || it.owedBy === 'contact') {
        log(`ignored (${it.owedBy}, ${it.confidence}): ${it.task}`);
        continue;
      }
      const src = candidates[it.id];
      const saved = await IndicContext.addReminder({
        task: it.task,
        chat,
        appPackage: src.appPackage || 'com.whatsapp',
        dueAtMs: it.dueAtMs,
        dueHasTime: it.dueHasTime,
        sourceKey: messageKey(chat, src),
      });
      log(`${saved ? 'scheduled' : 'skipped (too late)'}: ${it.task}`);
    }
  } catch (e) {
    log('detection failed:', isLlmError(e) ? `${e.kind} ${e.message}` : String((e as Error)?.stack ?? e));
  } finally {
    running = false;
    if (latest) void processLatest(); // a newer buffer arrived meanwhile
  }
}
