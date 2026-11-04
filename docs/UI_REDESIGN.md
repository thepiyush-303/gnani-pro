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

---

## Round 2 (2026-11-04): position memory, 🌐 Translate, card overlap
Feedback from the first device run.

| Problem | Cause | Fix |
|---|---|---|
| Dragged bubble snapped back | The chat-room check calls `showOverlay(entryBounds)` on every window change (~200 ms on content changes), which re-placed it above the message box. Only the edge was saved. | `snapToNearestEdge` saves `overlay_y_frac`. `showOverlay` uses the saved height, lifting above the message box only while the keyboard would cover it. `isUserMoving` stops repositioning mid-drag and mid-snap. |
| Card covered the toolbar | Card top = bubble y − 175 dp (fixed guess); real cards are ~230 dp+. In-place updates never moved it. | `positionCard()` measures the card and places it above the bubble/toolbar, or below if there's no room (or on the roomier side, clamped). Re-run after every in-place update and whenever the bubble moves. |
| Wanted: translate the draft | — | 🌐 button (after ✨). **Tap** translates the box text and **replaces** it (toast confirms). **Hold + glide** picks English / Hindi (Devanagari), saved as `translate_target` and shown as a badge. Empty box or < 2 letters → explanatory card. Already in the target → toast. LLM error → retry card. |

Translate details:
- `TRANSLATE_SYSTEM_PROMPT` keeps meaning, register, names, numbers, emoji and URLs; Hindi only in Devanagari; Roman Hinglish counts as "not Hindi".
- `translateText()` validates the script: a Hindi result needs Devanagari; "already Hindi" needs a Devanagari draft; "already English" a non-Devanagari draft. Violations become a retry card instead of a wrong insert.
- The busy pulse is set natively on tap and cleared by JS (`setToolbarBusy`), with a 20 s native safety timeout. The toolbar doesn't auto-collapse while translating.
- Gnani has no translation API, so this uses the configured LLM (Gemini).

### Checks
- [x] `tsc`; `compileDebugKotlin` + unit tests + `assembleDebug` (APK contains `ic_translate`)
- [x] `ic_translate.xml` rendered with the pathData previewer
- [x] `npm run eval:prompts` translation cases: all pass (log below)
- [ ] On device: drop the bubble mid-screen → it stays across messages, chat switches and keyboard open/close
- [ ] On device: 💬 / ✨ / "Other voice" (5 chips) cards never overlap the toolbar (also with the bubble near the top)
- [ ] On device: 🌐 empty → card; "k" → too-short card; EN→HI replaced in Devanagari + toast; HI→EN; EN with EN → "Already in English"; airplane mode → retry card

### Eval log (2026-11-04, gemini-3.5-flash-lite)
- EN banter → HI: "भाई आज मैं बहुत थक गया हूँ, कल खेलते हैं ठीक है?" ✅ Devanagari, casual kept
- HI → EN: "I will send the report by tomorrow morning." ✅
- EN → EN: `already_in_target` ✅ (no re-translation)
- Roman Hinglish → HI: "कल मिलते है भाई, ५ बजे स्टेशन पे" ✅ converted, time kept (Devanagari numeral)
- Only failure in the full run: the pre-existing flaky case (a reply to a 4-day-old plan says "today"). It's unrelated to this change and was already listed as a flash-lite weak spot in `AI_OVERHAUL.md`.

