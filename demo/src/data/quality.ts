/**
 * Real results, not targets. Source: `npm run eval:prompts` (live Gemini 3.5 Flash Lite calls,
 * EVAL_PACE_MS=9000) run on 10 Nov 2026, plus the Kotlin unit tests
 * (`./gradlew :indic-context:testDebugUnitTest`). Re-run both and update these numbers before recording.
 */
export const QUALITY = {
  prompt: {
    /** What the red marks were (shown in the legend). */
    missLabel: 'API timeout (Gemini overloaded)',
    passed: 43,
    total: 47,
    subtitle: 'Live Gemini 3.5 Flash Lite · fixture chats in English, Hinglish & Hindi',
    when: 'One full run on 10 Nov 2026',
  },
  groups: [
    { name: 'Smart replies: date-aware, no generic check-ins', passed: 16, total: 16 },
    { name: 'Translate: Devanagari, tone kept, Hinglish converted', passed: 6, total: 6 },
    { name: 'Deadline cues & dates (on the phone, no AI)', passed: 13, total: 13 },
    { name: 'Reminders: only what you owe, nothing past', passed: 5, total: 6 },
    { name: 'Improve: formal vs banter, keeps your day', passed: 3, total: 6 },
    { name: 'Kotlin unit tests: dates & reminder times', passed: 15, total: 15 },
  ],
  note:
    'All 4 misses were API timeouts while Gemini was overloaded. Every check whose call completed passed. Failures are shown, never hidden: the app shows a Retry card instead of a fake answer.',
};
