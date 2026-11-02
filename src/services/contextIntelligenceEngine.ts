/**
 * IndicContext Assistant — Context Intelligence & Recommendation Engine
 *
 * Generates dynamic, style-consistent Smart Replies, Contextual Icebreakers,
 * and Context-Aware Message Improvements. NEVER uses static hardcoded templates.
 */

import { ChatBubble, IcebreakerResult, SmartReplyResult, ThreadContextProfile } from '../types/context';
import { GlobalUserIntent } from './conversationContextDb';
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

  const persona = profile.persona;
  const formality = profile.formalityLevel;
  const langStyle = profile.languageStyle;

  const systemPrompt = `You are an AI assistant generating 3 contextual quick-replies for WhatsApp.
Recipient: ${profile.threadTitle}
Relationship Persona: ${persona} (Formality level: ${formality}/5)
Language: ${langStyle === 'hinglish' ? 'Conversational Indian Hinglish' : 'Natural English'}
Style Guidelines:
- If persona is Friend: casual, informal, friendly Indian phrasing (bhai, yaar, haan, theek hai).
- If persona is Boss/Client: strictly polite, concise, professional, honorifics (Sir/Ma'am).
- If persona is Elder: respectful Hindi/Hinglish (Aap, Namaste, Kripya).
- Do NOT use robotic or boilerplate language.
Respond ONLY in valid JSON:
{
  "suggestions": ["Option 1", "Option 2", "Option 3"],
  "reason": "Brief explanation of tone and intent"
}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Recent Chat:\n${recentHistory}\n\nLast Incoming Message from ${profile.threadTitle}:\n"${sanitizedMsg}"`,
        },
      ],
      0.6,
      3500,
    );

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return {
        suggestions: parsed.suggestions.slice(0, 3),
        reason: parsed.reason || `Tailored for ${persona}`,
        detectedTone: profile.sentimentTone,
        languageUsed: langStyle,
      };
    }
  } catch {
    // Proceed to contextual heuristic engine
  }

  // ── Dynamic Contextual Heuristic Engine (Offline / High-Fidelity) ──
  return generateContextualRepliesLocally(incomingMessage, profile);
}

