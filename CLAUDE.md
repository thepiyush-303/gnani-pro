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
   - `src/services/`: Stub implementations for Gnani Prisma STT (`gnaniPrismaStt.ts`) and Gnani Evon LLM (`gnaniEvonLlm.ts`) – to be replaced with actual API calls.
   - `src/hooks/`: Custom React hooks (documentation indicates keyboard state, context collection, AI orchestration).
   - `src/components/`: Reusable UI components for keyboard surfaces and overlays.
   - `src/types/`: Shared TypeScript definitions:
     - `ChatBubble`, `SessionBufferState` for context management.
     - Tone options (`ToneOption`), temperature levels (`TemperatureLevel`), persona types.
     - Pre-send validation results (fact check, cultural sensitivity, icebreakers).
   - `src/utils/constants.ts`: App constants:
     - `APP_NAME`, `PACKAGE_NAME`.
     - `BUFFER_MAX_CAPACITY` (30 messages).
     - `SUPPORTED_PACKAGES` (WhatsApp, Telegram variants).
     - `TONE_OPTIONS` and `TEMPERATURE_LEVELS` for AI rewriting.

### Data Flow

1. **Context Collection**:
   - `ChatAccessibilityService` monitors accessibility events in supported apps.
   - Captures chat bubbles (text, sender, timestamp, app package) into a session buffer.
   - Buffer updates are emitted to JS via `IndicContextModule.emitBufferUpdated()`.
   - Dashboard displays buffer count and uses buffer for AI features.

2. **Overlay Display**:
   - Dashboard controls overlay mode via `IndicContextModule.setOverlayMode()`.
   - `OverlayService` shows/hides toolbar or edge pill based on mode and input focus events from `ChatAccessibilityService`.
   - Toolbar includes buttons for voice recording, tone rewrite (placeholder), fact check (placeholder), icebreaker (placeholder), and collapse.

3. **Voice-to-Text (Phase 3)**:
   - User taps microphone button in toolbar → `OverlayService.toggleVoiceRecording()`.
   - Records audio via `VoiceRecorder`, then sends to `GnaniSttClient.transcribe()`.
   - On success, transcript is injected into input field via `ChatAccessibilityService.injectText()` or copied to clipboard.
   - Transcript result emitted to JS via `IndicContextModule.emitVoiceTranscript()` for dashboard display.

4. **AI Features (Placeholders)**:
   - Toolbar buttons for tone rewrite, fact check, and icebreaker currently show toast notifications.
   - Intended to call Gnani Evon LLM and other APIs via `src/services/` stubs once implemented.

### Key Files to Understand

- **Dashboard**: `app/index.tsx` (UI and permission logic).
- **Native Bridge**: `modules/indic-context/android/src/main/java/com/indiccontext/IndicContextModule.kt`.
- **Overlay UI**: `modules/indic-context/android/src/main/java/com/indiccontext/OverlayService.kt`.
- **Accessibility Service**: `modules/indic-context/android/src/main/java/com/indiccontext/ChatAccessibilityService.kt`.
- **Type Definitions**: `src/types/context.ts` (core data structures).
- **Constants**: `src/utils/constants.ts` (app-wide values).
- **Service Stubs**: `src/services/` (future API integration points).

## Notes

- The project is in a scaffold stage; TODOs exist for integrating Gnani Prisma STT and Gnani Evon LLM APIs.
- No linting or test scripts are configured yet; TypeScript type checking is the primary static validation.
- Android native code requires Android Studio for advanced debugging (logcat, breakpoints).
- To modify native code, run `npm run prebuild` to regenerate native modules after changes.
- Supported apps for context capture are hardcoded to WhatsApp and Telegram in `src/utils/constants.ts`.
