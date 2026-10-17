# Product Requirements Document (PRD)

## IndicContext Assistant — Contextual Communication Copilot

**Version:** 2.0  
**Last Updated:** 2026-10-17  
**Status:** Draft — Awaiting Approval

---

## 1. Executive Summary

IndicContext Assistant is a floating overlay copilot for Android that sits **above** the user's stock keyboard (via `SYSTEM_ALERT_WINDOW`). It provides real-time communication assistance by reading the visible chat context through Android's `AccessibilityService`, buffering it in memory, and routing it to the **Gnani Evon LLM** for intelligent features: tone rewriting, fact-checking, cultural sensitivity analysis, and icebreaker suggestions. Voice input is powered by **Gnani Prisma V2.5 STT** with native code-switching support for English, Hindi, and Hinglish.

---

## 2. Problem Statement

### 2.1 Tone Anxiety
Users frequently second-guess the tone of their messages — "Is this too casual for my boss?", "Does this sound rude?" — leading to communication paralysis, especially in professional and cross-cultural contexts.

### 2.2 Cross-Cultural Communication Gaps
India's linguistic diversity means a single user may switch between English, Hindi, and Hinglish within one conversation. Cultural norms around respect, formality, and humor vary widely between regions, generations, and professional hierarchies. Existing keyboards offer no guardrails.

### 2.3 Misinformation in Real-Time Chat
Users share facts, dates, and statistics in chat without verification. Once sent, corrections are awkward and often ignored. There is no pre-send verification layer in any mainstream keyboard or assistant.

### 2.4 Conversation Starters
Users often stall mid-conversation — especially in professional or unfamiliar social contexts — not knowing how to reply appropriately. Generic "icebreaker" tools lack awareness of the actual conversation flow.

---

## 3. Target Audience

| Segment | Description |
|---|---|
| **Working Professionals** | Employees communicating with seniors, clients, and cross-functional teams across languages and cultural norms. |
| **Students** | College and university students navigating formal communication with professors, placement coordinators, and peers from different regions. |
| **Multilingual Users** | Anyone who code-switches between English, Hindi, and Hinglish in daily messaging and needs tone-safe, context-aware assistance. |
| **Accessibility-Minded Users** | Users who benefit from voice-first input, assisted text composition, and pre-send safety nets. |

---

## 4. Architecture Overview

### 4.1 Overlay Model — `SYSTEM_ALERT_WINDOW`

The app does **not** replace the stock keyboard. It operates as a **floating companion panel** drawn above the keyboard using `SYSTEM_ALERT_WINDOW` permission.