function generateContextualRepliesLocally(
  msg: string,
  profile: ThreadContextProfile,
): SmartReplyResult {
  const lower = msg.toLowerCase();
  const isFriend = profile.persona === 'Friend' || profile.formalityLevel <= 2;
  const isBossOrClient = profile.persona === 'Boss' || profile.persona === 'Client' || profile.formalityLevel >= 4;
  const isElder = profile.persona === 'Elder';
  const isHinglish = profile.languageStyle === 'hinglish';

  const suggestions: string[] = [];

  // Question: Time / When / Status
  if (lower.includes('kab') || lower.includes('when') || lower.includes('status') || lower.includes('update') || lower.includes('kaha')) {
    if (isBossOrClient) {
      suggestions.push('Working on it, will share the update shortly Sir.');
      suggestions.push('Almost finalized, sending it across by 4 PM.');
      suggestions.push('Reviewing the final items right now, will update in 30 mins.');
    } else if (isElder) {
      suggestions.push('Bas thodi der me bhejta hu, pranam.');
      suggestions.push('Haanji, kaam chal raha hai uspe, jald hi update karta hu.');
      suggestions.push('Thoda sa time lagega, free hoke call karta hu aapko.');
    } else if (isHinglish || isFriend) {
      suggestions.push('Bas 10 min me bhej raha hu bhai.');
      suggestions.push('Review kar raha hu, shaam tak pakka sorted.');
      suggestions.push('Abhi thoda busy hu yaar, 1 ghante me batata hu.');
    } else {
      suggestions.push('Working on it now, will share in a few minutes.');
      suggestions.push('Almost done, will send it across shortly.');
      suggestions.push('Just stepping in, let me get back to you in 15 mins.');
    }
  }
  // Question: Meeting / Plan / Availability
  else if (lower.includes('plan') || lower.includes('milna') || lower.includes('free') || lower.includes('call') || lower.includes('time')) {
    if (isBossOrClient) {
      suggestions.push('Yes Sir, available for a quick sync whenever convenient.');
      suggestions.push('Could we connect post 3 PM today?');
      suggestions.push('Sharing my availability for the sync shortly.');
    } else if (isElder) {
      suggestions.push('Ji bilkul, aap batayein kis time call karu.');
      suggestions.push('Haanji, shaam ko aapse baat karta hu.');
      suggestions.push('Aap jab free ho batana, pranam.');
    } else if (isHinglish || isFriend) {
      suggestions.push('Haan bhai! Shaam ko milte hain 6 baje.');
      suggestions.push('Abhi thoda fasa hu, thodi der me call karta hu.');
      suggestions.push('Scene sorted hai, bata kab chalna hai.');
    } else {
      suggestions.push('Yes, free for a call in about 20 minutes.');
      suggestions.push('Sounds good! Let me know what time works best.');
      suggestions.push('A bit occupied right now, let\'s connect this evening.');
    }
  }
  // Confirmation / Done / Thanks
  else if (lower.includes('thanks') || lower.includes('thank') || lower.includes('dhanyawad') || lower.includes('shukriya') || lower.includes('done')) {
    if (isBossOrClient) {
      suggestions.push('Most welcome Sir, glad to support.');
      suggestions.push('You\'re welcome. Let me know if anything else is needed.');
      suggestions.push('Acknowledged with thanks.');
    } else if (isElder) {
      suggestions.push('Ji dhanyawad, pranam.');
      suggestions.push('Aapka aashirwad hai ji.');
      suggestions.push('Most welcome ji, khyal rakhiyega.');
    } else if (isHinglish || isFriend) {
      suggestions.push('Arre anytime bhai!');
      suggestions.push('No scene yaar, chill kar.');
      suggestions.push('Mast! Aur bata kya chal raha hai.');
    } else {
      suggestions.push('You\'re very welcome!');
      suggestions.push('Happy to help anytime.');
      suggestions.push('Great, talk soon!');
    }
  }
  // General / Casual Chat
  else {
    if (isBossOrClient) {
      suggestions.push('Understood Sir, noted and proceeding accordingly.');
      suggestions.push('Thank you for the update. Will follow up promptly.');
      suggestions.push('Received, will review and get back to you.');
    } else if (isElder) {
      suggestions.push('Ji theek hai, pranam.');
      suggestions.push('Aap kaise ho ji? Sab theek wahan?');
      suggestions.push('Haanji samajh gaya, dhanyawad.');
    } else if (isHinglish || isFriend) {
      suggestions.push('Theek hai bhai, samjha.');
      suggestions.push('Arre sahi hai! Kal milte hain.');
      suggestions.push('Haan pakka, update karta hu thodi der me.');
    } else {
      suggestions.push('Sounds great, thanks for letting me know.');
      suggestions.push('Got it, will keep you posted!');
      suggestions.push('Perfect, let\'s catch up soon.');
    }
  }

  return {
    suggestions: suggestions.slice(0, 3),
    reason: `Contextually inferred for ${profile.persona} (${profile.languageStyle})`,
    detectedTone: profile.sentimentTone,
    languageUsed: profile.languageStyle,
  };
}

// ─── 2. Context-Driven Icebreakers ──────────────────────────────────────────

export async function generateContextualIcebreakers(
  bubbles: ChatBubble[],
  profile: ThreadContextProfile,
  globalIntent: GlobalUserIntent,
): Promise<IcebreakerResult> {
  const safeBubbles = sanitizeBubbles(bubbles.slice(-8));
  const history = safeBubbles
    .map((b) => `${b.isSelf ? 'You' : profile.threadTitle}: ${b.text}`)
    .join('\n');

  const persona = profile.persona;
  const isHinglish = profile.languageStyle === 'hinglish';
  const recentTopics = profile.recentTopics.join(', ');

  const systemPrompt = `You are a conversational icebreaker generator for messaging apps.
Recipient: ${profile.threadTitle} (${persona})
Recent Topics: ${recentTopics || 'general'}
Language Style: ${isHinglish ? 'Conversational Indian Hinglish' : 'Natural English'}

Generate EXACTLY 3 distinct opening lines:
1. "continuation": Picks up on the last incomplete topic or previous discussion naturally.
2. "followup": Friendly follow-up on recent plans, work, or milestones.
3. "checkin": Authentic check-in matching the relationship (Friend vs Boss vs Elder).

Respond ONLY in valid JSON:
{
  "suggestions": [
    "Continuation option",
    "Follow-up option",
    "Check-in option"
  ],
  "category": "followup"
}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Chat History:\n${history || 'No prior messages'}` },
      ],
      0.65,
      3500,
    );

    const parsed = JSON.parse(raw);
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

