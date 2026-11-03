# Execution Process — Step-by-Step Checklist

## IndicContext Assistant — Build Phases

**Rule:** No phase begins until the previous phase is approved. Each phase ends with a checkpoint for review.

---

## Phase 1: Overlay UI Shell & Window Management

> **Goal:** Get a floating React Native panel rendering above the stock keyboard via `SYSTEM_ALERT_WINDOW`.

### 1.1 Android Native — Overlay Window Service
- [ ] Create `OverlayService.kt` — an Android `Service` (not `InputMethodService`) that uses `WindowManager` to draw a floating `FrameLayout`.
- [ ] Configure `WindowManager.LayoutParams` with `TYPE_APPLICATION_OVERLAY` (API 26+), gravity `BOTTOM`, and width `MATCH_PARENT`.
- [ ] Handle `SYSTEM_ALERT_WINDOW` permission check — if not granted, launch `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` intent.
- [ ] Register `OverlayService` in `AndroidManifest.xml`.
- [ ] Add `SYSTEM_ALERT_WINDOW` permission to manifest.

### 1.2 React Native Root View in Overlay
- [ ] Host a `ReactRootView` inside the `OverlayService`'s `FrameLayout` so the overlay UI is driven by React Native.
- [ ] Create `OverlayPanel.tsx` — the root React component rendered inside the overlay.
- [ ] Implement collapsed state: a slim toolbar with buttons — 🎤 (Mic), 🎨 (Tone), ❄️ (Icebreaker), and a drag handle.
- [ ] Implement expanded state: panel expands upward to show feature-specific UI (draft area, tone controls, suggestions).
- [ ] Implement drag-to-reposition (vertical only, snap to top/bottom of keyboard area).

### 1.3 Remove / Deprecate IME Service
- [ ] Remove `CustomKeyboardService.kt` and its manifest entry (we are NOT replacing the stock keyboard).
- [ ] Remove `res/xml/method.xml`.
- [ ] Update `.agents/context.md` to reflect the overlay architecture.

### 1.4 Overlay Lifecycle
- [ ] Implement show/hide toggle — overlay appears when a supported app's input field is focused (detected by AccessibilityService), hides otherwise.
- [ ] Implement a persistent notification with "Show/Hide Overlay" toggle for manual control.
- [ ] Handle overlay z-ordering: ensure it sits above the keyboard but below system dialogs.

### ✅ Phase 1 Checkpoint
- [ ] Overlay panel renders above Gboard on a test device.
- [ ] Collapsed toolbar shows 3 buttons + drag handle.
- [ ] Expanding/collapsing works without flicker.
- [ ] Overlay hides when no input field is focused.

---

## Phase 2: Context Buffer & Accessibility Service

> **Goal:** The AccessibilityService captures visible chat bubbles into the In-Memory Session Buffer and bridges the data to TypeScript.

### 2.1 Buffer Data Model (Kotlin)
- [ ] Define `ChatBubble` data class: `text`, `isSelf`, `capturedAtMs`, `nodeClassName`, `appPackage`.
- [ ] Define `SessionBuffer` class wrapping `ArrayDeque<ChatBubble>` with max capacity 30, FIFO eviction.
- [ ] Add `resetIfAppChanged(newPackage: String)` method — clears buffer on app/chat switch.
- [ ] Add deduplication logic — hash of `text + approximate position` to avoid re-adding the same bubble on scroll.

### 2.2 Accessibility Event Processing
- [ ] Update `ChatAccessibilityService.kt` to filter events: `TYPE_WINDOW_CONTENT_CHANGED`, `TYPE_VIEW_SCROLLED`.
- [ ] Implement node-tree walker: from the event's source or root node, recursively find `TextView` children inside `RecyclerView`/`ListView`.
- [ ] Implement WhatsApp-specific heuristic: identify message bubbles by their view hierarchy pattern.
- [ ] Implement Telegram-specific heuristic (similar approach, different view IDs).
- [ ] Add adapter pattern (`AppChatAdapter` interface) so new app heuristics can be plugged in.
- [ ] Determine `isSelf` by checking node position/alignment or parent container properties (right-aligned = self in most chat apps).

### 2.3 Native Bridge — Buffer → TypeScript
- [ ] Create `ContextBufferModule.kt` — a React Native `NativeModule`.
- [ ] Expose `@ReactMethod getBuffer(): ReadableArray` — returns the current buffer as a JSON-serializable array.
- [ ] Emit `onBufferUpdated` event via `RCTDeviceEventEmitter` whenever the buffer changes (debounced to max 1 event per 500ms).
- [ ] Register the module in a `ReactPackage`.

