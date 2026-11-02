/**
 * IndicContext Assistant — Context Intelligence & Recommendation Engine
 *
 * Generates dynamic, style-consistent Smart Replies, Contextual Icebreakers,
 * and Context-Aware Message Improvements.
 * Fully contextual across all tones: Slang/Bro, Friendly, Polite, Respectful, and Formal.
 */

import { ChatBubble, IcebreakerResult, SmartReplyResult, ThreadContextProfile } from '../types/context';
import { COMPREHENSIVE_HINGLISH_WORDS, GlobalUserIntent, getCleanFirstName, SLANG_WORDS } from './conversationContextDb';
import { sanitizeBubbles, sanitizeText } from '../utils/sanitizer';

// ─── Gnani Evon LLM Integration ─────────────────────────────────────────────

const EVON_ENDPOINTS = [
  'https://api.vachana.ai/v1/chat/completions',
  'https://api.inya.ai/platform/v1/chat/completions',
  'https://api.gnani.ai/v1/chat/completions',
];

const GNANI_API_KEY_DEFAULT =
  'vach_1ytE2CY5X2DI7nYe19xQ41pIcF75XgUXXFdRLhu4vuhN2qVlIHYqHNjYbqSZW3pAeBxWsMlcCQBgNUyg9O3hxFQoYUUpobcD_3d238769888eacc65a24109ee5f6fe78';

async function queryEvonLlm(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number = 0.5,
  timeoutMs: number = 4000,
): Promise<string> {
  for (const endpoint of EVON_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': GNANI_API_KEY_DEFAULT,
          Authorization: `Bearer ${GNANI_API_KEY_DEFAULT}`,
        },
        body: JSON.stringify({
          model: 'evon-3.3',
          messages,
          temperature,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content =
          data?.choices?.[0]?.message?.content ||
          data?.result ||
          data?.text ||
          '';
        if (content.trim()) return content.trim();
      }
    } catch {
      // Try next endpoint or fall through
    }
  }
  throw new Error('LLM Gateway Unreachable');
}

// ─── Conversational Language & Intent Understanding ─────────────────────────

export function detectConversationLanguage(
  incomingMsg: string,
  profile: ThreadContextProfile,
  bubbles: ChatBubble[] = [],
): 'hinglish' | 'hindi' | 'english' {
  const allTexts = [incomingMsg, ...bubbles.map((b) => b.text)].join(' ');

  // Devanagari script detection
  if (/[\u0900-\u097F]/.test(allTexts)) {
    return 'hindi';
  }

  // Count Hinglish / Slang vocabulary tokens across entire conversational context
  let hinglishCount = 0;
  const words = allTexts.toLowerCase().split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z0-9]/g, '');
    if (COMPREHENSIVE_HINGLISH_WORDS.has(clean) || SLANG_WORDS.has(clean)) {
      hinglishCount++;
    }
  }

  // Also check incoming message specifically
  const incomingWords = incomingMsg.toLowerCase().split(/\s+/);
  for (const w of incomingWords) {
    const clean = w.replace(/[^a-zA-Z0-9]/g, '');
    if (COMPREHENSIVE_HINGLISH_WORDS.has(clean) || SLANG_WORDS.has(clean)) {
      return 'hinglish';
    }
  }

  if (hinglishCount >= 1 || profile.languageStyle === 'hinglish') {
    return 'hinglish';
  }

  return 'english';
}

export type ConversationTheme =
  | 'DRAMA_REACTION'
  | 'GAMING'
  | 'COLLEGE_SUBMISSION'
  | 'TRAVEL_COMMUTE'
  | 'ROASTING_BANTER'
  | 'MEET_PLAN'
  | 'STATUS_UPDATE'
  | 'ACK_RECEIVED'
  | 'FEEDBACK_OPINION'
  | 'AVAILABILITY_CALL'
  | 'CASUAL_CHAT';

export interface ConversationContextDetails {
  theme: ConversationTheme;
  topic: string;
  isQuestion: boolean;
  isSlang: boolean;
  formality: 1 | 2 | 3 | 4 | 5;
  language: 'hinglish' | 'hindi' | 'english';
  firstName: string;
}

