# UI Redesign: Chat-Room Pill, Auto-Closing Toolbar, Button-Only LLM, New App + Tutorial

Started: 2026-11-04 · Plan: approved 2026-11-04

## Problems
- The overlay followed the **keyboard**, not the chat: it showed for any focused input (search, status replies) and hid when the keyboard closed.
- Smart Replies made **LLM calls on every incoming message**, and again on chat reopen, without being asked.
- The open toolbar never closed by itself.
- The pill and toolbar used emoji glyphs; the app had no icon, a developer-style dashboard, and no onboarding.

## Decisions
- The pill is shown **only in a WhatsApp chat room**: the active window has `conversation_contact_name` **and** the `entry` input.
- The toolbar collapses on **any outside touch** (including typing), on keyboard-back and on leaving the chat, except while a voice note is recording or processing.
- **LLM only on ✨ / 💬 taps.** The date-aware follow-up still shows on the 💬 card.
- Home keeps: on/off, permission setup, tutorial, speech language + default voice, Catch-up summary. Everything else is removed.
- The theme follows the system (light + dark). The overlay stays dark glass.

## Progress
### A. Overlay (native)
- [x] A1 Chat-room-only visibility; keyboard-driven show/hide removed; OverlayMode gate removed; `edge_pill.xml` deleted
- [x] A2 Outside-touch / keyboard-back collapse
- [x] A3 Pill: 48 dp, vector mark, softer radii, press state
- [x] A4 Toolbar: vector icons, 40 dp ripple buttons, restyled badges and states
- [x] A5 10 languages; `applyLanguage`; voice bridge (`getVoices` / `getVoice` / `setVoice`)
- [x] A6 Notification icon

### B. JS behaviour
- [x] Passive Smart Replies removed; factcheck branch removed
- [x] `useCopilotBridge` hook mounted in `_layout`

### C. App
- [x] Theme + components
- [x] Home rewrite
- [x] Onboarding tutorial (first launch + "How to use")
- [x] App icon (generated) + `app.json`

### D. Verification
- [x] `tsc`, gradle compile + unit tests + `assembleDebug`
- [ ] On-device checklist (below)

## Verification log
**2026-11-04**
- `npx tsc --noEmit` ✅. `./gradlew :indic-context:testDebugUnitTest assembleDebug` ✅ (`ChatDatesTest` 7/7).
- All 10 vector icons parse and render (custom strict pathData rasteriser; preview checked).
- Launcher icons: `scripts/generateIcons.py` → `assets/`. `npx expo prebuild --platform android --no-install` (non-clean; `android/` only had the standard debug keystore) generated the mipmaps. The APK icon is `mipmap-anydpi-v26/ic_launcher.xml` (adaptive).
- `expo-system-ui` added: without it Expo ignores `userInterfaceStyle: automatic` on Android (prebuild warned), so the follow-system theme wouldn't work.
- Packaged accessibility config still has `canPerformGestures=true`.
- Checks: no LLM call reachable from the buffer listener; no emoji glyphs in `overlay_panel.xml` (comments only); no `setOverlayMode` / `globalPersonaStore` / fact-check usage in `app/` or `src/`.
- Bugs found and fixed along the way:
  - launcher/system-UI events returned before any hide logic, so Home might never hide the overlay on some launchers;
  - `foregroundPkg` was never assigned, so shares always targeted `com.whatsapp` even from WhatsApp Business;
  - the dashboard's `setLanguage` didn't update the running overlay's badge.

## On-device checklist (not yet run)
- [ ] Bubble shows in 1:1 + group chats; hidden on home, status, archived, search, channels, share picker; hides on Home / Recents / back-out
- [ ] Bubble sits above the message box with the keyboard open and closed
- [ ] Toolbar collapses on: tapping the chat, typing, keyboard-back, leaving the chat; stays open while 🗣 records or processes
- [ ] `adb logcat -s IndicLLM` silent when messages arrive / a chat is reopened; calls only after ✨ / 💬 / Catch-up
- [ ] Glide menus: 10 languages, 6 voices; Home language/voice changes update the toolbar badges
- [ ] Tutorial on first launch (fresh install or cleared data); Grant buttons; Finish turns the assistant on
- [ ] Light/dark follows the system; launcher + notification icons show the new mark
