# ConvoAI Showcase

An animated, keyboard-driven presentation of ConvoAI for the hackathon demo video. It uses a fixed 1920×1080 stage, scaled to the window, so a recording looks the same at any size. It's built with Vite, React 18 and framer-motion, in the app's own rose palette and Poppins.

## Run

```bash
cd demo
npm install
npm run dev          # http://localhost:5173
```

`npm run build` writes a static copy to `demo/dist/`, which you can open with `npm run preview`.

## Keys

| Key | Action |
|---|---|
| → / Space / PageDown | next build step, then the next slide |
| ← / PageUp | back |
| Home / End | first / last slide |
| F | fullscreen |
| H | hide the HUD (progress bar, key hints, empty-clip labels) for a clean recording |
| M | mute / unmute the clips |
| R | replay the current clip |

The URL keeps your place, e.g. `#/5/3` is slide 5, step 3, so a reload doesn't lose it.

## Your WhatsApp recordings

Put screen recordings (portrait, roughly 9:20) in `demo/public/videos/` with these names. Each one plays inside the phone frame on its slide, from the start, whenever the slide opens:

| File | Slide |
|---|---|
| `bubble.mp4` | Smart bubble (only in chats, drag, auto-close) |
| `improve.mp4` | ✨ Improve |
| `replies.mp4` | 💬 Smart replies |
| `translate.mp4` | 🌐 Translate |
| `dictate.mp4` | 🎙 Dictate (Gnani Prisma) |
| `voice.mp4` | 🗣 Voice notes (Prisma → Timbre) |
| `reminders.mp4` | ⏰ Deadline reminders |
| `tutorial.mp4` | Tutorial & Home |

A missing clip shows an empty phone frame. Recordings are git-ignored.

Record the phone with `scrcpy --record improve.mp4`, or with Android's screen recorder with device audio on, so the voice notes are heard.

## Recording the presentation

1. Open the deck in Chrome and press **F** for fullscreen and **H** to hide the HUD.
2. Record with OBS (Display Capture, 1920×1080, 30 or 60 fps). Capture desktop audio so the clips' sound is included.
3. Press → to build each slide while you talk. Each feature slide reveals its 4 cards one per press.

## Slides

1. **Intro**
2. **The problem** (hanging cards: drag them, they spring back)
3. **How it works**: the architecture builds over 8 steps
4. **8 feature slides**: smart bubble, ✨ Improve, 💬 Replies, 🌐 Translate, 🎙 Dictate, 🗣 Voice notes, ⏰ Reminders, Tutorial & Home
5. **What's unique**, including privacy (tilt cards: move the mouse over them)
6. **Technologies**
7. **Quality**: real prompt-eval and unit-test results, in `src/data/quality.ts`
8. **Future scope**: scam detection and every channel
9. **Closing**

## Structure

| Folder | Contents |
|---|---|
| `src/deck/` | the engine: stage scaling, keys, hash, HUD |
| `src/components/` | phone video, stage strip, cards (info, hanging, tilt), chat and overlay mocks, effects (waveform, typewriter, morph text, underline) |
| `src/slides/` | one file per slide or group, registered in order in `slides/index.ts` |
| `src/theme.ts` | colours copied from the app (`src/ui/theme.ts`) and the overlay glass |