export function extractConversationDetails(
  incomingMsg: string,
  profile: ThreadContextProfile,
  bubbles: ChatBubble[] = [],
): ConversationContextDetails {
  const lowerMsg = incomingMsg.toLowerCase();
  const allHistory = bubbles.map((b) => b.text).join(' ').toLowerCase();
  const combined = `${lowerMsg} ${allHistory}`;
  const language = detectConversationLanguage(incomingMsg, profile, bubbles);
  const firstName = getCleanFirstName(profile.threadTitle);

  // Check if slang / bro banter is present
  const isSlang =
    /\b(bhnchoo|bc|mc|lode|chutiya|baap|deadshot|chid|bhadak|react|reaction|kalesh|lafda|merko|merse|muje)\b/i.test(
      combined,
    ) || /[😂🤣]/.test(combined);

  // 1. Topic Extraction
  let topic = '';
  if (/\b(deadshot|pubg|bgmi|game)\b/i.test(combined)) topic = 'deadshot';
  else if (/\b(exp3|pdf|submission|assignment|lab)\b/i.test(combined)) topic = 'submission';
  else if (/\b(tannu|group|reaction|emoji|qr)\b/i.test(combined)) topic = 'group drama';
  else if (/\b(train|station|metro)\b/i.test(combined)) topic = 'train';
  else if (/\b(cafe|coffee|dinner|lunch|food)\b/i.test(combined)) topic = 'cafe';
  else if (/\b(project|report|code|design)\b/i.test(combined)) topic = 'project';

  // 2. Theme & Intent Classification
  let theme: ConversationTheme = 'CASUAL_CHAT';

  if (
    /\b(chid|chidna|bhadak|react|reaction|hta liya|laughing|emoji|qr|group pe|convo|serious convo|lafda|kalesh|natak|overacting)\b/i.test(
      lowerMsg,
    ) ||
    (/\b(chid|react|reaction|emoji)\b/i.test(allHistory) && /\b(bhnchoo|bc|lode|kha|dekha|usne)\b/i.test(lowerMsg))
  ) {
    theme = 'DRAMA_REACTION';
  } else if (/\b(deadshot|khelenge|game|match|online aaja|bgmi|pubg|cod|squad)\b/i.test(lowerMsg) || (/\b(deadshot|game)\b/i.test(allHistory) && /\b(done|raat|khel|aaja)\b/i.test(lowerMsg))) {
    theme = 'GAMING';
  } else if (
    /\b(submit|exp3|pdf|assignment|lab|attendance|marks|exam|test)\b/i.test(lowerMsg) ||
    (/\.pdf\b/i.test(lowerMsg) && /\b(submit|kr diya)\b/i.test(lowerMsg))
  ) {
    theme = 'COLLEGE_SUBMISSION';
  } else if (/\b(train|ghar pauch|rukne wali|network ni aare|station|traffic|signal|paucha|pauch)\b/i.test(lowerMsg)) {
    theme = 'TRAVEL_COMMUTE';
  } else if (/\b(baap ko kitna dhyan|baap|lode ne|bhnchoo|chutiya)\b/i.test(lowerMsg)) {
    theme = 'ROASTING_BANTER';
  } else if (/\b(milte|milna|milenge|plan|cafe|dinner|lunch|party|chalna|baje|venue)\b/i.test(lowerMsg)) {
    theme = 'MEET_PLAN';
  } else if (/\b(kab tak|status|update|ready|complete|kahan tak pahuncha|hua kya|bheja kya|bhejoge|progress)\b/i.test(lowerMsg)) {
    theme = 'STATUS_UPDATE';
  } else if (/\b(bhej diya|send kar diya|sent|shared|link|check kar|dekh le|attached|forwarded)\b/i.test(lowerMsg)) {
    theme = 'ACK_RECEIVED';
  } else if (/\b(kaisa laga|kaisa hai|theek hai na|kya lagta hai|how is|review|feedback)\b/i.test(lowerMsg)) {
    theme = 'FEEDBACK_OPINION';
  } else if (/\b(free ho|call karu|baat kare|call pe|available|call kar|free hai)\b/i.test(lowerMsg)) {
    theme = 'AVAILABILITY_CALL';
  }

  const isQuestion = lowerMsg.includes('?') || /\b(kya|kab|kahan|kidhar|kaisa|kaise|kitna|when|where|how|why)\b/i.test(lowerMsg);

  return {
    theme,
    topic,
    isQuestion,
    isSlang,
    formality: isSlang ? 1 : profile.formalityLevel,
    language,
    firstName,
  };
}

// ─── 1. Smart Reply Recommendations ─────────────────────────────────────────

