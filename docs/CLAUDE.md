# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

There are two kinds of Android build. Don't mix them up:

| | Dev build (`assembleDebug`) | Shareable build (`assembleRelease`) |
|---|---|---|
| JavaScript | **Not included.** Loaded live from Metro on your computer | **Bundled inside the APK** |
| Runs without your computer? | No ("There was a problem loading the project" if Metro is unreachable) | Yes |
| Use for | Day-to-day development (fast reload) | Giving the app to others / demos |
| Output | `android/app/build/outputs/apk/debug/app-debug.apk` | `android/app/build/outputs/apk/release/app-release.apk` |

- **Develop over USB (works on any network, including mobile data):**
  1. `npm run start:usb`: sets up `adb reverse tcp:8081` and starts Metro on `localhost`.
  2. `npm run android:usb` (second terminal): opens the installed dev build pointed at `http://localhost:8081`.

  Wi-Fi alternative: `npm start` (tunnel) or `npx expo start --dev-client` with the phone on the **same** Wi-Fi as the computer.
- **Build + install the dev build:** `npm run android` (`expo run:android`), or `npm run build:apk:dev` (alias `build:apk`).
- **Build a shareable APK:** `npm run build:apk:share` (alias `build:apk:release`). It's signed with the debug keystore (`android/app/build.gradle` → `release { signingConfig signingConfigs.debug }`), which is fine for testers and hackathon demos. For the Play Store, create a real keystore.
  - Install: `adb install -r android/app/build/outputs/apk/release/app-release.apk`, or send the file. Testers enable "Install unknown apps", and on Android 13+ use App info → ⋮ → *Allow restricted settings* before turning on Accessibility.
  - ⚠️ `.env` `EXPO_PUBLIC_*` values (Gemini/Gnani keys) are compiled into the APK and can be extracted. Rotate or limit keys before sharing widely.
- **Run on iOS**: `npm run ios` (macOS + Xcode; the overlay features are Android-only).
- **Prebuild native code**: `npx expo prebuild --platform android --no-install` applies `app.json` changes (icons, plugins) to `android/` in place. `npm run prebuild` (`--clean`) regenerates it from scratch.
- **Type checking**: `npx tsc --noEmit`. Native unit tests: `cd android && ./gradlew :indic-context:testDebugUnitTest`.
- **Prompt eval** (live LLM calls): `npm run eval:prompts`.

## Project Structure & Architecture

### High-Level Components