### 2.4 TypeScript Buffer Consumer
- [ ] Create `src/services/contextBuffer.ts` — listens to `onBufferUpdated` events, stores a local copy of the buffer.
- [ ] Export `getSessionBuffer(): ChatBubble[]` for other services to consume.
- [ ] Define `ChatBubble` TypeScript type mirroring the Kotlin data class.

### 2.5 Input Field Detection & Text Injection
- [ ] In `ChatAccessibilityService`, detect the currently focused `EditText` node (the chat app's input field).
- [ ] Store a reference to the focused node for text injection.
- [ ] Create `TextInjectionModule.kt` — a `NativeModule` with `@ReactMethod injectText(text: String)`.
- [ ] Implement injection via `AccessibilityNodeInfo.ACTION_SET_TEXT` on the focused `EditText`.
- [ ] Implement clipboard-paste fallback: copy text to clipboard → perform `ACTION_PASTE` on the node.
- [ ] Create `src/services/textInjection.ts` — TypeScript wrapper around the native module.

### ✅ Phase 2 Checkpoint
- [ ] Open WhatsApp, scroll through a chat → buffer captures up to 30 messages.
- [ ] Switch to a different chat → buffer resets.
- [ ] `getSessionBuffer()` in TypeScript returns the correct data.
- [ ] `injectText("Hello")` places "Hello" into WhatsApp's input field.
- [ ] Same works on Telegram.

---

## Phase 3: Voice-to-Text (Gnani Prisma V2.5 STT)

> **Goal:** Mic button captures audio, sends to Prisma STT, returns transcribed text to the overlay.

### 3.1 Audio Capture (Native)
- [ ] Create `AudioCaptureModule.kt` — a `NativeModule` handling mic recording.
- [ ] Implement `@ReactMethod startRecording()` — begins `AudioRecord` capture, writes PCM to a buffer.
- [ ] Implement `@ReactMethod stopRecording(): String` — stops recording, returns base64-encoded audio (or a file URI).
- [ ] Handle `RECORD_AUDIO` runtime permission request.
- [ ] Emit `onRecordingAmplitude` events for a visual waveform indicator in the overlay.

### 3.2 Prisma STT Service (TypeScript)
- [ ] Update `src/services/gnaniPrismaStt.ts`:
  - Accept audio data (base64 or URI) + language preference.
  - Make HTTP request to Gnani Prisma V2.5 endpoint.
  - Parse response to extract transcript.
  - Handle errors: network failure, empty response, timeout.
- [ ] Define language options: `'en'`, `'hi'`, `'hinglish'`, `'auto'`.

### 3.3 Voice UI in Overlay
- [ ] In `OverlayPanel.tsx`, implement the mic flow:
  - Tap 🎤 → overlay expands to show recording state (waveform + "Listening...").
  - Tap again (or auto-stop after silence) → "Processing..." state.
  - Transcript appears in the draft area.
  - Language picker (EN / HI / Hinglish / Auto) as a small toggle.
- [ ] "Accept" button → injects transcript into input field.
- [ ] "Discard" button → clears the draft.

### ✅ Phase 3 Checkpoint
- [ ] Tap mic → speak in English → transcript appears within 3s.
- [ ] Tap mic → speak in Hindi → correct Hindi transcript.
- [ ] Code-switch mid-sentence (Hinglish) → transcript handles it.
- [ ] Accept → text appears in WhatsApp/Telegram input field.
- [ ] Network error → user sees inline error with retry button.

---

## Phase 4: Tone & Temperature Rewrite Engine (Gnani Evon LLM)

> **Goal:** User selects a tone + temperature level, and the Evon LLM rewrites their draft using the session buffer as context.

### 4.1 Evon LLM Service (TypeScript)
- [ ] Refactor `src/services/gnaniEvonLlm.ts` into a modular service with multiple prompt modes:
  - `rewriteWithTone(draft, buffer, tone, temperature): Promise<string>`
  - `factCheck(draft, buffer): Promise<FactCheckResult>`
  - `culturalSensitivityCheck(draft, buffer, persona): Promise<SensitivityResult>`
  - `generateIcebreakers(buffer): Promise<string[]>`
- [ ] Implement `rewriteWithTone`:
  - Construct prompt with system instructions, buffer context, tone, and temperature level (1–5).
  - Send to Evon API.
  - Parse and return rewritten text.
- [ ] Define response types for each mode.

### 4.2 Tone UI in Overlay
- [ ] Tone button on toolbar → expand panel to show:
  - **Tone Selector:** 4 toggleable chips — Casual / Polite / Respectful / Informative. Default: Polite.
  - **Temperature Slider:** 5 discrete steps (1–5) with labels. Default: 3 (Balanced).
  - **Draft Preview:** Shows the current text from the input field (read via AccessibilityService).
  - **"Rewrite" button.**
- [ ] On "Rewrite" tap:
  - Read draft from input field.
  - Fetch session buffer.
  - Call `rewriteWithTone()`.
  - Show rewritten text in a preview area with diff highlighting (optional).
- [ ] "Accept" → inject rewritten text. "Discard" → close panel, original stays.

### 4.3 Prompt Templates
- [ ] Create `src/prompts/toneRewrite.ts` — holds the system prompt template with placeholders for `{buffer}`, `{draft}`, `{tone}`, `{temperature}`.
- [ ] Temperature level descriptions embedded in the prompt (see PRD §5.2).

### ✅ Phase 4 Checkpoint
- [ ] Type "hey can u send me the report" in WhatsApp → Tone: Respectful, Temp: 4 → output is a polished, expanded formal request referencing buffer context.
- [ ] Same input, Temp: 1 → output is concise: "Could you please share the report?"
- [ ] All 4 tones produce distinct outputs.
- [ ] Accept injects rewritten text correctly.

---

## Phase 5: Pre-Send Interceptors — Fact-Check & Cultural Sensitivity

> **Goal:** Before text injection, run parallel fact-check and cultural sensitivity analysis. Merge results into a single modal if either (or both) flag an issue.

### 5.1 Interceptor Pipeline (TypeScript)
- [ ] Create `src/services/preSendInterceptor.ts`:
  - `runPreSendChecks(draft, buffer, persona?): Promise<PreSendResult>`
  - Internally calls `factCheck()` and `culturalSensitivityCheck()` in parallel via `Promise.all()`.
  - Merges results into a `PreSendResult`:
    ```typescript
    type PreSendResult = {
      passed: boolean;
      factCheck?: { flagged: boolean; explanation: string; suggestion?: string };
      cultural?: { flagged: boolean; explanation: string; persona: string; suggestion?: string };
    };
    ```
  - If both pass → `{ passed: true }`.
  - If either flags → `{ passed: false, ...details }`.

### 5.2 Evon LLM — Fact-Check Prompt
- [ ] Create `src/prompts/factCheck.ts` — system prompt instructs the LLM to:
  - Identify factual claims in the draft.
  - Cross-reference with the chat buffer timeline.
  - Return a structured JSON: `{ flagged: boolean, claims: [{ claim, assessment, correction? }] }`.

### 5.3 Evon LLM — Cultural Sensitivity Prompt
- [ ] Create `src/prompts/culturalSensitivity.ts` — system prompt instructs the LLM to:
  - Analyze the draft for formality violations, humor risks, directness, and honorifics.
  - Use the persona label (if provided) or infer from buffer.
  - Return structured JSON: `{ flagged: boolean, concerns: [{ category, explanation, suggestion }] }`.

### 5.4 Persona Configuration
- [ ] Create `src/services/personaManager.ts`:
  - In-memory store of per-contact persona tags (persisted to AsyncStorage).
  - `getPersona(contactIdentifier?: string): Persona | 'auto'`
  - `setPersona(contactIdentifier: string, persona: Persona): void`
  - Persona type: `'Boss' | 'Client' | 'Elder' | 'Friend' | 'Colleague' | 'Custom'`
- [ ] Create a simple Persona Settings screen (accessible from overlay's ⚙️ menu).
  - List of tagged contacts with their persona labels.
  - Add / edit / remove persona tags.

### 5.5 Combined Modal UI
- [ ] Create `PreSendModal.tsx` — a React Native modal component rendered in the overlay:
  - Displays fact-check concerns (if any) in one section.
  - Displays cultural sensitivity concerns (if any) in another section.
  - Two buttons: **"Send As-Is"** (ignore) and **"Review ✏️"** (return to draft with suggestions).
- [ ] Wire into the injection flow: every call to `injectText()` first routes through `runPreSendChecks()`.
  - If passed → inject immediately.
  - If flagged → show modal, wait for user decision.

### ✅ Phase 5 Checkpoint
- [ ] Type a false fact (e.g., "India got independence in 1950") → Fact-check modal triggers with explanation.
- [ ] Type a casual joke to a persona tagged as "Boss" → Cultural sensitivity modal triggers.
- [ ] Type a false fact AND a casual joke → Combined modal shows both sections.
- [ ] "Send As-Is" → text is injected regardless.
- [ ] "Review" → draft area shows LLM's suggested correction.
- [ ] Type a normal, factual, appropriately-toned message → no modal, clean injection.

---

## Phase 6: Icebreaker Conversation Starters

> **Goal:** When the input field is empty, the ❄️ button generates 3 contextually relevant reply suggestions.

### 6.1 Icebreaker Service (TypeScript)
- [ ] Implement `generateIcebreakers()` in `gnaniEvonLlm.ts`:
  - Send full session buffer to Evon LLM.
  - Prompt instructs: "Based on this conversation, suggest 3 natural, relevant replies or conversation starters. Return as a JSON array of 3 strings."
  - Parse response, return `string[]`.
- [ ] Create `src/prompts/icebreaker.ts` — the system prompt template.

### 6.2 Icebreaker UI
- [ ] ❄️ button on overlay toolbar:
  - **Disabled state** (greyed out) when the input field is not empty.
  - **Enabled state** when input field is empty.
- [ ] On tap → overlay expands to show "Generating suggestions..." loading state.
- [ ] Display 3 suggestions as tappable chips/cards.
- [ ] Tap a suggestion → inject it into the input field.
- [ ] "🔄 Regenerate" button → calls `generateIcebreakers()` again with the same buffer.
- [ ] Suggestions are persona-aware: if a persona is tagged, include it in the prompt so suggestions match the expected tone.

### ✅ Phase 6 Checkpoint
- [ ] Open a WhatsApp chat with messages, input field empty → tap ❄️ → 3 relevant suggestions appear.
- [ ] Suggestions reference topics from the actual chat buffer.
- [ ] Tap a suggestion → it appears in the input field.
- [ ] Regenerate → 3 new, different suggestions.
- [ ] With persona "Boss" → suggestions are appropriately formal.
- [ ] Input field has text → ❄️ button is disabled/greyed.

---

## Phase 7: Integration Testing & Hardening

> **Goal:** End-to-end testing, edge cases, and polish.

### 7.1 End-to-End Flows
- [ ] Full flow: Voice → Transcribe → Rewrite (Tone + Temp) → Fact-Check + Cultural Check → Inject.
- [ ] Full flow: Icebreaker → Select suggestion → Fact-Check + Cultural Check → Inject.
- [ ] Buffer reset on app switch → verify no stale context leaks.
- [ ] Buffer at max capacity (30) → verify FIFO eviction works.

### 7.2 Edge Cases
- [ ] Overlay behavior when keyboard is dismissed.
- [ ] Overlay behavior in landscape mode.
- [ ] AccessibilityService killed by OS → graceful recovery.
- [ ] Network loss mid-API-call → retry/error handling.
- [ ] Very long messages (>500 chars) in buffer → truncation strategy.
- [ ] Empty buffer (new chat, no messages) → all features degrade gracefully.

### 7.3 Privacy & Security
- [ ] Audit: buffer data never written to disk.
- [ ] Audit: API calls use HTTPS.
- [ ] Audit: API keys stored in secure config (not hardcoded).
- [ ] Clear buffer on service disconnect.
- [ ] Accessibility service description clearly explains what data is accessed and why.

### 7.4 Performance
- [ ] Buffer update events are debounced (max 1 per 500ms).
- [ ] Node-tree walking is efficient — bail early if not a chat app.
- [ ] LLM API calls have timeouts (10s default).
- [ ] Overlay rendering doesn't cause frame drops.

### ✅ Phase 7 Checkpoint
- [ ] All Phase 1–6 checkpoints still pass.
- [ ] No crashes on rapid app switching.
- [ ] No data leaks to disk.
- [ ] API failures show user-friendly errors.
- [ ] Performance: overlay stays at 60fps.

---

## Summary — Phase Dependencies

```
Phase 1 (Overlay UI)
    │
    ▼
Phase 2 (Buffer + Accessibility)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 3 (Voice)    Phase 4 (Tone + LLM)
                       │
                       ▼
                   Phase 5 (Interceptors)
                       │
                       ▼
                   Phase 6 (Icebreakers)
                       │
                       ▼
                   Phase 7 (Integration)
```

> **Note:** Phase 3 (Voice) is independent of Phases 4–6 and can be developed in parallel with Phase 4 once Phase 2 is complete.