export async function generateSmartReplies(
  incomingMessage: string,
  profile: ThreadContextProfile,
  globalIntent: GlobalUserIntent,
  bubbles: ChatBubble[] = [],
): Promise<SmartReplyResult> {
  const sanitizedMsg = sanitizeText(incomingMessage).sanitized;
  const recentHistory = sanitizeBubbles(bubbles.slice(-6))
    .map((b) => `${b.isSelf ? 'You' : profile.threadTitle}: ${b.text}`)
    .join('\n');

  const detectedLang = detectConversationLanguage(incomingMessage, profile, bubbles);
  const details = extractConversationDetails(incomingMessage, profile, bubbles);

  // Build a representative sample of actual words used in the conversation to enforce style
  const allWords = bubbles.flatMap(b => b.text.toLowerCase().split(/\s+/)).filter(w => w.length > 1);
  const sampleSlangUsed = allWords.filter(w => SLANG_WORDS.has(w.replace(/[^a-z0-9]/g, ''))).slice(0, 6);
  const styleEnforcer = sampleSlangUsed.length > 0
    ? `CRITICAL: The conversation uses words like: ${sampleSlangUsed.join(', ')}. Your replies MUST use the same vocabulary and slang. Do NOT switch to formal or generic English.`
    : detectedLang === 'hinglish'
    ? `CRITICAL: The conversation is in Indian Hinglish. All 3 replies MUST be in the same Hinglish mix as the chat. Do NOT reply in pure English or use corporate language.`
    : '';

  const systemPrompt = `You are a WhatsApp quick-reply assistant. Generate exactly 3 replies for the LAST incoming message.

Recipient first name: ${details.firstName}
Relationship: ${profile.persona}, Formality: ${details.formality}/5
${styleEnforcer}

Rules:
1. READ the last message carefully. Reply SPECIFICALLY to what was said — not a generic greeting.
2. Match the EXACT tone: ${details.isSlang ? 'casual Indian college buddy slang (use "bhai", "bro", "yaar", abusive slang if used in chat)' : detectedLang === 'hinglish' ? 'natural Hinglish (mix Hindi + English words as they do)' : 'natural conversational English'}.
3. Each reply must be SHORT (under 12 words ideally), direct, and sound like a real person texted it.
4. If the chat has drama/gossip/reaction topics: reply about THAT drama. If gaming: reply about THAT game. If travel: reply about THAT journey. Never deviate.
5. NEVER start with "Sab mast", "Hope you are doing well", "How are things" — that is not how friends text.

Respond ONLY in valid JSON (no markdown, no extra text):
{"suggestions": ["reply1", "reply2", "reply3"], "reason": "one line tone explanation"}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Full Chat History (oldest to newest):\n${recentHistory}\n\n>> Last message to reply to: "${sanitizedMsg}"`,
        },
      ],
      0.7,
      5000,
    );

    // Try to extract JSON even if LLM wraps in markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return {
        suggestions: parsed.suggestions.slice(0, 3),
        reason: parsed.reason || `Tailored for ${profile.persona} (${detectedLang})`,
        detectedTone: profile.sentimentTone,
        languageUsed: detectedLang,
      };
    }
  } catch {
    // Proceed to high-fidelity contextual heuristic engine
  }

  return generateContextualRepliesLocally(incomingMessage, profile, bubbles);
}

