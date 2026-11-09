# ConvoAI: Hackathon Demo Video Script

**Target length:** 3–4 minutes · **Format:** screen recording of the phone + a few slides + voice-over (face cam optional)

**What the judges asked for, and where it's covered:**

| Requirement | Where in the video |
|---|---|
| Explain what you built | Scenes 1–3 (problem, solution) and the live demo (Scenes 4–10) |
| Identify the Gnani AI technology used | Scene 3 (tech slide), plus a callout every time Prisma or Timbre is used (Scenes 8–10), and Scene 11 |
| Tag Gnani AI's official account | Scene 12 (end card) and the post caption at the bottom of this file |

> ⚠️ **Before you post:** check Gnani AI's official handles in the footer of [gnani.ai](https://www.gnani.ai/) (LinkedIn / X) and replace every `@GNANI_HANDLE` below. Don't guess the handle; a wrong tag won't notify them.

---

## Before you record (checklist)

- [ ] **Use demo chats, not real private ones.** Create 2–3 chats with friends who agreed to appear (or a second phone), e.g. "Ravi" (casual Hinglish) and "Mr. Sharma" (formal). Blur or avoid any real phone numbers and other contacts.
- [ ] Prepare the chat history in advance:
  - **Ravi:** yesterday he wrote *"kal subah tak details bhej dunga pakka"*, and you replied *"ok bhai"*. (This shows the date-aware follow-up.)
  - **Mr. Sharma:** *"Are you free for a quick review call tomorrow morning?"*
- [ ] Install the **shareable build** (`npm run build:apk:share`) so the app works without your laptop.
- [ ] All 3 permissions granted; ConvoAI turned **On**; speech language set to **Hindi** for the dictation scene; voice set to **Lakshmi**.
- [ ] Clear the app's data once if you want to show the tutorial from the very first launch.
- [ ] Turn on **Do Not Disturb**, charge the phone, and use a clean wallpaper.
- [ ] Turn on **Show taps** (Developer options) so viewers see where you touch.
- [ ] Record the phone with `scrcpy --record demo.mp4` (USB) or the built-in screen recorder **with device audio on**, so voice notes and chimes are audible.
- [ ] Check your internet connection: ✨, 💬, 🌐 use Gemini, and 🎙, 🗣 use Gnani.

---

## The script

Each scene lists **what's on screen** and **what you say** (voice-over). Times are approximate.

### Scene 1: Hook (0:00–0:15)
**On screen:** Close-up of a WhatsApp chat. You type "i can come tomorrow evening" and hesitate. Cut to the ConvoAI logo with the mascot.

**Say:**
> "We all do this: type a message, delete it, retype it. In India we switch between English, Hindi and Hinglish in the same chat, and it gets harder still. So we built ConvoAI."

### Scene 2: The problem (0:15–0:35)
**On screen:** Slide with three short points:
- Messages that don't match the conversation's tone
- Switching languages mid-chat
- Typing is slow, and a voice note in your own voice isn't always what you want

**Say:**
> "Writing tools today don't know who you're talking to or what was said before. They give the same generic reply to your boss and your best friend. And voice-first users, who'd rather speak than type, are left out."

### Scene 3: What we built + Gnani technology (0:35–1:05)
**On screen:** Slide: "ConvoAI: an assistant that lives inside WhatsApp." A diagram with the bubble → toolbar → features, and a **"Powered by Gnani AI"** box.

**Say:**
> "ConvoAI is an Android app that puts a small assistant bubble inside your WhatsApp chats. It reads the conversation you're in, with your permission, and helps you write, translate, reply and even speak."
>
> "Voice is at the heart of it, and that's built on **Gnani AI**:
> - **Gnani Prisma**, Gnani's speech-to-text, turns your voice into text in 10 Indian languages.
> - **Gnani Timbre version 3.0**, Gnani's text-to-speech, speaks your words back in one of six natural Indian voices.
>
> The writing features use a large language model that reads the chat's tone, language and even dates."

