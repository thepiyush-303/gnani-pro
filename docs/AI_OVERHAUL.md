# AI Overhaul: Smart Replies, Improve Text, Role-Tagged Chat Payload

Started: 2026-11-03 · Branch: `context`

This is the working document for the AI-feature overhaul. It records **what was wrong**, **what we decided**, and **progress**. Update the checklist as items land.

---

## 1. Audit: what was wrong

| # | Problem | Where | Effect |
|---|---------|-------|--------|
| 1 | **Template fallbacks hid LLM failures.** `queryEvonLlm` used a 4–5 s timeout per endpoint and caught every error silently. Any timeout or JSON-parse failure fell through to hardcoded phrase banks. | `contextIntelligenceEngine.ts`: `generateIcebreakersLocally`, `improveMessageLocally`, `generateContextualRepliesLocally` | Every contact got "Aur bhai {Name}, kya chal raha hai aaj kal?" / "Free ho to batao bhai…". Improve Text returned `"${draft} bhai!"` / `"${draft} yaar!"`. |
| 2 | **Rigid persona buckets** (Friend / Colleague / Boss / Elder / Client). Guessed from the contact *name* and keyword counts, set manually from a dashboard picker, then injected into every prompt and template branch. | `listenerContextStore.ts`, `conversationContextDb.ts`, `types/context.ts`, `app/index.tsx` | The relationship came from the name, not from how the two people actually talk. |
| 3 | **Sender confusion.** `isSelf` was decided by fixed TextView-bound thresholds. Long messages came out as `null`, and every prompt builder treated `null` as the contact. | `ChatAccessibilityService.walkAndCapture` | The LLM saw the user's own messages attributed to the contact, which produced hallucinated context. |
| 4 | **Lossy capture.** `length > 3` dropped "ok" / "hn" / "😂". Any message containing `hh:mm` was dropped. Date chips and system notices were captured as messages. BFS insertion order put older messages at the end when the user scrolled up. | `ChatAccessibilityService.walkAndCapture`, `SessionBuffer.add` | Short tone signals were lost and the order was wrong. |
| 5 | **Regex "understanding".** Theme and language classifiers used word lists overfitted to one test chat ("tannu", "deadshot", "exp3"). | `extractConversationDetails`, `detectConversationLanguage` | Prompts got wrong tone hints. |
| 0 | **The LLM was never reachable.** Found by the eval script: `api.vachana.ai/v1/chat/completions` returns 403 `SCOPE_NOT_ALLOWED` ("Service 'None' not in allowed scopes"), `api.inya.ai/platform/v1/chat/completions` returns 404, and `api.gnani.ai` does not resolve. Gnani's public docs only cover Speech + Agent Builder APIs. | `callEvonLlm` / `queryEvonLlm` endpoint lists | **100 % of the AI output users saw came from the template fallbacks in #1.** |
| 6 | **Two duplicate LLM clients**, with the API key hardcoded in 3 places. | `gnaniEvonLlm.ts`, `contextIntelligenceEngine.ts`, `app/index.tsx` | Inconsistent timeouts and error handling. ⚠️ The key is in git history; **rotate it**. |

## 2. Decisions