export function generateContextualRepliesLocally(
  msg: string,
  profile: ThreadContextProfile,
  bubbles: ChatBubble[] = [],
): SmartReplyResult {
  const details = extractConversationDetails(msg, profile, bubbles);
  const isSlang = details.isSlang || details.formality === 1;
  const isFriend = details.formality <= 2 || profile.persona === 'Friend';
  const isBossOrClient = details.formality >= 4 || profile.persona === 'Boss' || profile.persona === 'Client';
  const isElder = profile.persona === 'Elder';

  const suggestions: string[] = [];

  // ── 1. DRAMA_REACTION (e.g. Tannu chid gyi, reaction hta liya, emoji, group) ──
  if (details.theme === 'DRAMA_REACTION') {
    if (isSlang || isFriend) {
      suggestions.push(`Wahi to bc, maine to bas mazaak me react kiya tha pata nahi kyu bhadak gayi 😂`);
      suggestions.push(`Bhai group pe alag hi nautanki chal rahi hai sabki, chhod na lite le`);
      suggestions.push(`Maine to reaction hata bhi liya tha turant, fir bhi itna mudda bana diya 😂`);
    } else {
      suggestions.push(`Haan maine dekha, thoda misunderstanding ho gaya lagta hai.`);
      suggestions.push(`Koi baat nahi, normal clarification de denge.`);
      suggestions.push(`Reaction to hata diya tha, tension mat lo.`);
    }
  }

  // ── 2. GAMING (e.g. deadshot, khelenge, game, match) ──
  else if (details.theme === 'GAMING') {
    if (isSlang || isFriend) {
      suggestions.push(`Haan raat ko pakka aate hain deadshot pe, 10 baje tak online aa jaiyo!`);
      suggestions.push(`Done hai bhai, khana khake seedha squad baithate hain.`);
      suggestions.push(`Sahi hai bhai, raat ko maze karte hain deadshot pe.`);
    } else {
      suggestions.push(`Sounds good! Let's connect for the game later tonight.`);
      suggestions.push(`Done! Let me know once you log in.`);
      suggestions.push(`Count me in for tonight!`);
    }
  }

  // ── 3. COLLEGE_SUBMISSION (e.g. exp3, pdf, submit) ──
  else if (details.theme === 'COLLEGE_SUBMISSION') {
    if (isSlang || isFriend) {
      suggestions.push(`Ha bhai kr diya tha ye to, tension mat le.`);
      suggestions.push(`Haan ye wala submit ho gaya hai, agla wala dekhna hai ab.`);
      suggestions.push(`Dekh liya tha maine, submission sorted hai apna.`);
    } else {
      suggestions.push(`Yes, this submission has been completed.`);
      suggestions.push(`Checked and submitted, thank you for sharing.`);
      suggestions.push(`Acknowledged, moving on to the next assignment.`);
    }
  }

  // ── 4. TRAVEL_COMMUTE (e.g. train, ghar pauch, network ni aare) ──
  else if (details.theme === 'TRAVEL_COMMUTE') {
    if (isSlang || isFriend) {
      suggestions.push(`Haan ghar pahunch ke message kariyo aaram se.`);
      suggestions.push(`Network chala gaya tha lagta hai tera, safe pahunch ja pehle.`);
      suggestions.push(`Bas 10 minute me ghar pahunch ke batata hu bhai.`);
    } else {
      suggestions.push(`Please reach safely and update once home.`);
      suggestions.push(`Network issues noticed, talk soon once you arrive.`);
      suggestions.push(`Will update once I reach the destination.`);
    }
  }

  // ── 5. ROASTING_BANTER (e.g. baap ko kitna dhyan rhta h) ──
  else if (details.theme === 'ROASTING_BANTER') {
    suggestions.push(`Abe chal na bada aaya baap banne 😂`);
    suggestions.push(`Haha shukriya baap ji, ahsaan mand hu tera 😂`);
    suggestions.push(`Itna dhyan to khud ka nahi rakhta tu jitna mera rakh raha hai 😂`);
  }

  // ── 6. MEET_PLAN (e.g. cafe, dinner, milte hain) ──
  else if (details.theme === 'MEET_PLAN') {
    const spot = details.topic ? details.topic : 'cafe';
    if (isSlang || isFriend) {
      suggestions.push(`Haan bilkul bhai! Shaam ko ${spot} pe milte hain, kitne baje chalna hai?`);
      suggestions.push(`Haan chalega! 6:30 ya 7 baje tak ${spot} pahunchte hain.`);
      suggestions.push(`Plan sahi hai bhai, exact time bata nikalta hu.`);
    } else if (isBossOrClient) {
      suggestions.push(`Ji Sir, available for the meeting. Please confirm the suitable time.`);
      suggestions.push(`Post 3 PM works best for the discussion Sir.`);
      suggestions.push(`Noted Sir, sharing my schedule shortly.`);
    } else if (isElder) {
      suggestions.push(`Ji bilkul, shaam ko milte hain. Aap samay bata dijiye, pranam.`);
      suggestions.push(`Haanji main us samay tak aa jaunga ji.`);
      suggestions.push(`Ji theek hai, aapke hisaab se plan finalize karte hain.`);
    } else {
      suggestions.push(`Sounds like a plan! Let me know what time works best.`);
      suggestions.push(`Count me in, see you there!`);
      suggestions.push(`Awesome, let's catch up then!`);
    }
  }

  // ── 7. STATUS_UPDATE (e.g. kab tak bhejoge file) ──
  else if (details.theme === 'STATUS_UPDATE') {
    if (isSlang || isFriend) {
      suggestions.push(`Bas 10-15 minute me bhej raha hu bhai, almost ready hai.`);
      suggestions.push(`Review kar raha hu, shaam tak pakka send karta hu.`);
      suggestions.push(`Kaam chal raha hai uspe, free hote hi forward karta hu.`);
    } else if (isBossOrClient) {
      suggestions.push(`Working on it right now Sir, will share the update in 30 minutes.`);
      suggestions.push(`Almost finalized Sir, sending it across shortly for your review.`);
      suggestions.push(`Reviewing the deliverables Sir, will update you by 4 PM.`);
    } else {
      suggestions.push(`Bas thodi der me bhejta hu ji, kaam lagbhag complete hai.`);
      suggestions.push(`Ji kaam chal raha hai uspe, jald hi update karta hu.`);
      suggestions.push(`Thoda sa time lagega, free hoke forward karta hu.`);
    }
  }

  // ── 8. ACK_RECEIVED (e.g. bhej diya check kar lo) ──
  else if (details.theme === 'ACK_RECEIVED') {
    if (isSlang || isFriend) {
      suggestions.push(`Haan mil gaya bhai, check karke thodi der me batata hu.`);
      suggestions.push(`Sahi hai! Ek baar dekh leta hu fir call karta hu.`);
      suggestions.push(`Thanks bhai! Abhi open karke dekh raha hu.`);
    } else if (isBossOrClient) {
      suggestions.push(`Received with thanks Sir. Reviewing it now and will revert shortly.`);
      suggestions.push(`Acknowledged Sir. I will go through the details and share feedback.`);
      suggestions.push(`Thank you Sir, will follow up promptly.`);
    } else {
      suggestions.push(`Ji mil gaya, dhanyawad. Dekh kar batata hu aapko.`);
      suggestions.push(`Prapt ho gaya ji, aabhar.`);
      suggestions.push(`Ji samajh gaya, dhanyawad.`);
    }
  }

  // ── 9. FEEDBACK_OPINION (e.g. kaisa laga design) ──
  else if (details.theme === 'FEEDBACK_OPINION') {
    if (isSlang || isFriend) {
      suggestions.push(`Kafi sahi lag raha hai bhai, overall ekdum mast hai!`);
      suggestions.push(`Accha laga yaar, bas 1-2 chhote points the jo discuss karne hain.`);
      suggestions.push(`Thoda busy tha, abhi dhyan se dekh ke detail me batata hu.`);
    } else if (isBossOrClient) {
      suggestions.push(`Looks very promising Sir, structuring kafi clean aur solid hai.`);
      suggestions.push(`Overall review positive hai Sir, have noted minor refinements.`);
      suggestions.push(`Reviewing in detail Sir, structured feedback jald share karta hu.`);
    } else {
      suggestions.push(`Kafi accha laga ji, bahut sundar hai.`);
      suggestions.push(`Ji dekh liya, bahut badhiya prayas hai.`);
      suggestions.push(`Thoda dekh kar vistaar se batata hu ji.`);
    }
  }

  // ── 10. AVAILABILITY_CALL (e.g. free ho kya) ──
  else if (details.theme === 'AVAILABILITY_CALL') {
    if (isSlang || isFriend) {
      suggestions.push(`Haan bilkul free hu bhai, call kar le abhi.`);
      suggestions.push(`Thoda sa fasa hu yaar, 10-15 minute me call back karta hu.`);
      suggestions.push(`Abhi ek meeting me hu, shaam ko aaram se baat karte hain.`);
    } else if (isBossOrClient) {
      suggestions.push(`Ji Sir, bilkul free hu, aap call kar sakte hain.`);
      suggestions.push(`Currently in a quick meeting Sir, will call you back in 15 mins.`);
      suggestions.push(`Could we connect post 4 PM today Sir?`);
    } else {
      suggestions.push(`Ji bilkul, aap kripya call kar lijiye.`);
      suggestions.push(`Bas thodi der me call karta hu ji, pranam.`);
      suggestions.push(`Aap jab chahein call kar sakte hain ji.`);
    }
  }

  // ── 11. CASUAL_CHAT / FALLBACK ──
  else {
    if (isSlang || isFriend) {
      suggestions.push(`Wahi to bhai, alag hi scene chal raha hai 😂`);
      suggestions.push(`Haan bhai samjha, sahi hai!`);
      suggestions.push(`Chal theek hai, thodi der me connect karte hain.`);
    } else if (isBossOrClient) {
      suggestions.push(`Understood Sir, noted and proceeding accordingly.`);
      suggestions.push(`Thank you for the update Sir, will follow up promptly.`);
      suggestions.push(`Received Sir, will keep you posted.`);
    } else if (isElder) {
      suggestions.push(`Pranam ji, sab badhiya hai. Aap sunaiye kaisa chal raha hai?`);
      suggestions.push(`Aapka aashirwad hai ji, sab kushal mangal hai.`);
      suggestions.push(`Ji theek hai, dhanyawad pranam.`);
    } else {
      suggestions.push(`Sounds good! Talk to you shortly.`);
      suggestions.push(`Got it, thanks for letting me know!`);
      suggestions.push(`All good here, catch up soon!`);
    }
  }

  return {
    suggestions: suggestions.slice(0, 3),
    reason: `Inferred contextually for ${profile.persona} (${details.theme})`,
    detectedTone: profile.sentimentTone,
    languageUsed: details.language,
  };
}