1. **Expo/React Native app (`app/`)**. Theme follows the system (`src/ui/theme.ts`; `expo-system-ui` makes Android honour it).
   - `app/_layout.tsx`: Stack (headers hidden) wrapped in `CopilotBridgeProvider` (`src/hooks/CopilotBridge.tsx`), the **only** place native overlay events are handled. ✨/💬 work whichever screen is open.
   - `app/index.tsx` (Home): status + on/off, permission checklist (`src/hooks/usePermissions.ts`), current chat + Catch-up summary, speech language + default voice (shared with the toolbar's glide menus via the bridge), how-to.
   - `app/onboarding.tsx`: 5-step tutorial (welcome, the 3 permissions with live status including Android 13+ "Allow restricted settings", using the bubble). Shown on first launch (`src/services/onboardingStore.ts`) and from Home.
   - Shared UI: `src/ui/components.tsx`. App icon: `scripts/generateIcons.py` → `assets/*.png` → `app.json` → `npx expo prebuild --platform android`.

2. **Native Android Module (`modules/indic-context/`)**
   - A local Android library packaged as an Expo module (`indic-context` dependency in `package.json`).
   - **OverlayService.kt**: draws the 48dp bubble and the toolbar (vector icons `res/drawable/ic_*.xml`). The bubble shows **only inside a WhatsApp chat room**, just above the message box. The toolbar collapses back to the bubble on any outside touch (`FLAG_WATCH_OUTSIDE_TOUCH`) or keyboard-back, except while a voice note or dictation is in progress. `OverlayMode` is legacy (no-op).
   - **ChatAccessibilityService.kt**: Accessibility service that monitors UI events in supported apps (WhatsApp, Telegram) to:
     - Capture chat messages into a session buffer.
     - Decide overlay visibility: `chatRoomInputBounds()` = active window has `conversation_contact_name` **and** `entry` (re-checked on every window change, including launcher/system UI, and throttled on content changes).
     - Inject AI-generated text back into the input field.
   - **GnaniSttClient.kt**: Handles communication with Gnani Prisma Speech-to-Text API.
   - **GnaniTtsClient.kt**: Gnani Timbre v3.0 text-to-speech (`/api/v1/tts/inference`, Ogg/Opus output, same API key as STT).
   - **VoiceChangerController.kt**: the 🗣️ Voice Changer flow (see `docs/VOICE_CHANGER.md`).
   - **GlideMenu.kt**: hold-and-glide picker in its own overlay window (🎙️ languages, 🗣️ voices).
   - **WhatsAppAutoSender.kt**: selects the open chat in WhatsApp's share picker and taps send (guarded; see `docs/VOICE_CHANGER.md`).
   - **VoiceRecorder.kt**: Manages audio recording using Android's MediaRecorder.
   - **IndicContextModule.kt**: Kotlin module bridging native functionality to JavaScript via Expo's native module system.
     - Exposes async functions for permissions, Gnani config, overlay control, voice recording, buffer access, and text injection.
     - Uses event emitters to send buffer updates, focus/blur events, and transcription results to JS.

3. **TypeScript Source (`src/`)**
   - `src/services/llm/`: the LLM layer. **All** AI features go through it:
     - `llmClient.ts`: the single HTTP client (shared time budget, typed `LlmError`, JSON extraction). Its provider is chosen by `EXPO_PUBLIC_LLM_PROVIDER=gemini|evon`; the default is Gemini `gemini-3.5-flash-lite` via `EXPO_PUBLIC_GEMINI_API_KEY` / `EXPO_PUBLIC_GEMINI_MODEL`. Evon uses `EXPO_PUBLIC_EVON_*`. See `.env.example`, and restart Metro with `--clear` after changing `.env`.
     - `chatPayload.ts`: `buildChatPayload()` turns buffer bubbles into `{now, contact_name, conversation: [{sender: "user"|"contact", text, sent?}], draft?}`. Bubbles whose sender is unknown are dropped. `sent` looks like `"2026-11-02 18:20 (Mon, yesterday)"`, so the LLM can tell what is due or overdue.
     - `prompts.ts`: the system prompts. No relationship/persona is ever passed in; the LLM infers it from the conversation.
   - `src/services/aiFeatures.ts`: `generateSmartReplies()` and `improveText()`.
   - `src/services/gnaniEvonLlm.ts`: Tone Guard, Fact Check, Catch-Up Summary.
   - **No template/heuristic fallbacks.** LLM failures throw, and the UI shows an error card with Retry (`IndicContext.showAiError`).
   - `src/hooks/`: Custom React hooks (documentation indicates keyboard state, context collection, AI orchestration).
   - `src/components/`: Reusable UI components for keyboard surfaces and overlays.
   - `src/types/`: Shared TypeScript definitions:
     - `ChatBubble`, `SessionBufferState` for context management.
     - `SmartRepliesResult`, `ImproveTextResult`, plus tone-guard / fact-check / summary results.
     - There are deliberately **no persona/relationship types**. See `docs/AI_OVERHAUL.md`.
   - `src/utils/constants.ts`: App constants:
     - `APP_NAME`, `PACKAGE_NAME`.
     - `BUFFER_MAX_CAPACITY` (30 messages).
     - `SUPPORTED_PACKAGES` (WhatsApp, Telegram variants).
     - `TONE_OPTIONS` and `TEMPERATURE_LEVELS` for AI rewriting.

### Data Flow

1. **Context Collection**:
   - `ChatAccessibilityService` monitors accessibility events in supported apps.
   - Captures chat bubbles (text, sender, timestamp, app package) into a session buffer. WhatsApp messages come from `message_text` nodes. A row with the delivery-tick `status` view is outgoing (`isSelf = true`); otherwise the sender is decided from the bubble's left/right gap, and an ambiguous bubble stays `null`.
   - `SessionBuffer.mergeVisible()` keeps on-screen chronological order (handles scrolling up).
   - Each bubble carries `sentDate` (`yyyy-MM-dd`) and `sentTime` (`HH:mm`). The day comes from `conversation_row_date_divider` rows; if no divider is on screen, the chat-list `conversations_row_date` gives the day of the last message. `ChatDates.kt` parses the labels; tests: `cd android && ./gradlew :indic-context:testDebugUnitTest`.
   - Buffer updates are emitted to JS via `IndicContextModule.emitBufferUpdated()`.
   - Dashboard displays buffer count and uses buffer for AI features.

2. **Overlay Display**:
   - Visibility is driven by `ChatAccessibilityService.updateChatRoomOverlay()`: chat room → `showOverlay(entryBounds)`; anything else (home, status, archived, search, channels, share picker, other apps) → `hideOverlay()` + `onLeftChatRoom()` (hides cards, cancels in-flight voice work).
   - Toolbar buttons: ✨ Improve Text, 🌐 Translate, 🗣️ Voice Changer, 💬 Smart Replies, 🎙️ dictation, and collapse. ✨, 🌐 and 💬 emit `onActionTriggered` (`improve` | `translate` | `smart_replies`) to JS. 🌐 replaces the box text with an English or Hindi (Devanagari) translation; hold + glide picks the target (`translate_target` pref, read via `getTranslateTarget()`).
   - Bubble position: the edge (`overlay_edge`) and drop height (`overlay_y_frac`) are saved on drop. The bubble lifts above the message box only while the keyboard would cover it. Cards are placed by measured height (`positionCard`) so they never cover the toolbar. 🗣️ runs fully natively (`VoiceChangerController`): tap = record/stop, hold + glide = pick a voice. 🎙️: tap = dictation, hold + glide = language. Fact Check is no longer on the toolbar; only its service (`checkFactsAndInconsistencies` in `gnaniEvonLlm.ts`) remains.

3. **Voice-to-Text (Phase 3)**:
   - User taps microphone button in toolbar → `OverlayService.toggleVoiceRecording()`.
   - Records audio via `VoiceRecorder`, then sends to `GnaniSttClient.transcribe()`.
   - On success, transcript is injected into input field via `ChatAccessibilityService.injectText()` or copied to clipboard.
   - Transcript result emitted to JS via `IndicContextModule.emitVoiceTranscript()` for dashboard display.

4. **AI Features**:
   - `CopilotBridgeProvider` handles `onActionTriggered`. It builds the payload from `getSessionBuffer()` and the active thread title, calls `src/services/aiFeatures.ts`, and shows the results with `IndicContext.showSmartReplies()`. On failure it calls `showAiError(..., retryAction)` instead.
   - **LLM calls happen only on ✨ / 💬 taps** (plus Catch-up summary on Home). Incoming messages and reopening a chat never trigger one.
   - Prompt regression check: `npm run eval:prompts`. It calls the configured provider live and makes ~11 calls, so mind the Gemini free-tier rate limit.

### Key Files to Understand

- **App**: `app/index.tsx` (Home), `app/onboarding.tsx` (tutorial), `src/hooks/CopilotBridge.tsx` (event handling), `src/ui/` (theme + components). See `docs/UI_REDESIGN.md`.
- **Native Bridge**: `modules/indic-context/android/src/main/java/com/indiccontext/IndicContextModule.kt`.
- **Overlay UI**: `modules/indic-context/android/src/main/java/com/indiccontext/OverlayService.kt`.
- **Accessibility Service**: `modules/indic-context/android/src/main/java/com/indiccontext/ChatAccessibilityService.kt`.
- **Type Definitions**: `src/types/context.ts` (core data structures).
- **Constants**: `src/utils/constants.ts` (app-wide values).
- **LLM layer**: `src/services/llm/` (client, payload, prompts) and `src/services/aiFeatures.ts`.
- **Overhaul log**: `docs/AI_OVERHAUL.md` (decisions + progress).

## Notes

- Gnani Prisma STT handles speech; Gemini handles the LLM features. Gnani exposes no chat-completions endpoint, and the legacy guessed URLs return 403/404/DNS errors.
- No linting or test scripts are configured yet; TypeScript type checking is the primary static validation.
- Android native code requires Android Studio for advanced debugging (logcat, breakpoints).
- To modify native code, run `npm run prebuild` to regenerate native modules after changes.
- Supported apps for context capture are hardcoded to WhatsApp and Telegram in `src/utils/constants.ts`.
