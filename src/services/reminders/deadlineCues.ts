/**
 * On-phone pre-filter for ⏰ reminders (no AI, no network).
 *
 * A message is a candidate only if it mentions a time, a day, a date or a deadline
 * word. Only candidates are sent to the AI, so ordinary chat ("ok", "haha") never
 * costs a call. Kept deliberately permissive: the AI decides whether it's a real
 * commitment. A bare "by" doesn't count ("by the way"); it needs a time/day/date too.
 */

const TIME = [
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.?|p\.m\.?)(?![a-z])/i, // 6 PM, 6:30pm
  /\b\d{1,2}(?::\d{2})?\s*baje\b/i, // 6 baje
  /[0-9०-९]{1,2}\s*बजे/, // ६ बजे / 6 बजे
  /\b\d{1,2}:\d{2}\b/, // 18:00
  /\b(?:noon|midnight|subah|shaam|sham|dopahar|raat)\b/i,
];

const DAY = [
  /\b(?:today|tonight|tomorrow|tmrw|tmr|kal|aaj|parso|parson|next\s+week|this\s+week|weekend|month[-\s]?end)\b/i,
  /(?:आज|कल|परसों|सुबह|शाम|रात)/,
  /\b(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)day\b/i,
  /\b(?:somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar)\b/i,
  /(?:सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार)/,
];

const DATE = [
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
];

const DEADLINE_WORD = /\b(?:eod|eow|deadline|asap)\b/i;

export function hasDeadlineCue(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return DEADLINE_WORD.test(t) || [...TIME, ...DAY, ...DATE].some((re) => re.test(t));
}