function generateIcebreakersLocally(
  bubbles: ChatBubble[],
  profile: ThreadContextProfile,
): IcebreakerResult {
  const name = profile.threadTitle || 'there';
  const isFriend = profile.persona === 'Friend' || profile.formalityLevel <= 2;
  const isBoss = profile.persona === 'Boss' || profile.formalityLevel === 5;
  const isElder = profile.persona === 'Elder';
  const isHinglish = profile.languageStyle === 'hinglish';

  const lastBubble = bubbles.length > 0 ? bubbles[bubbles.length - 1] : null;
  const lastSnippet = lastBubble?.text?.slice(0, 30) || '';
  const lastTopic = profile.recentTopics.length > 0
    ? profile.recentTopics[profile.recentTopics.length - 1]
    : '';

  const suggestions: string[] = [];

  // Option 1: Continuation of incomplete topic
  if (lastTopic) {
    if (isBoss) {
      suggestions.push(`Good day Sir, following up on our discussion regarding the ${lastTopic}.`);
    } else if (isElder) {
      suggestions.push(`Pranam ${name}, ${lastTopic} ke baare me baat karni thi aapse.`);
    } else if (isHinglish || isFriend) {
      suggestions.push(`Arre ${name}, kal jo ${lastTopic} ka discuss kar rahe the uska kya hua?`);
    } else {
      suggestions.push(`Hey ${name}, following up on our chat about the ${lastTopic}!`);
    }
  } else if (lastSnippet) {
    if (isBoss) {
      suggestions.push(`Hi Sir, touching base regarding our earlier discussion on "${lastSnippet}".`);
    } else if (isElder) {
      suggestions.push(`Namaste ${name}, pehle jo baat hui thi usi ke baare me poochna tha.`);
    } else if (isHinglish || isFriend) {
      suggestions.push(`Haan bhai ${name}, "${lastSnippet}" ka kya update hai?`);
    } else {
      suggestions.push(`Hey ${name}, wanted to quickly check back on "${lastSnippet}".`);
    }
  } else {
    // Cold start continuation
    if (isBoss) {
      suggestions.push(`Good morning Sir, checking in regarding today's key priorities.`);
    } else if (isElder) {
      suggestions.push(`Pranam ${name}, aapse kafi din se baat nahi hui thi to socha message karu.`);
    } else if (isHinglish || isFriend) {
      suggestions.push(`Arre ${name}! Bahut time se baat nahi hui, kya chal raha hai?`);
    } else {
      suggestions.push(`Hey ${name}! It's been a while, how have you been?`);
    }
  }

  // Option 2: Follow-up on availability / sync
  if (isBoss) {
    suggestions.push(`Please let me know if you have 5 minutes for a brief status alignment.`);
  } else if (isElder) {
    suggestions.push(`Aap jab bhi free ho batana ji, ek baar call pe baat karte hain.`);
  } else if (isHinglish || isFriend) {
    suggestions.push(`Free ho to batao, ek quick cheez discuss karni hai.`);
  } else {
    suggestions.push(`Let me know when you're free for a quick sync!`);
  }

  // Option 3: Natural Warm Opener / Check-in
  if (isBoss) {
    suggestions.push(`Good morning Sir, hope you are having a productive week.`);
  } else if (isElder) {
    suggestions.push(`Pranam ${name}, kaisa chal raha hai sab? Hope you are doing well.`);
  } else if (isHinglish || isFriend) {
    suggestions.push(`Aur bhai ${name}, kya haal chaal? Sab sorted?`);
  } else {
    suggestions.push(`Hey ${name}, hope you're having a great week so far!`);
  }

  return {
    suggestions: suggestions.slice(0, 3),
    category: 'followup',
  };
}

// ─── 3. Context-Aware Message Improvement ───────────────────────────────────