// ─── 2. Context-Driven Icebreakers ──────────────────────────────────────────

export async function generateContextualIcebreakers(
  bubbles: ChatBubble[],
  profile: ThreadContextProfile,
  globalIntent: GlobalUserIntent,
): Promise<IcebreakerResult> {
  const safeBubbles = sanitizeBubbles(bubbles.slice(-10));
  const firstName = getCleanFirstName(profile.threadTitle);
  const history = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : firstName}: ${b.text}`)
    .join('\n');

  const detectedLang = detectConversationLanguage('', profile, bubbles);
  const details = extractConversationDetails(
    bubbles.length > 0 ? bubbles[bubbles.length - 1].text : '',
    profile,
    bubbles,
  );

  // Build style enforcer from actual conversation words
  const allWords = bubbles.flatMap(b => b.text.toLowerCase().split(/\s+/));
  const sampleSlang = allWords.filter(w => SLANG_WORDS.has(w.replace(/[^a-z0-9]/g, ''))).slice(0, 5);
  const styleHint = sampleSlang.length > 0
    ? `The chat uses: ${sampleSlang.join(', ')}. Use that same register.`
    : detectedLang === 'hinglish' ? `Write in Hinglish the same way as the chat above.` : '';

  const systemPrompt = `You are generating 3 conversation-opener messages for WhatsApp. The user wants to restart or continue a conversation with ${firstName}.

