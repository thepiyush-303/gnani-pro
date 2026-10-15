# IndicContextKeyboard

IndicContextKeyboard is a React Native (TypeScript) smart keyboard scaffold for AI-assisted communication in Indic language contexts.

## Architecture Overview

- `src/components/`: UI components for keyboard and overlays.
- `src/hooks/`: Keyboard and app-level hooks.
- `src/services/`: Service stubs for Gnani Prisma STT and Gnani Evon LLM.
- `src/types/`: Shared TypeScript types.
- `src/utils/`: Shared constants and utility helpers.
- `android/app/src/main/`: Android manifest, XML service configs, and native service placeholders.
- `.agents/`: Context instructions for future AI coding agents.

## Android Native Service Placeholders

- `CustomKeyboardService.kt`: InputMethodService skeleton for keyboard lifecycle.
- `ChatAccessibilityService.kt`: AccessibilityService skeleton for context capture lifecycle.
- `res/xml/method.xml`: IME metadata.
- `res/xml/accessibility_service_config.xml`: Accessibility service metadata.

## Setup (Scaffold Stage)

1. Install React Native dependencies (when project package files are added).
2. Open Android module in Android Studio for native service wiring.
3. Bridge native services with React Native modules.
4. Integrate Gnani Prisma STT and Gnani Evon APIs in `src/services/`.
