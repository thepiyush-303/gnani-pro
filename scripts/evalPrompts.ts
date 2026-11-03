/**
 * Prompt regression check for Smart Replies & Improve Text.
 *
 * Hits the real Gnani Evon endpoint with fixture conversations and fails on
 * the failure modes from docs/AI_OVERHAUL.md (generic check-ins, identical
 * replies across contacts, blindly appended "bhai/yaar", slang in formal chats).
 *
 *   npm run eval:prompts            (reads .env; uses EXPO_PUBLIC_LLM_PROVIDER)
 *   EXPO_PUBLIC_LLM_PROVIDER=evon npm run eval:prompts
 */

import type { ChatBubble } from '../src/types/context';
import { generateSmartReplies, improveText } from '../src/services/aiFeatures';
import { buildChatPayload } from '../src/services/llm/chatPayload';
import { isLlmError } from '../src/services/llm/llmClient';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const u = (text: string, sentDate?: string, sentTime?: string): ChatBubble =>
  ({ text, isSelf: true, capturedAtMs: 0, appPackage: 'com.whatsapp', sentDate, sentTime });
const c = (text: string, sentDate?: string, sentTime?: string): ChatBubble =>
  ({ text, isSelf: false, capturedAtMs: 0, appPackage: 'com.whatsapp', sentDate, sentTime });

// ─── Dated fixtures (now = Tue 3 Nov 2026) ───
const at = (iso: string) => new Date(iso); // local time
const PROMISE_YESTERDAY = [
  u('bhai project ki details bhej de', '2026-11-02', '18:05'),
  c('abhi bahar hu, kal subah tak bhej dunga pakka', '2026-11-02', '18:20'),
  u('ok bhai', '2026-11-02', '18:21'),
];
const PROMISE_KEPT = [...PROMISE_YESTERDAY, c('ye le details, check kar le', '2026-11-03', '09:15')];
const PAST_PLAN = [
  c('kal 5 baje cafe pe milte hain', '2026-10-30', '14:00'),
  u('done', '2026-10-30', '14:02'),
];

const BOSS_CHAT = [
  c('Good morning. Are you joining the offsite on Saturday?'),
  u('Good morning sir, yes I will be there.'),
  c('Great. Some of us are planning a chess game on Sunday morning before we leave.'),
  c('Would you be interested?'),
];

const BANTER_CHAT = [
  c('abe gadhe kal kya kr rha h'),
  u('kuch ni bc ghar pe hi hu'),
  c('chal chess khelte h fir, pichli baar tu bura hara tha 😂'),
  u('abe chup, luck tha tera'),
  c('dekhte h kal, time bata'),
];

const MOM_CHAT = [
  c('Beta khana kha liya?'),
  u('Haan mummy kha liya'),
  c('Kal subah jaldi uthna, mausi ke ghar chalna hai'),
];

const FRIENDS: Record<string, ChatBubble[]> = {
  Ashmit: [
    c('bhai kal ka match dekha? kohli ne kya maara'),
    u('haan yaar last over mast tha'),
    c('sunday ko stadium chalein? tickets mil rahe hain'),
  ],
  Ayush: [
    c('DBMS ka assignment submit kiya?'),
    u('nahi abhi tak, normalization wala part samajh nahi aaya'),
    c('main notes bhej deta hu, kal tak deadline hai'),
  ],
  Ujjwal: [
    c('bro my laptop died again'),
    u('seriously? third time this month'),
    c('ya I think its the battery. any good repair shop near campus?'),
  ],
  Piyush: [
    c('goa trip ka plan final kar'),
    u('dates fix kar pehle, mere exams 20 tak hain'),
    c('to 22 se 26 rakh le? flight sasti hai us week'),
  ],
};

const LAST_FROM_USER = [
  c('Report bhej dena aaj'),
  u('Ji sir, shaam tak bhej dunga'),
  u('Sir ek doubt tha, Q3 numbers bhi add karne hain kya?'),
];

// ─── Checks ──────────────────────────────────────────────────────────────────

/** Common Romanised-Hindi tokens: an English-only chat should not get these back. */
const HINDI_TOKENS = /\b(hai|h|hain|kya|nahi|ni|jaa|ja|kal|chal|bhi|tha|vahi|wahi|accha|acha|kr|kar|karo|dekh|bata|mil|yaar|bhai|tera|mera)\b/i;
const INVENTED_TIME = /\b\d{1,2}\s*(baje|am|pm)\b|\b\d{1,2}:\d{2}\b/i;
const ENGLISH_ONLY = new Set(['Ujjwal']);