IMPORTANT:
- Use ONLY the first name "${firstName}" — never the full name.
- Language: ${detectedLang === 'hinglish' ? 'Conversational Indian Hinglish' : 'Natural English'}.
- ${styleHint}
- Relationship: ${profile.persona}. ${profile.persona === 'Friend' ? 'Use buddy language (yaar, bhai, oye, arre). No corporate terms like "sync" or "kindly".' : ''}
- Opener 1: Pick up on the MOST RECENT topic discussed (the actual thing they were talking about last — drama, game, travel, submission, etc.) and ask a natural follow-up.
- Opener 2: Invite to connect or continue the chat naturally.
- Opener 3: A warm casual check-in.
- Each opener must sound like a real person texting — short, casual, genuine.

Respond ONLY in valid JSON (no markdown):
{"suggestions": ["opener1", "opener2", "opener3"], "category": "followup"}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Chat History (most recent messages):\n${history || 'No prior messages — generate a fresh opener.'}` },
      ],
      0.72,
      5000,
    );

    // Extract JSON even if LLM wraps in markdown code blocks
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return {
        suggestions: parsed.suggestions.slice(0, 3),
        category: 'followup',
      };
    }
  } catch {
    // Local contextual generator
  }

  return generateIcebreakersLocally(bubbles, profile);
}

export function generateIcebreakersLocally(
  bubbles: ChatBubble[],
  profile: ThreadContextProfile,
): IcebreakerResult {
  const firstName = getCleanFirstName(profile.threadTitle);
  const allHistory = bubbles.map((b) => b.text).join(' ').toLowerCase();
  const isSlang =
    /\b(bhnchoo|bc|mc|lode|chutiya|baap|deadshot|chid|bhadak|react|reaction|merko|merse|muje)\b/i.test(allHistory) ||
    /[😂🤣]/.test(allHistory);
  const isFriend = isSlang || profile.persona === 'Friend' || profile.formalityLevel <= 2;
  const isBoss = profile.persona === 'Boss' || profile.persona === 'Client' || profile.formalityLevel >= 4;
  const isElder = profile.persona === 'Elder';

  const suggestions: string[] = [];

  // Detect exact conversational subject
  const hasDrama = /\b(chid|react|reaction|emoji|qr|group|tannu)\b/i.test(allHistory);
  const hasGame = /\b(deadshot|game|khelenge|pubg|bgmi)\b/i.test(allHistory);
  const hasTravel = /\b(train|station|ghar pauch|network)\b/i.test(allHistory);
  const hasSubmission = /\b(submit|exp3|pdf|assignment|lab)\b/i.test(allHistory);
  const hasCafe = /\b(cafe|coffee|dinner|lunch)\b/i.test(allHistory);

  // ── Option 1: Continuation of Incomplete Topic / Previous Discussion ──
  if (isFriend) {
    if (hasDrama) {
      suggestions.push(`Aur ${firstName}, us group wale scene ka kya hua fir baad me? 😂`);
    } else if (hasGame) {
      suggestions.push(`Bhai Deadshot kab chalna hai fir aaj raat ko?`);
    } else if (hasTravel) {
      suggestions.push(`Ghar pahunch gaya tha kya bhai aaram se?`);
    } else if (hasSubmission) {
      suggestions.push(`Bhai lab experiment wala submission ho gaya tha na tera?`);
    } else if (hasCafe) {
      suggestions.push(`Aur ${firstName}, cafe chalne ka kya scene bana fir?`);
    } else {
      suggestions.push(`Aur bhai ${firstName}, kya chal raha hai aaj kal?`);
    }
  } else if (isBoss) {
    suggestions.push(`Good day Sir, following up on our earlier discussion.`);
  } else if (isElder) {
    suggestions.push(`Pranam ${firstName} ji, aapse baat karni thi to message kiya.`);
  } else {
    suggestions.push(`Hey ${firstName}, following up on our previous conversation!`);
  }

  // ── Option 2: Follow-up on Availability / Call / Next Steps ──
  if (isFriend) {
    if (hasDrama) {
      suggestions.push(`Free hoke call kariyo ${firstName}, ek mast baat batani hai.`);
    } else if (hasGame) {
      suggestions.push(`Free ho to aaja game pe thodi der!`);
    } else {
      suggestions.push(`Free ho to batao bhai, thodi der me call karta hu.`);
    }
  } else if (isBoss) {
    suggestions.push(`Please let me know if you have 5 minutes for a brief status alignment Sir.`);
  } else if (isElder) {
    suggestions.push(`Aap jab bhi free ho batana ji, ek baar call pe baat karte hain.`);
  } else {
    suggestions.push(`Let me know when you're free for a quick sync!`);
  }

  // ── Option 3: Authentic Relationship Check-in ──
  if (isFriend) {
    suggestions.push(`Aur bhai ${firstName}, kya haal chaal? Sab sorted chal raha hai?`);
  } else if (isBoss) {
    suggestions.push(`Good morning Sir, hope you are having a productive week.`);
  } else if (isElder) {
    suggestions.push(`Pranam ${firstName} ji, kaisa chal raha hai sab? Aasha hai sab kushal hoga.`);
  } else {
    suggestions.push(`Hey ${firstName}, hope you're having a great week so far!`);
  }

  return {
    suggestions: suggestions.slice(0, 3),
    category: 'followup',
  };
}