```
┌─────────────────────────────┐
│     Chat Application        │
│  (WhatsApp, Telegram, etc.) │
│                             │
│  ┌───────────────────────┐  │
│  │  Chat Messages        │  │  ◄── AccessibilityService reads these
│  │  (visible TextViews)  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  Input Field           │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  IndicContext Overlay  │  │  ◄── SYSTEM_ALERT_WINDOW (our UI)
│  │  [🎤] [Tone] [❄️ Ice] │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  Stock Keyboard        │  │  ◄── User's chosen keyboard (Gboard, etc.)
│  │  (Gboard / Samsung)   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**Text Injection Strategy:** The overlay injects finalized text into the target app's input field via the `AccessibilityService`'s `ACTION_SET_TEXT` on the focused `EditText` node. Clipboard-paste is the fallback if `ACTION_SET_TEXT` is not supported by the host app.

### 4.2 The In-Memory Session Buffer

Android's `AccessibilityService` can only read **currently visible** screen nodes. It has no historical memory. To provide the Evon LLM with conversation context, we implement an **In-Memory Session Buffer** on the native (Kotlin) side.

#### Buffer Specification

| Property | Value |
|---|---|
| **Data Structure** | Bounded `ArrayDeque<ChatBubble>` (ring buffer) |
| **Max Capacity** | 30 messages |
| **Eviction Policy** | FIFO — oldest message is dropped when the 31st arrives |
| **Storage** | In-memory only (no disk persistence) |
| **Lifecycle** | Tied to the `AccessibilityService` lifecycle; cleared on service disconnect or app switch |
| **Session Boundary** | Buffer resets when the user switches to a different chat/app (detected by `packageName` or window root change) |

#### Chat Bubble Data Model

```kotlin
data class ChatBubble(
    val text: String,
    val isSelf: Boolean,          // true = user's own message, false = other party
    val capturedAtMs: Long,       // System.currentTimeMillis() at capture
    val nodeClassName: String?,   // e.g., "android.widget.TextView"
    val appPackage: String        // e.g., "com.whatsapp"
)
```

#### Capture Flow

1. `ChatAccessibilityService.onAccessibilityEvent()` fires on `TYPE_WINDOW_CONTENT_CHANGED` and `TYPE_VIEW_SCROLLED`.
2. The service walks the current window's accessibility node tree.
3. It identifies `TextView` nodes that match chat-bubble heuristics (child of a `RecyclerView`/`ListView`, contains text, positioned in the message area).
4. New text nodes not already in the buffer are appended.
5. If the buffer exceeds 30 entries, the oldest entry is evicted.
6. The buffer contents are bridged to the React Native TypeScript layer via a `NativeModule` event (`onBufferUpdated`).

#### Heuristic Note

Chat bubble detection is inherently heuristic. Different messaging apps use different view hierarchies. The initial implementation will target **WhatsApp** and **Telegram** with explicit node-tree patterns, with an extensible adapter pattern for adding more apps.

### 4.3 Native ↔ React Native Bridge

| Direction | Mechanism |
|---|---|
| **Kotlin → TypeScript** | `ReactContext.getJSModule(RCTDeviceEventEmitter::class.java).emit(eventName, data)` for streaming buffer updates and accessibility events. |
| **TypeScript → Kotlin** | `@ReactMethod`-annotated functions in a `NativeModule` for commands (start/stop listening, inject text, query buffer). |
| **Overlay Rendering** | The floating overlay view is a React Native root view hosted inside a `WindowManager`-managed `FrameLayout`. |

---

## 5. Core Features

### 5.1 Feature 1 — Multi-Language Voice-to-Text Layer

| Property | Detail |
|---|---|
| **Context Usage** | None |
| **API** | Gnani Prisma V2.5 STT |
| **Languages** | English, Hindi, Hinglish (code-switching) |

#### User Flow

1. User taps the 🎤 (mic) button on the overlay.
2. Audio recording begins via Android `MediaRecorder` / `AudioRecord`.
3. Audio is streamed (or sent as a chunk) to the Gnani Prisma V2.5 STT endpoint.
4. The transcribed text is displayed in the overlay's draft area.
5. User can edit the transcript before injecting it into the input field.

#### Language Determination

- Default language is auto-detected by Prisma's code-switching model.
- User can override via a language picker (EN / HI / Hinglish) on the overlay.

#### Error Handling

- Mic permission denied → show system permission dialog.
- Network unavailable → show inline error, offer retry.
- STT returns empty → show "Couldn't catch that. Try again?" message.

---

### 5.2 Feature 2 — The "Temperature & Tone" Rewrite Engine

| Property | Detail |
|---|---|
| **Context Usage** | **HIGH** — full session buffer sent to Evon LLM |
| **API** | Gnani Evon LLM |

#### Tone Modes

| Tone | Description |
|---|---|
| **Casual** | Friendly, informal, uses contractions and colloquialisms |
| **Polite** | Warm but respectful, avoids slang |
| **Respectful** | Formal, deferential, suitable for elders/seniors |
| **Informative** | Clear, structured, fact-focused (like a mini-briefing) |

#### Temperature Scale (1–5 Discrete Levels)

| Level | Label | Behavior |
|---|---|---|
| **1** | Minimal | Output closely matches raw input length. Sleek, concise. Minor phrasing adjustments only. |
| **2** | Light | Slight expansion. Fixes grammar, improves clarity, adds minimal context. |
| **3** | Balanced | Moderate rewrite. LLM uses buffer context to enrich the message while keeping it natural. |
| **4** | Expanded | Significant expansion. LLM pulls in relevant details from the chat buffer to add depth. |
| **5** | Full Context | Maximum expansion. LLM heavily leverages the entire chat buffer to produce a rich, context-aware response that fits seamlessly into the conversation flow. |

#### User Flow

1. User types a draft in their stock keyboard (text appears in the chat app's input field).
2. User taps the "Tone" button on the overlay.
3. Overlay expands to show: Tone selector (4 options) + Temperature slider (1–5).
4. User selects tone + temperature and taps "Rewrite".
5. The app reads the draft from the input field (via AccessibilityService), combines it with the session buffer, and sends to Evon LLM.
6. Rewritten text appears in the overlay's preview area.
7. User taps "Accept" to inject the rewritten text back into the input field, or "Discard" to keep the original.

#### Prompt Engineering (Summary)

```
System: You are a communication assistant. You will be given:
1. A conversation history (up to 30 messages).
2. The user's raw draft message.
3. A target tone: {tone}.
4. A temperature level: {1-5}.

