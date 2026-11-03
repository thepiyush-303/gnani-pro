# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start Expo dev server**: `npm start` (or `expo start`)
  - Runs the Metro bundler and provides a QR code for Expo Go or dev client.
- **Run on Android**: `npm run android` (or `expo run:android`)
  - Compiles and launches the app on a connected Android device/emulator.
- **Build debug APK**: `npm run build:apk`
  - Generates `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Build release APK**: `npm run build:apk:release`
  - Generates signed release APK (requires keystore configuration).
- **Run on iOS**: `npm run ios` (or `expo run:ios`)
  - Requires macOS and Xcode; launches iOS simulator or device.
- **Prebuild native code**: `npm run prebuild`
  - Generates Android/iOS native directories (use before building or when modifying native dependencies).
- **Type checking**: `npx tsc --noEmit`
  - Validates TypeScript code without emitting files (since Expo uses Babel for JS output).

## Project Structure & Architecture

### High-Level Components

1. **Expo/React Native Dashboard (`app/`)**
   - Entry point: `app/index.tsx` (dashboard screen for configuring the copilot).
   - Uses `expo-router` for navigation (currently single-screen stack).
   - Manages permissions (overlay, accessibility, microphone) via `indic-context` native module.
   - Controls overlay mode (INPUT_BAR vs EDGE_SLIDER) and voice-to-text testing.
   - Displays live context buffer count and transcript results.

2. **Native Android Module (`modules/indic-context/`)**
   - A local Android library packaged as an Expo module (`indic-context` dependency in `package.json`).
   - **OverlayService.kt**: Draws the floating toolbar UI (two modes):
     - `INPUT_BAR`: Shows toolbar above keyboard when input field is focused.
     - `EDGE_SLIDER`: Shows a collapsed pill on screen edge; expands to toolbar on tap.
   - **ChatAccessibilityService.kt**: Accessibility service that monitors UI events in supported apps (WhatsApp, Telegram) to:
     - Capture chat messages into a session buffer.
     - Detect input field focus for positioning the overlay.
     - Inject AI-generated text back into the input field.
   - **GnaniSttClient.kt**: Handles communication with Gnani Prisma Speech-to-Text API.
   - **VoiceRecorder.kt**: Manages audio recording using Android's MediaRecorder.
   - **IndicContextModule.kt**: Kotlin module bridging native functionality to JavaScript via Expo's native module system.
     - Exposes async functions for permissions, Gnani config, overlay control, voice recording, buffer access, and text injection.
     - Uses event emitters to send buffer updates, focus/blur events, and transcription results to JS.

3. **TypeScript Source (`src/`)**
   - `src/services/llm/`: the LLM layer. **All** AI features go through it:
     - `llmClient.ts`: the single HTTP client (shared time budget, typed `LlmError`, JSON extraction). Its provider is chosen by `EXPO_PUBLIC_LLM_PROVIDER=gemini|evon`; the default is Gemini `gemini-3.5-flash-lite` via `EXPO_PUBLIC_GEMINI_API_KEY` / `EXPO_PUBLIC_GEMINI_MODEL`. Evon uses `EXPO_PUBLIC_EVON_*`. See `.env.example`, and restart Metro with `--clear` after changing `.env`.
     - `chatPayload.ts`: `buildChatPayload()` turns buffer bubbles into `{contact_name, conversation: [{sender: "user"|"contact", text}], draft?}`. Bubbles whose sender is unknown are dropped.
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
   - Buffer updates are emitted to JS via `IndicContextModule.emitBufferUpdated()`.
   - Dashboard displays buffer count and uses buffer for AI features.

2. **Overlay Display**:
   - Dashboard controls overlay mode via `IndicContextModule.setOverlayMode()`.
   - `OverlayService` shows/hides toolbar or edge pill based on mode and input focus events from `ChatAccessibilityService`.
   - Toolbar buttons: ✨ Improve Text, 🔍 Fact Check, 💬 Smart Replies, 🎙️ voice, and collapse. Each emits `onActionTriggered` with `improve` | `factcheck` | `smart_replies`.

3. **Voice-to-Text (Phase 3)**:
   - User taps microphone button in toolbar → `OverlayService.toggleVoiceRecording()`.
   - Records audio via `VoiceRecorder`, then sends to `GnaniSttClient.transcribe()`.
   - On success, transcript is injected into input field via `ChatAccessibilityService.injectText()` or copied to clipboard.
   - Transcript result emitted to JS via `IndicContextModule.emitVoiceTranscript()` for dashboard display.

4. **AI Features**:
   - `app/index.tsx` handles `onActionTriggered`. It builds the payload from `getSessionBuffer()` and the active thread title, calls `src/services/aiFeatures.ts`, and shows the results with `IndicContext.showSmartReplies()`. On failure it calls `showAiError(..., retryAction)` instead.
   - Smart Replies also run automatically when the newest attributed message is from the contact. Failures there are only logged.
   - Prompt regression check: `npm run eval:prompts`. It calls the configured provider live and makes ~11 calls, so mind the Gemini free-tier rate limit.

### Key Files to Understand

- **Dashboard**: `app/index.tsx` (UI and permission logic).
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