// ─── 3. Context-Aware Message Improvement ───────────────────────────────────

export interface ImproveMessageResult {
  improvedDraft: string;
  alternativeDrafts: string[];
  explanation: string;
  wasModified: boolean;
}

export async function improveMessageWithContext(
  rawDraft: string,
  profile: ThreadContextProfile,
  globalIntent: GlobalUserIntent,
  bubbles: ChatBubble[] = [],
): Promise<ImproveMessageResult> {
  const trimmed = rawDraft.trim();
  if (!trimmed) {
    return {
      improvedDraft: '',
      alternativeDrafts: [],
      explanation: 'No draft provided',
      wasModified: false,
    };
  }

  const detectedLang = detectConversationLanguage(rawDraft, profile, bubbles);
  const details = extractConversationDetails(rawDraft, profile, bubbles);
  const sanitized = sanitizeText(trimmed).sanitized;
  const recentHistory = sanitizeBubbles(bubbles.slice(-4))
    .map((b) => `${b.isSelf ? 'You' : profile.threadTitle}: ${b.text}`)
    .join('\n');

  const systemPrompt = `You are improving a WhatsApp draft message. Make it sound better while keeping the SAME tone and language as the conversation.

Recipient: ${details.firstName} (Relationship: ${profile.persona}, Formality: ${details.formality}/5)
Language: ${detectedLang === 'hinglish' ? 'Indian Hinglish (mix Hindi+English as in the chat)' : 'Natural English'}
Style: ${details.isSlang ? 'Casual buddy slang — keep it informal and natural' : details.formality >= 4 ? 'Formal and respectful' : 'Natural conversational'}

Rules:
1. Improve clarity, warmth, and flow — but STAY in the same language and tone as the draft.
2. If the draft is in Hinglish, improve it IN Hinglish. Do NOT switch to formal English.
3. If the draft is blunt or awkward, rephrase it to sound more natural for a ${profile.persona}.
4. Keep it SHORT — under 20 words per option ideally.
5. Provide 1 primary improved version + 2 alternatives (slight variations in phrasing).

Respond ONLY in valid JSON (no markdown):
{
  "improvedDraft": "best improved version",
  "alternativeDrafts": ["alt1", "alt2"],
  "explanation": "what was improved"
}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Recent Conversation Context:\n${recentHistory || 'No prior context'}\n\nDraft to improve:\n"${sanitized}"`,
        },
      ],
      0.35,
      5000,
    );

    // Extract JSON even if LLM wraps in markdown code blocks
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    if (parsed.improvedDraft && parsed.improvedDraft.trim()) {
      return {
        improvedDraft: parsed.improvedDraft.trim(),
        alternativeDrafts: Array.isArray(parsed.alternativeDrafts) ? parsed.alternativeDrafts.slice(0, 2) : [],
        explanation: parsed.explanation || `Polished for ${profile.persona} (${detectedLang})`,
        wasModified: parsed.improvedDraft.trim() !== trimmed,
      };
    }
  } catch {
    // Local contextual enhancer
  }

  return improveMessageLocally(trimmed, profile, bubbles);
}

