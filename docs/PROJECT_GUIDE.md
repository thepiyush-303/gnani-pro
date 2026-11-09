# ConvoAI: A Beginner's Guide to the Whole Project

This guide explains what the app does, how its parts fit together, and how data moves through it. It is written for someone who is new to mobile apps, Android, or AI. Technical words are explained the first time they appear.

---

## Table of contents

1. [What ConvoAI is](#1-what-convoai-is)
2. [The big picture](#2-the-big-picture)
3. [Key ideas you need first](#3-key-ideas-you-need-first)
4. [The project folders](#4-the-project-folders)
5. [Part A: The Android side (native code)](#5-part-a-the-android-side-native-code)
6. [Part B: The app screens (React Native)](#6-part-b-the-app-screens-react-native)
7. [Part C: The AI layer](#7-part-c-the-ai-layer)
8. [Data flow: following one message through the app](#8-data-flow-following-one-message-through-the-app)
9. [Feature walkthroughs](#9-feature-walkthroughs)
10. [Design decisions and why](#10-design-decisions-and-why)
11. [Privacy and safety](#11-privacy-and-safety)
12. [Setup, build and run](#12-setup-build-and-run)
13. [Testing](#13-testing)
14. [Glossary](#14-glossary)

---

## 1. What ConvoAI is

ConvoAI is an Android app that helps people write and speak messages inside **WhatsApp**. It floats a small bubble over a chat. Tap the bubble and a toolbar opens with buttons:

| Button | What it does |
|---|---|
| ✨ Improve | Rewrites what you typed so it fits the conversation's tone |
| 🌐 Translate | Translates what you typed into English or Hindi |
| 💬 Smart replies | Suggests three replies to the last message |
| 🎙 Dictate | Turns your speech into text in the message box |
| 🗣 Voice note | Records you, then speaks your words back in a chosen voice and sends it |

It is built for Indian users, so it understands Hinglish (Hindi written in English letters), Hindi, and eight other Indian languages. It is also a hackathon project for the Gnani AI internship, so it uses Gnani's speech services.

---

## 2. The big picture

The app has **three layers**. Think of them as three people working together:

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: ANDROID NATIVE  (Kotlin)                           │
│  "The eyes and hands". Reads WhatsApp's screen, draws the    │
│  bubble and toolbar, records the microphone, types text.     │
│  Folder: modules/indic-context/android/                      │
└───────────────┬──────────────────────────────▲───────────────┘
                │ events (new text, button taps)│ commands (show card,
                │                               │  insert text, ...)
┌───────────────▼──────────────────────────────┴───────────────┐
│  LAYER 2: BRIDGE  (the "phone line" between Kotlin and JS)   │
│  IndicContextModule.kt  <──>  modules/indic-context/src/     │
│  index.ts                                                    │
└───────────────┬──────────────────────────────▲───────────────┘
                │                               │
┌───────────────▼──────────────────────────────┴───────────────┐
│  LAYER 3: APP  (React Native + TypeScript)                   │
│  "The brain and the screens". Home screen, tutorial, AI      │
│  logic, calls to Gemini and Gnani's APIs.                    │
│  Folders: app/, src/                                         │
└──────────────────────────────────────────────────────────────┘
```

**Why three layers?** Some jobs only Android can do, such as drawing over other apps and reading another app's screen. Those are written in Kotlin. Screens and most logic are easier to write in TypeScript with React Native, so that's the second layer. The bridge connects them.

---

## 3. Key ideas you need first

### 3.1 Android permissions and services
Android locks each app into a sandbox. To do special things, an app asks for a **permission**. ConvoAI needs three:

- **Display over other apps** (`SYSTEM_ALERT_WINDOW`): lets the bubble float on top of WhatsApp.
- **Accessibility service**: a special Android feature meant for screen readers. It can read text on other apps' screens. ConvoAI uses it to read the open chat. Android hides it for sideloaded apps until the user allows "restricted settings".
- **Microphone** (`RECORD_AUDIO`): for dictation and voice notes.

### 3.2 React Native
React Native lets you write one app in JavaScript/TypeScript that becomes a real Android screen. You write components such as `<View>` and `<Text>`, and React draws them. **Expo** is a toolkit on top of React Native that handles setup and builds.

### 3.3 Native modules
When JavaScript needs something only Android can do, you write a **native module**: Kotlin code exposed to JavaScript as functions. ConvoAI's native module is called `indic-context`.

### 3.4 Events and promises
- **Event**: "something happened, tell whoever is listening". Example: the native side emits `onActionTriggered` when the user taps ✨.
- **Promise / async**: "do this slow thing and tell me when it's done". Example: asking Gemini for a rewrite takes a second or two.

### 3.5 LLM (Large Language Model)
An LLM is an AI that reads text and writes text. ConvoAI sends it a prompt, which is a message containing instructions plus the chat, and gets back an answer. ConvoAI uses **Google Gemini** (model `gemini-3.5-flash-lite`) for this.

### 3.6 STT and TTS
- **STT (Speech-to-Text)**: turns recorded speech into text. ConvoAI uses **Gnani Prisma**.
- **TTS (Text-to-Speech)**: turns text into spoken audio. ConvoAI uses **Gnani Timbre v3.0**.

---

## 4. The project folders

```
gnani-pro/
├── app/                      Screens (Expo Router: each file = one screen)
│   ├── _layout.tsx           Root layout: fonts, theme, wraps everything
│   ├── index.tsx             Home screen
│   └── onboarding.tsx        Interactive tutorial
│
├── src/                      Shared logic and UI, no screens here
│   ├── hooks/
│   │   ├── CopilotBridge.tsx   Handles every event from the overlay
│   │   └── usePermissions.ts   Checks and requests the 4 permissions
│   ├── services/
│   │   ├── aiFeatures.ts       Improve, Smart replies, Translate
│   │   ├── gnaniEvonLlm.ts     Tone guard, fact check, catch-up summary
│   │   ├── onboardingStore.ts  Remembers if the tutorial was finished
│   │   ├── reminders/          ⏰ Deadline reminders (cue filter, AI extraction, detector)
│   │   └── llm/
│   │       ├── llmClient.ts    The ONE function that talks to AI providers
│   │       ├── chatPayload.ts  Builds the chat data sent to the AI
│   │       └── prompts.ts      The written instructions given to the AI
│   ├── types/context.ts      Shared data shapes (TypeScript types)
│   ├── ui/                   Design system (colours, fonts, cards, motion)
│   │   ├── theme.ts          Colours, spacing, fonts
│   │   ├── components.tsx    Reusable pieces: Card, Tile, Chip, buttons
│   │   ├── motion.tsx        Animations (respects "remove animations")
│   │   ├── VoicePicker.tsx   Voice list with ▶ samples
│   │   ├── RemindersSection.tsx  Home's ⏰ Reminders section
│   │   └── tutorial/ToolbarDemo.tsx  The practice chat in the tutorial
│   └── utils/                Small helpers (names, sanitising, constants)
│
├── modules/indic-context/    The native Android module (our own library)
│   ├── src/index.ts          The JavaScript face of the native module
│   └── android/src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/indiccontext/   The Kotlin code (see Part A)
│       └── res/                     Layouts, icons, colours, fonts
│
├── scripts/                  Helper scripts (icon generator, prompt tests)
├── docs/                     Design notes and progress logs
├── DESIGN.md                 The visual design rules (colours, fonts, spacing)
├── app.json                  App name, icon, Android settings
├── package.json              Project commands (npm run ...)
├── .env                      Secret API keys (never commit this)
└── android/                  Generated Android project (created by Expo)
```

**Rule of thumb:** if it touches the screen of another app, it's in `modules/indic-context/android`. If it's a screen you can see in ConvoAI itself, it's in `app/`. If it talks to an AI, it's in `src/services/`.

---

## 5. Part A: The Android side (native code)

All Kotlin files are in `modules/indic-context/android/src/main/java/com/indiccontext/`.

### 5.1 The files and their jobs

| File | Job | Plain-English summary |
|---|---|---|
| `ChatAccessibilityService.kt` | Reads WhatsApp | Watches WhatsApp's screen. Decides when a chat is open, collects visible messages, works out who sent each one and when. |
| `SessionBuffer.kt` | Remembers messages | A short in-memory list (max 30) of the messages on screen. Never saved to disk. |
| `ChatBubble.kt` | One message | The data shape of one message: text, sender, time. |
| `ChatDates.kt` | Reads dates | Turns labels like "Yesterday" or "1 October 2026" into real dates. |
| `OverlayService.kt` | Draws the UI | Draws the bubble and toolbar over WhatsApp. Handles drag, tap, and hold-and-glide. |
| `GlideMenu.kt` | Pick-a-value menu | The popup list you reach by holding a button and sliding your finger. |
| `OverlayFonts.kt` | Fonts | Applies the Poppins font to overlay text. |
| `VoiceRecorder.kt` | Records audio | Records the microphone to an `.m4a` file. |
| `VoiceChangerController.kt` | Voice-note flow | Record → transcribe → re-speak → ready card → send. |
| `VoicePreviewPlayer.kt` | Voice samples | Plays the short sample for each voice. |
| `GnaniSttClient.kt` | Speech to text | Sends audio to Gnani Prisma, gets text back. |
| `GnaniTtsClient.kt` | Text to speech | Sends text to Gnani Timbre, gets audio back. |
| `WhatsAppAutoSender.kt` | Sends the voice note | Selects the open chat in WhatsApp's share screen and taps Send (with safety checks). |
| `IndicContextModule.kt` | The bridge | Every function JavaScript can call, and every event sent back. |
| `IndicFileProvider.kt` | File sharing | Lets WhatsApp read the generated voice note file. |
| `ReminderStore.kt` | Saves reminders | The only thing ConvoAI writes to disk: reminders (task, chat, times) and which messages were already checked. |
| `ReminderTimes.kt` | When to remind | "30 min before", or 9 AM for "by Monday". Unit-tested. |
| `ReminderScheduler.kt` | Sets alarms | Asks Android's AlarmManager to wake the app at the remind time. |
| `ReminderReceiver.kt` | Shows the notification | Posts "⏰ {task}" with ✓ Done / Snooze, and re-arms alarms after a reboot. |

### 5.2 Deciding when to show the bubble

This is the most important native rule. The bubble appears **only inside a WhatsApp chat room**. Here's how the app decides:

1. Android tells `ChatAccessibilityService` whenever a window changes (a new screen opens, a keyboard appears, scrolling happens).
2. The service looks at the active window and asks: *does it have the chat header (`conversation_contact_name`) AND the message box (`entry`)?*
3. If yes → show the bubble just above the message box.
4. If no (home screen, status, search, another app, the share screen) → hide the bubble and close any open card.

Older versions tried to use the keyboard to decide this. That was unreliable, so it was removed.

### 5.3 Reading messages from the screen

WhatsApp doesn't offer an API, so the app reads what's drawn on screen:

- **Message text** comes from WhatsApp's `message_text` fields.
- **Who sent it**: a row with the delivery-tick icon (`status`) was sent by you. Otherwise the app checks where the bubble sits on screen (left = them, right = you). If unclear, the message is marked "unknown" and dropped, so the AI is never given guessed senders.
- **When it was sent**: the time comes from each bubble (`date`). The day comes from the date divider such as "Yesterday", or from the chat list when no divider is visible.
- **Order**: messages are kept in on-screen order. Scrolling up adds older messages to the front of the list (`SessionBuffer.mergeVisible`).

### 5.4 Drawing the bubble and toolbar

`OverlayService` is an Android **foreground service**, which means Android knows it's doing something important and keeps it alive. It adds views to the `WindowManager`, which is the layer where things float over other apps.

- The **bubble** is 48 dp (density-independent pixels) with the mascot inside.
- The **toolbar** is a 52 dp bar. Its buttons are icons drawn from vector files in `res/drawable/`.
- Dragging the bubble saves its height (`overlay_y_frac`) and its edge (`overlay_edge`) in local storage, so it stays where you left it.
- Touching anywhere outside the toolbar closes it (`FLAG_WATCH_OUTSIDE_TOUCH`), except while recording or processing.
- **Hold and glide**: the button notices a long press (about 320 ms), opens a `GlideMenu`, and then tracks your finger. The item under your finger is highlighted, and when you lift, that item is picked.

### 5.5 Recording and playing audio

- `VoiceRecorder` uses Android's `MediaRecorder` to record AAC audio at 16 kHz, mono, 30 seconds max.
- `VoicePreviewPlayer` and `VoiceChangerController` use `MediaPlayer` to play audio.
- `MediaActionSound` plays the start and stop chimes, like WhatsApp does.

### 5.6 Sending text and voice notes

- **Inserting text** (`injectText`): the accessibility service finds the message box and sets its text, with a clipboard-paste fallback.
- **Sending a voice note**: the file is shared with WhatsApp through Android's share sheet (`ACTION_SEND`). `WhatsAppAutoSender` then looks for the chat's name in WhatsApp's picker, selects it only if there's exactly one match, and taps Send. If anything looks wrong, it stops and leaves the choice to you.

---

## 6. Part B: The app screens (React Native)

### 6.1 How screens are organised

`app/` uses **Expo Router**. Every file in `app/` becomes a screen:

- `app/_layout.tsx`: the wrapper around every screen. It loads fonts, sets up the theme, and provides `CopilotBridgeProvider` (described below).
- `app/index.tsx`: the Home screen.
- `app/onboarding.tsx`: the tutorial.

### 6.2 The CopilotBridge: one place for every native event

`src/hooks/CopilotBridge.tsx` listens to all native events. It's placed at the top of the app, so ✨ and 💬 keep working whichever screen is open. It:

- keeps track of the current chat name, the number of messages read, and whether ConvoAI is on;
- handles `onActionTriggered` for `improve`, `translate` and `smart_replies`;
- shows results back on the overlay with `showSmartReplies` or `showAiError`.

**Important rule:** the AI is only called when the user taps a button. Receiving a new message never triggers an AI call. This saves the free quota and avoids surprise popups.

### 6.3 Home screen (`app/index.tsx`)

Built as a **bento** layout (cards of different sizes, like a Japanese bento box):

1. **Hero card**: the mascot, the app name, the on/off switch and a status label.
2. **Setup checklist** (until all permissions are granted): each permission with a Grant button.
3. **Your settings**: two tiles, *Speech language* and *Voice notes*. Tapping one opens its picker.
4. **Current chat**: the chat name and the **Catch-up summary** button (the only AI call on this screen).
5. **How it works**: short feature cards.

### 6.4 The tutorial (`app/onboarding.tsx`)

Seven steps, each one animated:

1. Welcome
2. **Try it**: a practice chat (`ToolbarDemo.tsx`) where you tap the bubble and try each button. Everything is simulated, so no AI or network is used.
3. **Choose your voice**: six voices with ▶ samples.
4–6. Permissions, one at a time, with live status. The icon pulses until granted.
7. All set.

### 6.5 Shared design system (`src/ui/`)

- `theme.ts`: colours (from `DESIGN.md`), spacing (4, 8, 12, 16, 24, 32, 48), corner radii (4, 8, 12) and fonts. Light and dark themes follow the phone's setting.
- `components.tsx`: `Card`, `Tile`, `Chip`, `PrimaryButton`, `PermissionRow`, `StatusPill`.
- `motion.tsx`: `FadeIn`, `Pulse`, `Pop`. All of them switch off when the phone's "remove animations" option is on.

### 6.6 The bridge (`modules/indic-context/src/index.ts`)

This file is the JavaScript face of the native module. Each exported function is a call into Kotlin, for example:

```ts
IndicContext.showSmartReplies(title, subtitle, replies)   // JS → Kotlin: show a card
IndicContext.injectText(text)                             // JS → Kotlin: type into WhatsApp
IndicContext.addActionTriggeredListener(handler)          // Kotlin → JS: a button was tapped
```

---

## 7. Part C: The AI layer

Everything AI-related is in `src/services/`. It's built in three small pieces.

### 7.1 `llmClient.ts`: one door to the AI

Every AI request goes through `callLlm()`. This file:

- chooses the **provider**: Gemini by default, or Evon (any OpenAI-compatible service), selected by `EXPO_PUBLIC_LLM_PROVIDER` in `.env`;
- sets a **time budget** (15 seconds total, shared across retries);
- retries once on "too many requests" (429) or "overloaded" (503) errors;
- turns failures into a typed `LlmError` with a kind: `timeout`, `http`, `network`, `empty`, `blocked` or `parse`. The UI shows a friendly message for each one;
- extracts JSON from the reply (`callLlmJson`). The AI is asked for JSON, but sometimes wraps it in extra text, so the code finds the `{ ... }` part.

**Why no fallback answers?** An early version fell back to canned phrases when the AI failed. Users then saw the same generic replies and never knew the AI had failed. Now a failure shows an error card with a Retry button.

### 7.2 `chatPayload.ts`: what the AI is shown

The AI receives the chat as structured data, not a blob of text:

```json
{
  "now": "2026-11-08 10:30 (Sun)",
  "since_last_message": "2 hours",
  "contact_name": "Ravi",
  "conversation": [
    { "sender": "contact", "text": "kal ka plan pakka?", "sent": "2026-11-07 18:20 (Sat, yesterday)" },
    { "sender": "user",    "text": "haan, 5 baje" }
  ],
  "draft": "i can come tomorrow evening"
}
```

Why this shape? The AI has to know **who said what** and **when**, so it can tell that "tomorrow" said yesterday is today. The app keeps the last 15 messages and drops any message whose sender is unknown. Phone numbers are masked before they leave the phone (`sanitizer.ts`).

### 7.3 `prompts.ts`: the instructions

Each feature has a written instruction (a "system prompt") that tells the AI its role, its rules and the exact JSON shape to reply with. For example, the translation prompt says: keep the meaning, keep the tone, keep names and numbers, write Hindi only in Devanagari script.

The AI is **never told the relationship** ("boss", "friend") in advance. It infers it from the conversation, which avoids stereotypes.

### 7.4 `aiFeatures.ts`: the features themselves

| Function | Used by | What it does |
|---|---|---|
| `generateSmartReplies` | 💬 button | Returns three replies to the last message |
| `improveText` | ✨ button | Rewrites the draft; keeps all facts; removes filler words the user never uses |
| `translateText` | 🌐 button | Translates to English or Hindi (Devanagari); checks the script before accepting |
| `isMeaningfulDraft` | ✨ and 🌐 | Blocks very short input such as "ok" so no AI call is made |

**Output guards:** the AI sometimes adds a time or name that wasn't in the chat. Code checks each suggestion and drops any that contain numbers not present in the conversation.

### 7.5 `gnaniEvonLlm.ts`: other features
Tone guard (flags rude wording), fact check (finds contradictions with earlier messages) and catch-up summary (used on Home). Each one reuses the same payload and client.

---

## 8. Data flow: following one message through the app

This section traces real journeys step by step.

### 8.1 Journey 1: "Reading the chat" (automatic, no AI)

```
1. You open a WhatsApp chat.
2. Android sends a window-changed event to ChatAccessibilityService.
3. The service checks: header + message box present?  → yes
4. OverlayService.showOverlay() draws the bubble above the message box.
5. The service walks the screen, collects visible message rows,
   works out sender + time, and merges them into SessionBuffer (max 30).
6. SessionBuffer emits "onBufferUpdated" to JavaScript.
7. CopilotBridge stores the chat name and the message count.
   No AI is called.
```

### 8.2 Journey 2: "Improve my draft" (✨)

```
1. You type "i can come tomorrow evening" and tap the bubble, then ✨.
2. OverlayService reads the text from the message box and emits
   onActionTriggered { action: "improve", draftText: "..." }.
3. CopilotBridge receives the event.
   a. Is the draft empty?            → show "Type a message first" card, stop.
   b. Is it too short (isMeaningfulDraft)? → show "too short" card, stop.
4. CopilotBridge gets the last 15 messages from getSessionBuffer().
5. aiFeatures.improveText() builds the payload (chatPayload.ts)
   and sends it with the improve prompt (prompts.ts).
6. llmClient.callLlm() calls Gemini over HTTPS.
7. The JSON reply is checked (callLlmJson + output guards).
8. CopilotBridge calls showSmartReplies(title, note, [improved, alt1, alt2]).
9. OverlayService draws a card above the toolbar with three tappable chips.
10. You tap a chip → injectText() types it into the message box.
```

### 8.3 Journey 3: "Translate" (🌐)

Same path as Journey 2, with two differences:
- the native side sends the **target** language from `translate_target` (chosen by hold-and-glide);
- the result **replaces** the text in the message box with `injectText`, and a toast confirms it.

### 8.4 Journey 4: "Send a voice note" (🗣)

```
1. Tap 🗣. Button turns red and shows a timer. Start chime plays.   [Kotlin]
2. Tap again. Stop chime plays. VoiceRecorder saves the audio file.  [Kotlin]
3. GnaniSttClient posts the file to Gnani Prisma → transcript text.  [Kotlin → Gnani]
4. The transcript is passed to GnaniTtsClient with the chosen voice
   → Gnani Timbre returns an Ogg/Opus audio file.                    [Kotlin → Gnani]
5. Ready card: "✅ Ready in Lakshmi's voice" with Send / Play / Other voice.
6. Tap Send → IndicFileProvider gives WhatsApp a content URI for the file.
7. ACTION_SEND opens WhatsApp's share picker.
8. WhatsAppAutoSender selects the open chat (only if exactly one match)
   and taps Send. If unsure, it stops and leaves the choice to you.
```

### 8.5 Journey 5: "Home screen" (no chat open)

```
1. The app opens. Home asks the native module for the status of the
   four permissions (usePermissions, checked every 2 seconds).
   Notifications are optional: only ⏰ reminders need them.
2. It reads saved settings: language, voice, and whether ConvoAI is on
   (isCopilotActive).
3. Changing a setting calls setLanguage / setVoice, which saves it in
   the phone's local preferences. The running overlay reads the same
   preference, so the change takes effect straight away.
```

### 8.6 Journey 6: "Remind me" (⏰, automatic but filtered)

```
1. A buffer update reaches CopilotBridge → commitmentDetector.onBuffer().
2. After 3 s of quiet, it keeps messages that are recent (≤ 2 days),
   have a known sender and date, and match hasDeadlineCue()
   ("by 6 PM", "kal tak", "Monday", "5 बजे" …). No AI so far.
3. claimMessages() drops anything already checked before.
4. ONE AI call (COMMITMENTS_SYSTEM_PROMPT) returns items like
   {owed_by: "user", task: "Send update to Mr. Sharma", due: "…T18:00"}.
5. Only "user"/"both" + high confidence → addReminder() (native):
   saved, alarm set, "⏰ Reminder set" card with ↩ Undo.
6. At the remind time, ReminderReceiver posts the notification.
```
Details and limits: `docs/REMINDERS.md`.

### 8.7 The data-flow diagram (one-page view)

```
             ┌──────────── WhatsApp screen ────────────┐
             │  messages, message box, share picker     │
             └───────▲──────────────────────┬──────────┘
        read text, sender, time            │ type text / share file
                     │                      │
          ChatAccessibilityService   WhatsAppAutoSender / injectText
                     │                      ▲
              SessionBuffer (RAM)           │
                     │                      │
          OverlayService ◄── taps ── bubble / toolbar / cards
                     │                      ▲
          onActionTriggered          showSmartReplies / showAiError
                     │                      │
          ┌──────────▼──────────────────────┴──────────┐
          │   CopilotBridge (JavaScript)              │
          │   payload → prompt → llmClient             │
          └──────────┬──────────────────────▲─────────┘
                     │ HTTPS                 │ JSON reply
             ┌───────▼───────┐       ┌───────┴───────┐
             │ Gemini (LLM)  │       │ Gnani Prisma  │ (STT)
             └───────────────┘       │ Gnani Timbre  │ (TTS)
                                     └───────────────┘
```

---

## 9. Feature walkthroughs

| Feature | Where it starts | Where it runs | Uses the internet? |
|---|---|---|---|
| Bubble only in chats | `ChatAccessibilityService.chatRoomInputBounds` | Native | No |
| Remember bubble position | `OverlayService.snapToNearestEdge` | Native | No |
| Improve (✨) | Toolbar → CopilotBridge → aiFeatures | Native + JS + Gemini | Yes (Gemini) |
| Translate (🌐) | Toolbar → CopilotBridge → aiFeatures | Native + JS + Gemini | Yes (Gemini) |
| Smart replies (💬) | Toolbar → CopilotBridge → aiFeatures | Native + JS + Gemini | Yes (Gemini) |
| Dictate (🎙) | Toolbar → VoiceRecorder → GnaniSttClient | Native | Yes (Gnani STT) |
| Voice note (🗣) | VoiceChangerController | Native | Yes (Gnani STT + TTS) |
| Voice sample (▶) | VoicePreviewPlayer | Native | Yes, once per voice |
| Catch-up summary | Home → gnaniEvonLlm | JS + Gemini | Yes (Gemini) |
| Deadline reminders (⏰) | CopilotBridge → commitmentDetector → ReminderScheduler | JS + Gemini + Native alarms | Only for messages that mention a time/day |
| Tutorial | app/onboarding.tsx | JS only | No |
| Language / voice settings | Home tiles → IndicContext.setLanguage / setVoice | JS → Native prefs | No |

---

## 10. Design decisions and why

| Decision | Why |
|---|---|
| Native Kotlin for overlay and screen reading | Android only allows these through its own APIs |
| React Native for screens | Faster to design and to change than native screens |
| AI only on button taps | Saves the free-tier quota and avoids surprise popups |
| …except ⏰ deadline detection, filtered | A phone-side check sends only messages that mention a time or day, once each. Can be turned off |
| No canned fallback replies | Users must know when the AI failed. Failures show a Retry card |
| No persona buckets (boss/friend) | Guessing relationships from names is unreliable. The AI infers from conversation |
| Messages kept only in RAM | Privacy: chat messages are never written to disk (only the reminders you get are) |
| Unknown senders dropped | Better to show less than to show the AI a wrong speaker |
| Validation after every AI reply | Models sometimes invent times, names or wrong scripts. Code checks before the user sees it |
| Voice notes via the share sheet | An overlay can't attach a file to a chat directly |
| Dates resolved on the phone | Labels like "Yesterday" are relative, so they're turned into real dates when read |
| Bento design with DESIGN.md tokens | One visual source of truth, so every screen looks consistent |

---

## 11. Privacy and safety

- **Accessibility permission is powerful.** ConvoAI reads only the open WhatsApp chat, never other apps. The tutorial explains this in plain words.
- **Chats are never stored.** Messages live in a 30-item list in memory and are lost when the app closes. The only things saved on the phone are the ⏰ reminders ConvoAI sets (short task, chat name, times).
- **Only what you ask about is sent.** The AI sees the chat when you tap ✨, 💬, 🌐 or Catch-up, and, for ⏰ reminders, when a new message mentions a time or day (one call per batch; switch off on Home). Phone numbers are masked first.
- **Secrets:** API keys sit in `.env`, which is git-ignored. **Caution:** keys set with the `EXPO_PUBLIC_` prefix are built into the app, so a shared APK can reveal them. Before public release, route AI calls through a server.
- **No automatic sending.** Voice notes go through WhatsApp's own share screen, and the auto-selector only acts when there is exactly one matching chat.

---

## 12. Setup, build and run

### 12.1 One-time setup
1. Install Node.js, Android Studio (for the SDK) and a USB-connected Android phone with developer mode on.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the Gemini and Gnani keys.

### 12.2 Daily development
| Goal | Command |
|---|---|
| Develop over USB (works on mobile data) | `npm run start:usb`, then `npm run android:usb` in a second terminal |
| Install a fresh dev build over USB | `npx expo run:android` |
| Make a shareable APK | `npm run build:apk:share` → `android/app/build/outputs/apk/release/app-release.apk` |
| Type check | `npx tsc --noEmit` |
| Native unit tests | `cd android && ./gradlew :indic-context:testDebugUnitTest` |
| Check AI prompts against the live model | `npm run eval:prompts` |

### 12.3 Dev build vs. shareable build
- **Dev build**: JavaScript loads from your computer (Metro), so changes appear in seconds.
- **Shareable build**: JavaScript is packed inside the APK and works without a computer.

### 12.4 Enabling the features on a phone
1. Open ConvoAI and grant the three required permissions (plus Notifications for ⏰ reminders).
2. On Android 13 and newer, sideloaded apps need *App info → ⋮ → Allow restricted settings* before Accessibility can be turned on.
3. Turn the assistant on, then open a WhatsApp chat.

---

## 13. Testing

| Test | What it checks | Where |
|---|---|---|
| Date parsing unit tests | "Yesterday", "1 October 2026", 12h and 24h times | `modules/indic-context/android/src/test/` |
| Reminder time unit tests | Lead time, 9 AM rule, past deadlines | `ReminderTimesTest.kt` |
| Type checking | Mistakes in TypeScript | `npx tsc --noEmit` |
| Prompt evaluation | Real AI answers for known cases: formal vs. banter, Hinglish conversion, no invented times, date handling, ⏰ deadline extraction | `scripts/evalPrompts.ts` (calls the live API, so it uses quota) |
| On-device checks | Bubble visibility, toolbar closing, card placement, voice flow | Checklist in `docs/UI_REDESIGN.md` |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **APK** | The installable Android app file |
| **Accessibility service** | Android feature for reading other apps' screens (used here to read chats) |
| **Bridge** | The connection between Kotlin and JavaScript (`IndicContextModule`) |
| **Bento layout** | A design where cards of different sizes form a grid, like a bento box |
| **Dev build** | A debug app that loads its JavaScript from a development server |
| **Event** | A message saying "something happened" (e.g. a button was tapped) |
| **Expo** | A toolkit that makes React Native projects easier to build |
| **Foreground service** | A background task Android promises to keep alive, shown with a notification |
| **Gemini** | Google's AI model family, used here for text rewriting and replies |
| **Gnani Prisma / Timbre** | Gnani's speech-to-text and text-to-speech services |
| **Glide menu** | A popup you open by holding a button and sliding your finger |
| **JSON** | A plain-text format for structured data, e.g. `{"key": "value"}` |
| **LLM** | Large Language Model: an AI that reads and writes text |
| **Metro** | The development server that serves JavaScript to the app while developing |
| **Native module** | Kotlin code exposed to JavaScript |
| **Permission** | A user-approved right an app needs, such as drawing over other apps |
| **Prompt** | The instructions and data sent to an AI |
| **RAM buffer** | Data kept in memory only, lost when the app stops |
| **Session buffer** | The short in-memory list of messages read from the chat |
| **STT / TTS** | Speech-to-Text / Text-to-Speech |
| **Toolbar** | The row of action buttons that opens from the bubble |
| **WindowManager** | The Android system that places views over other apps |