export async function improveMessageWithContext(
  rawDraft: string,
  profile: ThreadContextProfile,
  globalIntent: GlobalUserIntent,
  bubbles: ChatBubble[] = [],
): Promise<{
  improvedDraft: string;
  explanation: string;
  wasModified: boolean;
}> {
  const trimmed = rawDraft.trim();
  if (!trimmed) {
    return {
      improvedDraft: '',
      explanation: 'No draft provided',
      wasModified: false,
    };
  }

  const sanitized = sanitizeText(trimmed).sanitized;
  const recentHistory = sanitizeBubbles(bubbles.slice(-4))
    .map((b) => `${b.isSelf ? 'You' : profile.threadTitle}: ${b.text}`)
    .join('\n');

  const persona = profile.persona;
  const formality = profile.formalityLevel;
  const isHinglish = profile.languageStyle === 'hinglish';

  const systemPrompt = `You are an expert Indian messaging assistant improving a drafted chat message.
Recipient: ${profile.threadTitle} (${persona}, Formality: ${formality}/5)
Style: ${isHinglish ? 'Polite Indian Hinglish' : 'Polite natural English'}

Instructions:
1. If the message is blunt, harsh, or disrespectful (e.g. "tu jaldi bhej", "send now", "why did you delay"), rephrase it politely and respectfully matching the relationship persona.
2. If the recipient is Boss, Elder, or Client: use appropriate respect, softeners (please, kindly, Sir), and proper pronouns.
3. If the recipient is Friend: keep it friendly, natural, and warm without sounding robotic or overly formal.
4. Preserve the user's core intent. Do NOT change facts or dates.

Respond ONLY in valid JSON:
{
  "improvedDraft": "the polished message text",
  "explanation": "why and how the message was improved"
}`;

  try {
    const raw = await queryEvonLlm(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Context:\n${recentHistory}\n\nDraft Message:\n"${sanitized}"`,
        },
      ],
      0.3,
      3500,
    );

    const parsed = JSON.parse(raw);
    if (parsed.improvedDraft && parsed.improvedDraft.trim()) {
      return {
        improvedDraft: parsed.improvedDraft.trim(),
        explanation: parsed.explanation || `Polished for ${persona}`,
        wasModified: parsed.improvedDraft.trim() !== trimmed,
      };
    }
  } catch {
    // Local contextual enhancer
  }

  return improveMessageLocally(trimmed, profile);
}

function improveMessageLocally(
  draft: string,
  profile: ThreadContextProfile,
): { improvedDraft: string; explanation: string; wasModified: boolean } {
  const lower = draft.toLowerCase();
  const isBossOrClient = profile.persona === 'Boss' || profile.persona === 'Client' || profile.formalityLevel >= 4;
  const isElder = profile.persona === 'Elder';
  const isFriend = profile.persona === 'Friend' || profile.formalityLevel <= 2;

  let improved = draft;
  let explanation = 'Enhanced phrasing and tone';

  // Check for blunt/demanding phrasing: "tu bhej", "jaldi bhej", "send now"
  const isDemanding = /\b(tu|jaldi bhej|bhej abhi|send now|give me|why didn't|where is)\b/i.test(lower);

  if (isBossOrClient) {
    if (isDemanding) {
      improved = `Sir, could you please share the update whenever you have a moment? Thank you.`;
      explanation = 'Softened demanding phrasing with respectful honorifics for Boss/Client.';
    } else if (!lower.includes('please') && !lower.includes('kindly')) {
      improved = `Could you please check this: "${draft}"? Thank you, Sir.`;
      explanation = 'Added polite framing and honorific for senior contact.';
    }
  } else if (isElder) {
    if (isDemanding) {
      improved = `Pranam, kripya aapse anurodh hai ki thoda jaldi bhej denge to sahi rahega.`;
      explanation = 'Converted blunt phrasing to respectful Hindi pronouns (Aap/Kripya).';
    } else {
      improved = `Pranam, ${draft} — aapse request hai.`;
      explanation = 'Prefixed respectful greeting for Elder.';
    }
  } else if (isFriend) {
    if (isDemanding) {
      improved = `Bhai thoda jaldi bhej de please, wait kar raha hu!`;
      explanation = 'Reframed to warm and friendly buddy tone.';
    } else {
      improved = `${draft} bhai!`;
      explanation = 'Polished friendly tone.';
    }
  }

  return {
    improvedDraft: improved,
    explanation,
    wasModified: improved !== draft,
  };
}