**Slide text for the tech box:**
| Gnani AI technology | Used for |
|---|---|
| **Gnani Prisma** (Speech-to-Text) | 🎙 Dictation; transcribing 🗣 voice notes |
| **Gnani Timbre v3.0** (Text-to-Speech) | 🗣 Voice notes in 6 voices (Devansh, Yashraj, Avinash, Lakshmi, Shivani, Riyaa); ▶ voice samples |

### Scene 4: Onboarding and tutorial (1:05–1:30)
**On screen:** Open ConvoAI. Show the tutorial: the welcome screen animates in; on **Try it**, tap the practice bubble, tap ✨ and 💬 in the demo; on **Choose your voice**, tap ▶ on Lakshmi and let a second of the sample play; skim the permission steps.

**Say:**
> "First launch opens an interactive tutorial. You practise in a safe demo chat. Then you pick your voice, and these samples are generated live by **Gnani Timbre**. The app walks you through each permission and explains why it's needed."

*(Pause on the voice sample so the audio is heard.)*

### Scene 5: The bubble lives inside chats (1:30–1:45)
**On screen:** Go to WhatsApp's chat list: no bubble. Open Ravi's chat: the bubble appears above the message box. Tap it: the toolbar slides out. Tap the chat: it closes.

**Say:**
> "The bubble only appears inside a chat and stays out of your way everywhere else. Tap it for the toolbar, and touch anywhere else to close it."

### Scene 6: ✨ Improve, same draft, two different people (1:45–2:10)
**On screen:**
1. In Ravi's chat, type `i can come tomorrow evening`, then tap ✨. The card shows a casual Hinglish rewrite. Tap it to insert.
2. Switch to Mr. Sharma's chat, type the same text, and tap ✨. The card shows a polite, formal rewrite.

**Say:**
> "Same draft, two different people. With my friend it becomes casual Hinglish; with my manager it becomes polite and professional. Nobody told it who's who; it worked that out from the conversation."

### Scene 7: 💬 Smart replies that remember time (2:10–2:30)
**On screen:** In Ravi's chat, tap 💬. The card title reads **"⏰ Follow up with Ravi"** and the replies nudge him about the details.

**Say:**
> "Yesterday Ravi promised to send details by this morning. ConvoAI knows when each message was sent, so it reminds me he hasn't sent them yet and suggests a natural nudge, in our usual language."

### Scene 7b (optional, +15 s): ⏰ Deadline reminder
**Setup:** from a second phone, as "Mr. Sharma", send *"Update me by <now + 40 min>"*. Grant Notifications and allow "Alarms & reminders" beforehand.
**On screen:** Open Mr. Sharma's chat. After a moment, the **"⏰ Reminder set"** card appears ("Update Mr. Sharma · reminds 30 min before"). Cut to Home → Reminders showing it. *(Optionally, set "Remind me before" to 10 min and show the notification arriving.)*

**Say:**
> "And when my manager says 'update me by six', ConvoAI notices it's something I owe and sets a reminder 30 minutes before. No button needed, and I can undo it from the card."

### Scene 8: 🌐 Translate (2:30–2:42)
**On screen:** Type an English sentence. Hold 🌐 and glide to **Hindi**. Tap 🌐: the text is replaced with Devanagari Hindi, and a toast confirms it.

**Say:**
> "Hold and glide to choose a language, then tap. My message is now in Hindi, in the right script, with the same tone."

### Scene 9: 🎙 Dictation with Gnani Prisma (2:42–2:57)
**On screen:** Tap 🎙 (badge shows **HI**). Speak in Hindi, e.g. *"मैं आज शाम को पाँच बजे पहुँच जाऊँगा"*. Tap to stop: the text appears in the message box.
**On-screen caption:** `Speech-to-Text: Gnani Prisma`

**Say:**
> "For people who'd rather speak, I just talk, in Hindi or any of ten Indian languages, and **Gnani Prisma** types it for me."