export function improveMessageLocally(
  draft: string,
  profile: ThreadContextProfile,
  bubbles: ChatBubble[] = [],
): ImproveMessageResult {
  const lower = draft.toLowerCase();
  const details = extractConversationDetails(draft, profile, bubbles);
  const isSlang = details.isSlang || details.formality === 1;
  const isBossOrClient = profile.persona === 'Boss' || profile.persona === 'Client' || details.formality >= 4;
  const isElder = profile.persona === 'Elder';
  const isFriend = isSlang || profile.persona === 'Friend' || details.formality <= 2;

  let improved = draft;
  const alternatives: string[] = [];
  let explanation = 'Enhanced phrasing and conversational tone';

  // Common messaging patterns
  if (isBossOrClient) {
    if (lower.includes('bhej') || lower.includes('send') || lower.includes('give')) {
      improved = `Sir, could you please share the update whenever you have a moment? Thank you.`;
      alternatives.push(`Kindly share the files at your earliest convenience, Sir.`);
      alternatives.push(`Following up regarding the documents, whenever suitable Sir.`);
      explanation = 'Rephrased requesting update with respectful professional framing for senior.';
    } else if (lower.includes('kahan') || lower.includes('where')) {
      improved = `Good day Sir, just checking in to confirm your arrival time/status. Thank you.`;
      alternatives.push(`Sir, please let me know your estimated arrival time.`);
      explanation = 'Softened status inquiry with respectful honorifics.';
    } else {
      improved = `Sir, ${draft} — kindly letting you know. Thank you.`;
      alternatives.push(`Could you please check this: "${draft}"? Thank you, Sir.`);
      explanation = 'Added professional framing for senior contact.';
    }
  } else if (isElder) {
    if (lower.includes('bhej') || lower.includes('de')) {
      improved = `Pranam, aapse anurodh hai ki samay milte hi bhej dijiye ga.`;
      alternatives.push(`Pranam ji, jab bhi aapke paas samay ho forward kar dijiyega.`);
      explanation = 'Converted to respectful Hindi honorifics (Pranam / Anurodh).';
    } else if (lower.includes('kahan') || lower.includes('kidhar')) {
      improved = `Pranam ji, aap kahan pahunche? Aasha hai sab kushal hoga.`;
      alternatives.push(`Pranam ji, pahunch kar ek baar inform kar dijiye ga.`);
      explanation = 'Added respectful elder greeting.';
    } else {
      improved = `Pranam ji, ${draft}`;
      alternatives.push(`Pranam, ${draft} — aapse anurodh hai.`);
      explanation = 'Added respectful elder greeting.';
    }
  } else if (isFriend) {
    if (lower.includes('jaldi bhej') || lower.includes('tu bhej') || lower.includes('send now')) {
      improved = `Bhai thoda jaldi bhej de please, wait kar raha hu!`;
      alternatives.push(`Oye jaldi bhej na bhai, kitna time lagayega 😂`);
      alternatives.push(`Bhai free hote hi forward kar diyo please!`);
      explanation = 'Replaced blunt demand with friendly, natural peer phrasing.';
    } else if (lower.includes('kahan hai') || lower.includes('kaha hai') || lower.includes('where are you')) {
      improved = `Bhai kidhar pahuncha? Bata de ek baar.`;
      alternatives.push(`Oye kahan fasa hua hai abhi?`);
      alternatives.push(`Bhai location pe hi ho ya nikal rahe ho?`);
      explanation = 'Made inquiry warmer and conversational.';
    } else if (lower.includes('call kar') || lower.includes('phone kar')) {
      improved = `Bhai free hoke ek baar call kar le please.`;
      alternatives.push(`Free ho to aaja call pe thodi der!`);
      explanation = 'Polished call request to warm buddy tone.';
    } else if (lower.includes('done') || lower.includes('theek hai')) {
      improved = `Haan done hai bhai, scene sorted!`;
      alternatives.push(`Sahi hai bhai, chalega!`);
      explanation = 'Polished confirmation with natural buddy slang.';
    } else {
      improved = `${draft} bhai!`;
      alternatives.push(`${draft} yaar!`);
      explanation = 'Reframed to natural, warm buddy tone.';
    }
  }

  return {
    improvedDraft: improved,
    alternativeDrafts: alternatives.slice(0, 2),
    explanation,
    wasModified: improved !== draft,
  };
}
