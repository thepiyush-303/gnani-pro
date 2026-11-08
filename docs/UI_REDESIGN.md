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

---

## Round 3 (2026-11-08): DESIGN.md system, rename to ConvoAI, new icon
Source of truth: `DESIGN.md` (Rose · JetBrains Mono · Bento · radius 4/8/12 · spacing 4–48).

**App (`src/ui/theme.ts`, `src/ui/components.tsx`, `app/*.tsx`)**
- Light palette = DESIGN.md tokens. Dark palette = the same rose hues re-balanced for dark surfaces (the theme still follows the system).
- JetBrains Mono 300/400/500/600 via `@expo-google-fonts/jetbrains-mono`, loaded in `_layout.tsx` (blank screen until loaded, so there's no font flash). Default weight 500, letter spacing 0. Android needs one family per weight, so `font.*` tokens carry `fontFamily` (no `fontWeight` anywhere).
- Radius: 4 chips and labels · 8 cards, buttons and icon tiles · 12 hero and feature surfaces.
- **Bento Home** (all original sections kept):
  - hero module (mascot, ConvoAI, value line, status, on/off);
  - setup checklist;
  - two compact tiles (speech language, voice) that expand into their full pickers;
  - current chat + catch-up (feature card);
  - How it works as a lead card + 2-column tiles;
  - tutorial link and footer.
- Tutorial welcome step uses the same hero + lead + tiles composition.
- Reduced motion: screen transitions turn off when the system "remove animations" setting is on.
- **Contrast deviations (DESIGN.md: "choose the more accessible option"):**

  | Token | DESIGN.md | Used | Why |
  |---|---|---|---|
  | primary (text-bearing surfaces) | `#E11D48` | `#C8143F` | Light text on `#E11D48` is 4.28:1; `#C8143F` gives 5.27:1. Same rose hue. |
  | success | `#16A34A` | `#15803D` | 3.0:1 on its soft surface; now 4.57:1 |
  | warning text | `#D97706` | `#B45309` | 4.57:1 |
  | Primary-coloured text on the page bg | primary | primaryStrong `#831843` | Primary text on `#FFF1F2` is 4.28:1 |

**Overlay (native)**
- Fixed dark-rose glass (it floats over WhatsApp): toolbar and cards `#1C0A12`, hairline `#FDA4AF` @30%, 12 dp surfaces, 8 dp buttons, chips and rows, 4 dp badges, soft-rose `#FECDD3` icons, rose `#C8143F` active states. Old cyan/slate colours are gone.
- The bubble is a mini app icon: the mascot (`drawable-nodpi/ic_convo_mascot.png`, cut out of `new-icon.png` by flood-filling the background) on a rose 12 dp square.
- JetBrains Mono on every overlay TextView via `OverlayFonts` (`ResourcesCompat`, works below API 26). Glide menus use it too.

**Rename + icon**
- Display name **ConvoAI** (`app.json` → `app_name`), plus the notification, toasts, accessibility description (the config plugin now *updates* an existing string) and all user-facing copy.
- Package ID unchanged (`com.indiccontext.assistant`), so updates install in place and permissions survive.
- Icon: `assets/new-icon.png` → `icon` + splash (bg `#DC1E42`). The adaptive foreground (`assets/adaptive-icon.png`) is the icon at 80% so circular masks don't clip the mascot (`scripts/generateIcons.py`).