1. **No personas.** The LLM infers the relationship, tone and language from the conversation itself. The contact name is passed as context only, and the prompt explicitly forbids using it to infer the relationship.
2. **Role-tagged JSON payload.** Every LLM feature sends `{"contact_name", "conversation": [{"sender": "user"|"contact", "text"}], "draft"?}` as the user turn. Bubbles with an unresolved sender are **dropped, never guessed**. Window = the last **15** attributed messages.
3. **No template fallbacks.** When the LLM fails, the overlay shows an error card with **↻ Retry**. Improve Text leaves the draft untouched. Passive (auto) smart replies only log the error.
4. **Icebreakers → Smart Replies.** One feature, used both by the toolbar button and by the auto-suggestions shown when a new incoming message arrives.
5. **One LLM client** (`src/services/llm/llmClient.ts`) with a shared time budget, typed `LlmError`s and logging of HTTP status and response body.
6. **Provider: Gemini by default** (added 2026-11-03, since Gnani has no LLM endpoint). `EXPO_PUBLIC_LLM_PROVIDER=gemini|evon` in `.env` switches providers.
   - Gemini uses native `generateContent` with `responseMimeType: application/json`, `safetySettings` set to `BLOCK_ONLY_HIGH` (affectionate abuse is normal in these chats), and one automatic retry on 429/503.
   - Model: `gemini-3.5-flash-lite` (free tier), set by `EXPO_PUBLIC_GEMINI_MODEL`.
   - Thinking level: `minimal` for Smart Replies and Summary (fast); `low` for Improve Text, Fact Check and Tone Guard (with `minimal`, Improve swapped "tomorrow"→"Sunday" in 4 of 4 tries).
7. **Output guards** (`aiFeatures.ts`), because flash-lite doesn't always follow the prompt:
   - drop suggestions that introduce numbers (times, dates, prices) not in the draft or chat;
   - strip "bhai/yaar/bro" when nobody in the conversation uses them;
   - if every Improve option is rejected, keep the user's draft unchanged.

## 3. Payload contract

```jsonc
// user turn sent to the LLM (JSON.stringify'd)
{
  "contact_name": "Ashmit",          // or null; context only
  "conversation": [                  // oldest → newest, max 15
    { "sender": "contact", "text": "kal chess khelega?" },
    { "sender": "user",    "text": "haan pakka" }
  ],
  "draft": "i can play chess tomorrow morning"   // Improve Text only
}
```

Source of truth: `src/services/llm/chatPayload.ts` (builder) and `src/services/llm/prompts.ts` (system prompts).

## 4. Progress

### Phase 0: Planning
- [x] Audit and decisions recorded (this file)

### Phase 1: Native capture (roles, order, filtering)
- [x] WhatsApp: capture via `message_text` view IDs; detect the sender from the delivery-tick `status` view inside the bubble row
- [x] Fallback: bubble-container left-gap vs right-gap (6 % margin); an ambiguous result → `null` (dropped in JS)
- [x] Keep short messages; drop timestamp-only text, date chips, the E2E notice, unread banners and deleted-message placeholders
- [x] `SessionBuffer.mergeVisible()`: on-screen order, anchored merge (handles scrolling up)
- [x] Per-message debug log `[user|contact|?]`
- [ ] **On device:** confirm WhatsApp view IDs (`message_text`, `status`, `quoted_message`, `name_in_group`) with `adb shell uiautomator dump`

### Phase 2: LLM client
- [x] `src/services/llm/llmClient.ts`: shared budget, typed `LlmError`, JSON extraction and validation, env-based keys, **Gemini + Evon providers**
- [x] Removed the duplicate client and the hardcoded keys elsewhere

### Phase 3: Prompts and features
- [x] `src/services/llm/prompts.ts`: Smart Replies, Improve Text, Tone Guard, Fact Check, Summary
- [x] `src/services/llm/chatPayload.ts`: role-tagged payload builder
- [x] `src/services/aiFeatures.ts`: `generateSmartReplies`, `improveText` (replaces `contextIntelligenceEngine.ts`)
- [x] `gnaniEvonLlm.ts`: summary, fact check and tone guard moved to the payload and shared client; local fallbacks, `generateIcebreakers` and `enhanceUpdateWithContext` removed

### Phase 4: Persona removal
- [x] Removed `PersonaType`, `ListenerContext`, `ThreadContextProfile`, `IcebreakerResult`, `SmartReplyResult` and `EnhancedUpdateResult`
- [x] Deleted `listenerContextStore.ts` and `conversationContextDb.ts`; `getCleanFirstName` → `src/utils/contactName.ts`