Rewrite the draft to match the target tone. At temperature 1, keep the output
concise and close to the original length. At temperature 5, heavily expand
using conversation context to add relevant details and nuance.
```

---

### 5.3 Feature 3 — Pre-Send Fact-Checking Modal

| Property | Detail |
|---|---|
| **Context Usage** | **HIGH** — buffer sent for timeline-aware verification |
| **API** | Gnani Evon LLM |

#### Trigger Conditions

Fact-checking activates when the user's draft contains:
- Numerical claims (dates, percentages, statistics)
- Named entities with attributed facts ("Elon Musk founded Tesla")
- Historical or scientific assertions
- References to earlier messages ("As I said last week...")

Detection is performed by the Evon LLM itself as a preliminary classification step.

#### User Flow

1. User finalizes text (via rewrite or direct typing) and taps "Send" / "Inject".
2. **Before injection**, the app sends the draft + buffer to Evon LLM with a fact-checking prompt.
3. If **all facts check out** → text is injected normally. No interruption.
4. If **a fact is flagged** → injection is **halted**. A modal appears:

```
┌──────────────────────────────────────┐
│  ⚠️  Possible Factual Inaccuracy     │
│                                      │
│  "The mentioned fact could be        │
│   possibly wrong."                   │
│                                      │
│  Details: {LLM explanation of what   │
│  seems incorrect and why}            │
│                                      │
│  ┌──────────┐    ┌──────────────┐    │
│  │  Ignore   │    │  Fix It ✏️   │    │
│  └──────────┘    └──────────────┘    │
└──────────────────────────────────────┘
```

5. **"Ignore"** → inject the original text as-is.
6. **"Fix It"** → return focus to the overlay draft area with the LLM's suggested correction pre-filled. User can edit and re-submit.

---

### 5.4 Feature 4 — Cultural & Persona Sensitivity Check

| Property | Detail |
|---|---|
| **Context Usage** | **HIGH** — buffer analyzed for relationship dynamics |
| **API** | Gnani Evon LLM |

#### Persona Configuration (Layered Model)

| Layer | Source | Priority |
|---|---|---|
| **Auto-Detect** (default) | LLM infers the relationship dynamic from the chat buffer's tone, language, and content | Lowest — always active as baseline |
| **Per-Contact Override** | User manually tags a contact with a persona label in the app's settings (e.g., "Boss", "Client", "Elder", "Friend") | Highest — overrides auto-detect |

When the user has tagged a contact, that persona label is included in the LLM prompt. Otherwise, the LLM is instructed to infer the dynamic from the buffer.

#### Sensitivity Categories

- **Formality violations** — overly casual language to a senior/client
- **Humor risks** — jokes/sarcasm that may be misread across cultural contexts
- **Directness calibration** — blunt statements that may seem rude in high-context cultures
- **Honorifics** — missing or incorrect use of respectful address forms (ji, sir, madam, etc.)

#### User Flow

1. Runs **in parallel** with Fact-Check (Feature 3) at the pre-send stage.
2. If the draft is flagged → a sensitivity alert appears (merged with any fact-check alert into a single combined modal):

```
┌──────────────────────────────────────┐
│  🤝  Cultural Sensitivity Notice      │
│                                      │
│  Persona: {Boss / Client / Auto}     │
│                                      │
│  "{Your joke about deadlines might   │
│   come across as dismissive to a     │
│   senior colleague in a formal       │
│   setting.}"                         │
│                                      │
│  ┌──────────┐    ┌──────────────┐    │
│  │  Ignore   │    │  Fix It ✏️   │    │
│  └──────────┘    └──────────────┘    │
└──────────────────────────────────────┘
```

3. If **both** Fact-Check and Cultural Sensitivity trigger, they are merged into a **single combined modal** with sections for each concern.

---

### 5.5 Feature 5 — "Icebreaker" Conversation Starters

| Property | Detail |
|---|---|
| **Context Usage** | **HIGH** — entire buffer sent |
| **API** | Gnani Evon LLM |

#### Trigger Condition

- The chat app's input field is **empty** (detected via AccessibilityService node inspection).
- User taps the ❄️ "Icebreaker" button on the overlay.

#### User Flow

1. User is stuck — doesn't know how to reply.
2. Taps the ❄️ button.
3. Entire session buffer is sent to Evon LLM with an icebreaker prompt.
4. LLM returns **3 suggested replies/conversation starters**.
5. Suggestions appear as tappable chips in the overlay:

```
┌───────────────────────────────────┐
│  ❄️  Suggested Replies             │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ "That's a great point! How  │  │
│  │  did the meeting go after?" │  │
│  └─────────────────────────────┘  │
│  ┌─────────────────────────────┐  │
│  │ "I was thinking about this  │  │
│  │  too — maybe we should..." │  │
│  └─────────────────────────────┘  │
│  ┌─────────────────────────────┐  │
│  │ "By the way, did you get a  │  │
│  │  chance to look at the...?" │  │
│  └─────────────────────────────┘  │
│                                   │
│         [🔄 Regenerate]           │
└───────────────────────────────────┘
```

6. User taps a suggestion → it's injected into the input field.
7. User can also tap "Regenerate" for 3 new suggestions.

---

## 6. Pre-Send Interceptor Pipeline

Features 3 and 4 both act as interceptors before text injection. They run as a **parallel pipeline**:

```
User taps "Inject / Send"
         │
         ├──── [Fact-Check Service]  ──────┐
         │                                 │
         └──── [Cultural Sensitivity]  ────┤
                                           │
                                    ┌──────▼──────┐
                                    │   Merger     │
                                    │  (await all) │
                                    └──────┬──────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                         Both pass    One flags    Both flag
                              │            │            │
                         Inject text   Show modal   Show combined
                         silently      for one      modal for both