const GENERIC = /(kya haal|kya chal raha|how are you|hope you('| a)re doing|what'?s up)/i;
const SLANG = /\b(bhai|yaar|bro|bc|abe|gadhe)\b/i;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`   ❌ ${msg}`);
};
const pass = (msg: string) => console.log(`   ✅ ${msg}`);

function blindlyAppended(draft: string, out: string): boolean {
  const esc = draft.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc}[\\s,!.]*(bhai|yaar|bro|ji)[\\s!.]*$`, 'i').test(out.trim());
}

/** Spacing between live calls so a full run stays under the Gemini free-tier rate limit. */
const PACE_MS = Number(process.env.EVAL_PACE_MS ?? 4500);
let firstCall = true;

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  if (!firstCall) await new Promise((r) => setTimeout(r, PACE_MS));
  firstCall = false;
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`\n▶ ${label}  (${Date.now() - t0}ms)`);
    return r;
  } catch (e) {
    console.log(`\n▶ ${label}`);
    fail(`LLM call failed: ${isLlmError(e) ? `${e.kind} ${e.message}` : String(e)}`);
    return null;
  }
}

async function main() {
  // Payload shape sanity check (no network)
  console.log('Payload sample:', JSON.stringify(buildChatPayload(BANTER_CHAT.slice(0, 2), 'Ashmit', { draft: 'hi' })));

  // 1. Improve: same draft, formal vs banter
  const CHESS = 'i can play chess tomorrow morning how does it sound good to you';
  const formal = await attempt('Improve · boss chat · chess draft', () => improveText(CHESS, BOSS_CHAT, 'Rajesh Sharma'));
  if (formal) {
    console.log(`   [${formal.tone} | ${formal.relationship}] ${formal.improved}  //  ${formal.alternatives.join('  //  ')}`);
    SLANG.test(formal.improved) ? fail('slang in formal rewrite') : pass('no slang in formal rewrite');
    /tomorrow/i.test(formal.improved) ? pass('kept the draft\'s "tomorrow"') : fail('changed the draft\'s day ("tomorrow")');
  }
  const banter = await attempt('Improve · banter chat · chess draft', () => improveText(CHESS, BANTER_CHAT, 'Ashmit'));
  if (banter) {
    console.log(`   [${banter.tone} | ${banter.relationship}] ${banter.improved}  //  ${banter.alternatives.join('  //  ')}`);
    blindlyAppended(CHESS, banter.improved) ? fail('filler blindly appended') : pass('real rewrite, not appended filler');
    banter.improved.toLowerCase() === CHESS ? fail('unchanged in banter chat') : pass('changed to fit banter');
  }
  if (formal && banter && formal.improved === banter.improved) fail('formal and banter rewrites are identical');

  // 2. Improve: one-word draft in two chats
  const m1 = await attempt('Improve · "Message" · banter chat', () => improveText('Message', BANTER_CHAT, 'Ashmit'));
  const m2 = await attempt('Improve · "Message" · mom chat', () => improveText('Message', MOM_CHAT, 'Mummy'));
  for (const r of [m1, m2]) {
    if (!r) continue;
    console.log(`   [${r.tone} | ${r.relationship}] ${r.improved}  (note: ${r.note})`);
    blindlyAppended('Message', r.improved) ? fail('filler blindly appended to "Message"') : pass('no blind append');
    INVENTED_TIME.test(r.improved) ? fail('invented a time that is not in the chat') : pass('no invented time');
  }
  if (m1 && m2 && m1.improved === m2.improved) fail('"Message" rewritten identically in different chats');

  // 3. Smart replies: four different friends
  const replySets: Record<string, string[]> = {};
  for (const [name, chat] of Object.entries(FRIENDS)) {
    const r = await attempt(`Smart Replies · ${name}`, () => generateSmartReplies(chat, name));
    if (!r) continue;
    console.log(`   [${r.tone} | ${r.relationship} | ${r.language}]`);
    r.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    r.replies.length === 3 ? pass('3 replies') : fail(`expected 3 replies, got ${r.replies.length}`);
    const generic = r.replies.filter((x) => GENERIC.test(x));
    generic.length ? fail(`generic check-in: ${generic.join(' | ')}`) : pass('no generic check-ins');
    if (ENGLISH_ONLY.has(name)) {
      const hinglish = r.replies.filter((x) => HINDI_TOKENS.test(x));
      hinglish.length ? fail(`English chat got Hinglish: ${hinglish.join(' | ')}`) : pass('English chat → English replies');
    }
    replySets[name] = r.replies.map((x) => x.toLowerCase().trim());
  }
  const names = Object.keys(replySets);
  let overlap = false;
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const shared = replySets[names[i]].filter((x) => replySets[names[j]].includes(x));
      if (shared.length) {
        overlap = true;
        fail(`${names[i]} & ${names[j]} share replies: ${shared.join(' | ')}`);
      }
    }
  if (names.length > 1 && !overlap) pass('\nreply sets are distinct across contacts');

  // 4. Last message from the user → follow-ups, not a self-reply
  const lf = await attempt('Smart Replies · last message from user', () => generateSmartReplies(LAST_FROM_USER, 'Manager'));
  if (lf) {
    console.log(`   [${lf.tone} | ${lf.relationship}]`);
    lf.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    console.log('   (manual check: these should be follow-ups/nudges by the user, not answers to their own question)');
  }

  // 5. Time awareness
  const due = await attempt('Smart Replies · promise from yesterday, reopened next morning', () =>
    generateSmartReplies(PROMISE_YESTERDAY, 'Rahul', { now: at('2026-11-03T11:00:00') }));
  if (due) {
    console.log(`   follow_up: "${due.followUp}"`);
    due.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    due.followUp ? pass('flags the pending promise') : fail('no follow_up for a promise due today');
    due.replies.some((x) => /detail|bhej|bheji|kya hua|aaya|mila/i.test(x))
      ? pass('replies follow up on the details')
      : fail('replies ignore the pending details');
  }
  const notYet = await attempt('Smart Replies · same chat, same evening (not due yet)', () =>
    generateSmartReplies(PROMISE_YESTERDAY, 'Rahul', { now: at('2026-11-02T18:30:00') }));
  if (notYet) {
    console.log(`   follow_up: "${notYet.followUp}"`);
    notYet.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    !notYet.followUp ? pass('nothing flagged before it is due') : fail('flagged a promise that is not due yet');
  }
  const kept = await attempt('Smart Replies · promise kept this morning', () =>
    generateSmartReplies(PROMISE_KEPT, 'Rahul', { now: at('2026-11-03T11:00:00') }));
  if (kept) {
    console.log(`   follow_up: "${kept.followUp}"`);
    kept.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    !kept.followUp ? pass('nothing flagged once delivered') : fail('flagged a promise that was already kept');
  }
  const past = await attempt('Smart Replies · plan from 4 days ago', () =>
    generateSmartReplies(PAST_PLAN, 'Neha', { now: at('2026-11-03T11:00:00') }));
  if (past) {
    console.log(`   follow_up: "${past.followUp}"`);
    past.replies.forEach((x, i) => console.log(`   ${i + 1}. ${x}`));
    const upcoming = past.replies.filter((x) => /\b(today|tonight|tomorrow|aaj|kal)\b/i.test(x));
    upcoming.length
      ? fail(`treats a 4-day-old plan as today/tomorrow: ${upcoming.join(' | ')}`)
      : pass('does not treat the old plan as upcoming');
  }
  const stale = await attempt('Improve · "kal bhej dunga" when it was due today', () =>
    improveText('kal bhej dunga', [
      c('report kab tak aayegi?', '2026-11-02', '10:00'),
      u('kal tak bhej dunga', '2026-11-02', '10:05'),
      c('?', '2026-11-03', '10:30'),
    ], 'Boss', { now: at('2026-11-03T11:00:00') }));
  if (stale) {
    console.log(`   ${stale.improved}  (note: ${stale.note})`);
    /today|tomorrow|promised|pushes/i.test(stale.note) ? pass('note flags the timing conflict') : fail('no heads-up about timing');
  }

  // 6. Empty conversation short-circuits without a network call
  const empty = await generateSmartReplies([], 'Nobody');
  empty.replies.length === 0 ? pass('\nempty chat → no replies, no call') : fail('empty chat produced replies');

  console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