### Phase 5: Rename + error UI (native/bridge)
- [x] `btn_icebreaker` → `btn_smart_replies`; the action is now `smart_replies`
- [x] Native `showAiError(message, retryAction)` with a ↻ Retry chip
- [x] JS bridge types updated

### Phase 6: Dashboard
- [x] Action handler uses the new features and error cards
- [x] Auto smart replies use the same feature
- [x] Persona picker and badge removed; the Icebreakers card is merged into Smart Replies; test panel updated

### Phase 7: Verification
- [x] `npx tsc --noEmit`
- [x] `scripts/evalPrompts.ts` written; client plumbing verified against a local stub
- [x] Gemini provider + `.env` switch; live prompt eval passes (`npm run eval:prompts`, see log)
- [ ] On-device check (sender tags in logcat, short messages kept, scroll order, airplane mode → Retry)

## 5. Verification log

_(append results here: date, what was run, outcome)_

**2026-11-03**
- `npx tsc --noEmit`: ✅ clean.
- `./gradlew :indic-context:compileDebugKotlin --offline`: ✅ BUILD SUCCESSFUL.
- `npx tsx scripts/evalPrompts.ts` against the default endpoints: ❌ **all 9 LLM calls failed**, with every endpoint failing (403 SCOPE_NOT_ALLOWED / 404 / DNS). This confirms audit item #0. Only the offline check (an empty chat makes no call) passed.
- Plumbing test against a local OpenAI-style stub (`EXPO_PUBLIC_LLM_ENDPOINT=http://localhost:8787/...`): ✅
  - the payload is role-tagged JSON, the null-sender bubble is dropped, and the phone number is redacted;
  - fenced JSON and chatter-prefixed JSON (with braces inside strings) both parse;
  - near-duplicate replies and an alternative identical to `improved` are de-duplicated;
  - an unparseable completion → `LlmError('parse')`; HTTP 500 → `LlmError('http')`.
- ~~**Next:** set `EXPO_PUBLIC_LLM_ENDPOINT` / `EXPO_PUBLIC_LLM_MODEL` / `EXPO_PUBLIC_LLM_API_KEY` to a working OpenAI-compatible endpoint (or get LLM scope on the Gnani key), then rerun the eval and do the on-device checks.~~ Superseded: Gemini provider added (see below; vars renamed to `EXPO_PUBLIC_EVON_*`).

**2026-11-03: Gemini (`gemini-3.5-flash-lite`)**
- First live run: all checks passed, but manual review found quality problems:
  - an English-only chat got Hinglish replies and an invented shop name;
  - "Message" was rewritten with an invented "5 baje";
  - "bhai" was added where nobody uses it;
  - "Wise maine…" came out garbled.
- Fixes:
  - prompts: language decided from the user's actual words, no invented specifics (ask instead), and a STEP 3 self-check;
  - code guards (decision 7);
  - eval: new checks for English→English and for invented times.
- Runs 2–3: the English chat now gets English replies and no generic check-ins in any run. An invented time appeared once (caught by the eval and later by the guard). A 429 hit during the second run and the automatic retry recovered it.
- Date preservation (boss chat, draft "tomorrow", chat says Sunday):
  - flash-lite `minimal`: 0/4 kept;
  - flash-lite `low`: 3/3, then 3/5 after the "you are not a fact-checker" rule; the note always flags the mismatch;
  - **`gemini-3.5-flash` `low`: 5/5 kept, but ~5.5 s avg and a 503 "high demand" error**, vs ~1.2 s for flash-lite.
  - Kept flash-lite as requested. Switch with `EXPO_PUBLIC_GEMINI_MODEL=gemini-3.5-flash` if correctness matters more than speed.
- Final full eval: ✅ all checks passed. Latency is 1–2 s for most calls (5 s worst).
- **Watch:** the free-tier rate limit (429) was hit after ~12 calls in about a minute. Passive auto-replies fire on every incoming message, so a fast chat can hit it; the error is logged and no card is shown.