```

#### Combined Modal Layout (when both trigger)

```
┌──────────────────────────────────────┐
│  ⚠️  Pre-Send Review                  │
│                                      │
│  ── Factual Concern ──               │
│  {LLM explanation}                   │
│                                      │
│  ── Cultural Sensitivity ──          │
│  Persona: {label}                    │
│  {LLM explanation}                   │
│                                      │
│  ┌──────────┐    ┌──────────────┐    │
│  │ Send As-Is│    │  Review ✏️   │    │
│  └──────────┘    └──────────────┘    │
└──────────────────────────────────────┘
```

---

## 7. API Dependencies

| API | Provider | Purpose | Auth |
|---|---|---|---|
| **Gnani Prisma V2.5 STT** | Gnani.ai | Speech-to-text with code-switching (EN/HI/Hinglish) | API Key |
| **Gnani Evon LLM** | Gnani.ai | Tone rewrite, fact-check, cultural sensitivity, icebreakers | API Key |

---

## 8. Android Permissions Required

| Permission | Purpose |
|---|---|
| `SYSTEM_ALERT_WINDOW` | Draw floating overlay above other apps |
| `BIND_ACCESSIBILITY_SERVICE` | Read chat screen content, detect input field state, inject text |
| `RECORD_AUDIO` | Capture microphone input for voice-to-text |
| `INTERNET` | Communicate with Gnani APIs |

---

## 9. Non-Goals (Current Stage)

- Full production UI/UX polish and theming.
- iOS support.
- Offline LLM inference.
- End-to-end encryption of buffer data.
- Monetization and subscription logic.
- Support for messaging apps beyond WhatsApp and Telegram in v1.
- Persistent chat history storage (buffer is strictly in-memory).

---

## 10. Success Criteria

| Metric | Target |
|---|---|
| Overlay renders above stock keyboard without flickering | ✅ |
| Buffer correctly captures ≤30 visible chat bubbles on WhatsApp | ✅ |
| Voice-to-text produces transcript within 3s for a 10s utterance | ✅ |
| Tone rewrite at Temperature 1 stays within 120% of original length | ✅ |
| Tone rewrite at Temperature 5 expands with relevant buffer context | ✅ |
| Fact-check modal halts injection when a false claim is detected | ✅ |
| Cultural sensitivity warns on formality violations with persona context | ✅ |
| Icebreaker generates 3 contextually relevant suggestions | ✅ |
| Text injection works via `ACTION_SET_TEXT` on WhatsApp and Telegram | ✅ |

---

## 11. Tech Stack Summary

| Layer | Technology |
|---|---|
| **Application Logic** | React Native (TypeScript) |
| **Native Services** | Android (Kotlin) — AccessibilityService, WindowManager, AudioRecord |
| **Native ↔ JS Bridge** | React Native NativeModules + RCTDeviceEventEmitter |
| **STT API** | Gnani Prisma V2.5 |
| **LLM API** | Gnani Evon |
| **Overlay Rendering** | React Native root view inside `WindowManager` `FrameLayout` |

---

## 12. Open Questions / Future Considerations

- **Buffer privacy:** Should the buffer be encrypted in memory? (Deferred to security review.)
- **Multi-window / split-screen:** How does the overlay behave in split-screen mode?
- **Wear OS / tablet:** Any extended form-factor support?
- **Rate limiting:** What are the Gnani API rate limits, and should we implement client-side throttling?
- **Accessibility service consent UX:** How do we guide users through the system accessibility settings toggle in a way that feels trustworthy?
