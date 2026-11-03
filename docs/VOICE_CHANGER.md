# 🗣️ Voice Changer

Speak into the overlay, and send the **same words in a different voice** (Gnani Timbre v3.0) to the WhatsApp chat.
It replaces 🔍 Fact Check on the floating toolbar. Fact Check's JS code is kept, but no toolbar button triggers it any more.

Started: 2026-11-03

## Flow (v2, 2026-11-03)

```
🗣️ hold + glide ─► pick one of 6 voices (own overlay window, same gesture as 🎙️ languages)
🗣️ tap ─► start chime ─► 🔴 button becomes a red pill with pulsing dot + m:ss timer (≤30 s)
🗣️ tap ─► stop chime ─► button pulses (⏳) while Prisma STT → Timbre TTS run
        ─► "✅ Ready in X's voice" card: transcript + 📤 Send to <chat> · ▶ Play · 🔄 Other voice (5 others)
📤 with a chat open ─► share to WhatsApp + WhatsAppAutoSender selects that chat and taps send
📤 with no chat open ─► share sheet; the user picks the chat (v1 behaviour)
```

- No cards while recording or processing; the toolbar button shows the state.
- Chimes use `MediaActionSound` START/STOP_VIDEO_RECORDING. The recorder starts 320 ms after the start chime so the chime isn't recorded.
- "🔄 Other voice" re-voices the same transcript; the default voice (badge) only changes via the glide menu.
- Everything runs natively in the overlay (`VoiceChangerController.kt`), so it works without the RN dashboard.

### Direct send to the open chat (`WhatsAppAutoSender.kt`)
WhatsApp "Send to…" picker, verified on 2.26 with a redacted dump (a text share via adb; nothing was sent):
`contact_picker_layout` › `android:id/list` › `RadioButton` rows (**checkable, not clickable**) › `contactpicker_row_name`; once a row is selected, a footer appears with a `send` ImageButton.

Steps:
1. The target is read fresh from the open conversation's `conversation_contact_name` at the moment 📤 is tapped.
2. Pick: find the row whose name equals the target **exactly**, then `ACTION_CLICK`, falling back to a tap gesture (`canPerformGestures="true"`).
3. Send: only when **exactly one** row is checked and it is the target, click `send`.
4. Confirm: tap a `button1` "Send" dialog or a media-preview `send` if one appears. "Sent" means the picker has closed.
5. Anything unexpected, or 10 s passing, aborts with a toast and leaves the picker to the user.

### Glide menus (`GlideMenu.kt`), and the language-menu fix
The old language popup lived inside the toolbar's `WRAP_CONTENT` window and was placed with a translation. That doesn't grow the window, so the popup was clipped or misplaced (worst when docked right), and the toolbar window was shifted while the popup was open (restored only if `y > 0`). Glide menus are now **separate, non-touchable overlay windows** placed above the button (below it if there's no room). The gesture stays with the button, which feeds `hover(rawX, rawY)`.

## Decisions

| Decision | Why |
|---|---|
| Speech → text → speech, not voice conversion | Timbre is a TTS model. Words are preserved, but tone and pauses are not. |
| Voices: ♂ **Devansh** (upbeat), **Yashraj** (warm), **Avinash** (calm, firm) · ♀ **Lakshmi** (lively), **Shivani** (warm), **Riyaa** (confident) | 3 male + 3 female, distinct personas. Every v3.0 voice speaks all 10 languages. The choice is saved as `tts_voice`. |
| TTS `language` = STT language code | "Same language as the user speaks". Codes outside v3.0's list fall back to `auto`. |
| ~~Transcript check before TTS~~ → transcript shown on the Ready card | Removed in v2 on request. The Ready card shows the words, so STT errors are still visible before sending. |
| Share + guarded auto-select (v2) | An overlay can't attach audio to the open chat, and a `jid` needs the phone number, which isn't on screen. So we share and then drive the picker with exact-name and single-selection checks. With no chat open, it's the plain share sheet. |
| Own `IndicFileProvider` in the **module manifest** | The manifest merger adds it with no prebuild step; the subclass avoids clashing with other modules' FileProviders. Only `cache/voice_notes/` is shareable, and files are deleted after 1 h. |
| Preset voices only, no cloning | Gnani also offers voice cloning; cloning a real contact would be impersonation. |

## API facts (verified 2026-11-03 with the project key)

- `POST https://api.vachana.ai/api/v1/tts/inference`, header `X-API-Key-ID`.
- Body: `{text, model: "timbre-v3.0", voice, language, audio_config: {sample_rate: 48000, encoding: "oggopus", container: "ogg"}}`.
- Response: raw audio bytes. The project key **has TTS scope**: HTTP 200 in ~1.7–2 s for `hi-IN` (Devanagari), `auto` (Roman Hinglish) and `en-IN`, returning Ogg/Opus mono 48 kHz.
- v3.0 has no Hinglish (`hi-en`) code. Roman Hinglish via `auto` returns audio, but **pronunciation quality is unverified** (listen on device).

## Files

- `modules/indic-context/android/src/main/java/com/indiccontext/GnaniTtsClient.kt`
- `.../VoiceChangerController.kt`, `.../IndicFileProvider.kt`
- `modules/indic-context/android/src/main/AndroidManifest.xml`, `res/xml/indic_share_paths.xml`
- `OverlayService.kt` (button wiring, card bridge, 🔴 indicator, mutual exclusion with 🎙️ dictation), `overlay_panel.xml` (`btn_voice_changer`)
- `ChatAccessibilityService.currentChatPackage` (share to WhatsApp or WhatsApp Business, whichever is open)

## Progress

- [x] TTS API check with the project key
- [x] v1: `GnaniTtsClient`, controller, FileProvider, toolbar button, `assembleDebug`
- [x] v2: 6 voices + glide picker; tap-to-record with chimes and a timer pill; no check-the-words step; Ready card with 5-voice "Other voice"
- [x] v2: `GlideMenu` separate window (language menu fix); card supports more than 3 chips
- [x] v2: `WhatsAppAutoSender` from the verified picker layout; `canPerformGestures` in both accessibility-config copies (checked in the packaged APK)
- [x] `compileDebugKotlin` + unit tests + `assembleDebug`
- [ ] On device: glide menus on both edges; record/timer/chimes; Ready → Play / Other voice; **📤 to the open chat** (watch `adb logcat -s AutoSend VoiceChanger`). Check how WhatsApp shows the file and how Hinglish sounds.
- [ ] If gestures aren't granted after the update, toggle the accessibility service off and on.