### Scene 10: 🗣 Voice note in a different voice with Gnani Timbre (2:57–3:20)
**On screen:** Tap 🗣 (start chime, the red timer counts up). Say a short message. Tap to stop (stop chime). The card **"✅ Ready in Lakshmi's voice"** appears. Tap ▶ **Play** (let it play), then tap **Send to Ravi**, and the voice note appears in the chat.
**On-screen caption:** `Prisma (speech-to-text) → Timbre v3.0 (text-to-speech)`

**Say:**
> "And this is my favourite. I record a message, **Gnani Prisma** transcribes it, and **Gnani Timbre** speaks the same words in a natural voice, here Lakshmi. One tap and it's sent to the chat. It's great for privacy, accessibility, or just for fun."

### Scene 11: How it works + privacy (3:20–3:40)
**On screen:** Architecture slide (simplified from `docs/PROJECT_GUIDE.md`):

```
WhatsApp chat ──► Android accessibility service (reads the open chat, in memory only)
                         │
                 ConvoAI bubble & toolbar
            ┌────────────┼──────────────────┐
     Gnani Prisma    Gnani Timbre v3.0     Language model
    (speech→text)    (text→speech)        (rewrite / replies / translate)
```

**Say:**
> "Under the hood, an Android accessibility service reads only the open chat, in memory, and never stores it. AI runs only when you tap a button. Voice goes through Gnani Prisma and Timbre, and the writing features use a language model that understands the conversation's tone and timeline."

### Scene 12: Impact + close (3:40–4:00)
**On screen:** Slide: "ConvoAI: write better, in every language, in every chat." The mascot, then your name, team, and **`@GNANI_HANDLE`** in large text.

**Say:**
> "ConvoAI helps millions of Indians who chat across languages to communicate with confidence, by voice or by text. Built for the Gnani AI internship hackathon with **Gnani Prisma** and **Gnani Timbre**. Thank you, @Gnani AI!"

---

## Speaking tips

- Speak slowly. Pause for one second after every tap so viewers can follow.
- Mention **"Gnani Prisma"** and **"Gnani Timbre"** by name every time they're used; the judges are looking for it.
- Let the voice note and the voice sample play out loud; they're the strongest moments.
- If an AI call is slow, cut the waiting part in editing rather than re-recording.
- Keep captions on screen for the feature name (e.g. "✨ Improve") during each scene.

## Be accurate in the video

- The voice features (🎙 dictation, 🗣 voice notes, ▶ samples) use **Gnani Prisma** and **Gnani Timbre v3.0**.
- The text features (✨, 💬, 🌐, ⏰ deadline detection, catch-up) use **Google Gemini** (`gemini-3.5-flash-lite`). The app is built so that **Gnani Evon** can be switched in through one setting (`EXPO_PUBLIC_LLM_PROVIDER=evon`) once an endpoint is available. Say this if asked; don't present the text features as Gnani-powered.

---

## Post caption (LinkedIn / X)

> 🚀 Meet **ConvoAI**, an AI assistant that lives inside your WhatsApp chats.
>
> ✨ Rewrites your draft to match who you're talking to
> 💬 Smart replies that remember what's due today
> 🌐 Translate to Hindi or English in one tap
> 🎙 Speak in 10 Indian languages with **Gnani Prisma** (speech-to-text)
> 🗣 Send voice notes in 6 natural voices with **Gnani Timbre v3.0** (text-to-speech)
> ⏰ Reminds you before "update me by 6 PM" deadlines
>
> Built for the Gnani AI Internship Hackathon. Thank you **@GNANI_HANDLE** for the speech APIs! 🙌
>
> #GnaniAI #Hackathon #VoiceAI #IndianLanguages #AndroidDev #GenerativeAI

*(Replace `@GNANI_HANDLE` with the official handle from the gnani.ai footer, and add your team members' tags.)*
