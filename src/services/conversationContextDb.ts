/**
 * IndicContext Assistant — Concrete Context Management Database
 *
 * Persists granular conversation context, communication styles, formality scores,
 * and conversational history per thread on disk via FileSystem.
 */

import * as FileSystem from 'expo-file-system';
import { ChatBubble, PersonaType, ThreadContextProfile } from '../types/context';
import { inferPersonaFromTitle } from './listenerContextStore';

const CONVERSATION_DB_FILE = `${FileSystem.documentDirectory}indic_conversation_contexts.json`;
const GLOBAL_INTENT_FILE = `${FileSystem.documentDirectory}indic_global_intent.json`;

// In-memory cache
let threadDbCache: Record<string, ThreadContextProfile> = {};
let isDbLoaded = false;

// ─── Global User Intent & Communication Preferences ─────────────────────────

export interface GlobalUserIntent {
  userName: string;
  defaultTone: 'casual' | 'polite' | 'respectful' | 'informative';
  preferences: {
    friends: {
      tone: 'casual';
      language: 'hinglish';
      formality: 1;
      rules: string;
    };
    coworkers: {
      tone: 'informative';
      language: 'hinglish';
      formality: 3;
      rules: string;
    };
    boss: {
      tone: 'respectful';
      language: 'english';
      formality: 5;
      rules: string;
    };
    clients: {
      tone: 'polite';
      language: 'english';
      formality: 4;
      rules: string;
    };
    elders: {
      tone: 'respectful';
      language: 'hindi';
      formality: 5;
      rules: string;
    };
  };
  customKeywords: string[];
}

const DEFAULT_GLOBAL_INTENT: GlobalUserIntent = {
  userName: 'User',
  defaultTone: 'polite',
  preferences: {
    friends: {
      tone: 'casual',
      language: 'hinglish',
      formality: 1,
      rules: 'Use casual Indian Hinglish, friendly slang (yaar, bhai, scene), and direct, short sentences.',
    },
    coworkers: {
      tone: 'informative',
      language: 'hinglish',
      formality: 3,
      rules: 'Professional yet approachable, clear action items, balanced English/Hinglish.',
    },
    boss: {
      tone: 'respectful',
      language: 'english',
      formality: 5,
      rules: 'Strictly formal, respectful honorifics (Sir/Ma\'am), structured and concise updates.',
    },
    clients: {
      tone: 'polite',
      language: 'english',
      formality: 4,
      rules: 'Courteous, solution-oriented, clear milestones, polite inquiries.',
    },
    elders: {
      tone: 'respectful',
      language: 'hindi',
      formality: 5,
      rules: 'High respect, respectful Hindi pronouns (Aap, Pranam/Namaste, Kripya), warm check-ins.',
    },
  },
  customKeywords: ['arre', 'bhai', 'yaar', 'theek', 'accha', 'pakka'],
};

let globalIntentCache: GlobalUserIntent = { ...DEFAULT_GLOBAL_INTENT };
let isIntentLoaded = false;

// ─── Database File IO ───────────────────────────────────────────────────────

async function ensureDbLoaded(): Promise<void> {
  if (isDbLoaded) return;
  try {
    const info = await FileSystem.getInfoAsync(CONVERSATION_DB_FILE);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(CONVERSATION_DB_FILE);
      threadDbCache = JSON.parse(raw);
    } else {
      threadDbCache = {};
    }
  } catch (err) {
    console.warn('[ConversationDb] Failed to read database, initializing fresh:', err);
    threadDbCache = {};
  } finally {
    isDbLoaded = true;
  }
}

async function persistDb(): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      CONVERSATION_DB_FILE,
      JSON.stringify(threadDbCache, null, 2),
    );
  } catch (err) {
    console.error('[ConversationDb] Failed to save conversation context database:', err);
  }
}

export async function getGlobalUserIntent(): Promise<GlobalUserIntent> {
  if (isIntentLoaded) return globalIntentCache;
  try {
    const info = await FileSystem.getInfoAsync(GLOBAL_INTENT_FILE);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(GLOBAL_INTENT_FILE);
      globalIntentCache = { ...DEFAULT_GLOBAL_INTENT, ...JSON.parse(raw) };
    } else {
      globalIntentCache = { ...DEFAULT_GLOBAL_INTENT };
      await FileSystem.writeAsStringAsync(
        GLOBAL_INTENT_FILE,
        JSON.stringify(globalIntentCache, null, 2),
      );
    }
  } catch {
    globalIntentCache = { ...DEFAULT_GLOBAL_INTENT };
  } finally {
    isIntentLoaded = true;
  }
  return globalIntentCache;
}

export async function updateGlobalUserIntent(
  updates: Partial<GlobalUserIntent>,
): Promise<GlobalUserIntent> {
  await getGlobalUserIntent();
  globalIntentCache = { ...globalIntentCache, ...updates };
  try {
    await FileSystem.writeAsStringAsync(
      GLOBAL_INTENT_FILE,
      JSON.stringify(globalIntentCache, null, 2),
    );
  } catch (err) {
    console.error('[ConversationDb] Failed to persist global user intent:', err);
  }
  return globalIntentCache;
}

// ─── Context Analysis & Style Fingerprinting ────────────────────────────────

export const COMPREHENSIVE_HINGLISH_WORDS = new Set([
  // Pronouns & Demonstratives
  'kya', 'hai', 'hain', 'ho', 'hu', 'tha', 'the', 'thi', 'hum', 'tum', 'tu', 'aap',
  'tera', 'teri', 'tere', 'mera', 'meri', 'mere', 'apna', 'apni', 'apne', 'iska',
  'uska', 'inhe', 'unhe', 'kisko', 'mujhe', 'tujhe', 'hume', 'aapko', 'sab', 'kuch', 'koi',
  // Interrogatives
  'kaisa', 'kaisi', 'kaise', 'kab', 'kaha', 'kidhar', 'kitna', 'kitne', 'kitni', 'kyun', 'kyu',
  // Relational & Slang
  'bhai', 'yaar', 'dost', 'bro', 'sir', 'ji', 'boss', 'dude', 'banda', 'bandi', 'scene',
  'sorted', 'lite', 'tension', 'mast', 'arrey', 'arre', 'arey', 'oye', 'abe', 'acha', 'accha',
  'sahi', 'theek', 'thik', 'pakka', 'waah',
  // Verbs & Actions
  'kar', 'karo', 'karna', 'karenge', 'karega', 'karegi', 'karu', 'kiya',
  'dekh', 'dekho', 'dekhna', 'dekhta', 'sun', 'suno', 'sunna',
  'bol', 'bolo', 'bolna', 'bata', 'batao', 'batana', 'bataiye',
  'bhej', 'bhejo', 'bhejna', 'bhejta', 'bhejoge', 'bheji',
  'gaya', 'gayi', 'gaye', 'jaa', 'jao', 'jaana', 'jayenge', 'jaunga',
  'aaya', 'aayi', 'aaye', 'aa', 'aao', 'aana', 'aayenge', 'aaunga',
  'mil', 'milte', 'milna', 'milenge', 'milta',
  'le', 'lo', 'lena', 'lenge', 'de', 'do', 'dena', 'denge',
  'rakh', 'rakho', 'rakhna', 'chal', 'chalo', 'chalte', 'chalega', 'chalegi',
  'ruk', 'ruko', 'rukna', 'baith', 'uth', 'utha', 'khao', 'peeyo',
  // Adverbs, Prepositions, Time
  'aaj', 'kal', 'parso', 'abhi', 'baad', 'pehle', 'subah', 'shaam', 'raat', 'dopahar',
  'thoda', 'thodi', 'zyada', 'sirf', 'bas', 'ek', 'do', 'teen',
  'nahi', 'nhi', 'na', 'ha', 'haan', 'hanji', 'hnji',
  'toh', 'to', 'par', 'lekin', 'aur', 'waise', 'fir', 'phir', 'bhi', 'saath', 'bina',
  'andar', 'bahar', 'upar', 'neeche', 'aage', 'peeche', 'wahan', 'yahan',
  'jaldi', 'dheere', 'fasa', 'fasaa', 'busy'
]);

const FORMAL_WORDS = new Set([
  'sir', 'madam', 'kindly', 'please', 'regarding', 'request', 'status',
  'update', 'milestone', 'deliverable', 'review', 'forwarded', 'attached',
  'schedule', 'agenda', 'confirm', 'urgent', 'appreciate', 'sincerely',
  'kripya', 'anurodh', 'dhanyawad', 'pranam', 'namaste', 'namaskar', 'aapko', 'aapse',
]);

const CASUAL_WORDS = new Set([
  'bro', 'dude', 'bhai', 'yaar', 'lol', 'haha', 'scene', 'chal', 'lite',
  'sorted', 'chill', 'arrey', 'arre', 'waah', 'mast', 'tension', 'tu', 'teri', 'tera',
]);

export const SLANG_WORDS = new Set([
  'bc', 'mc', 'bhnchoo', 'behenchod', 'madarchod', 'lode', 'laude', 'chutiya', 'chutiye',
  'baap', 'deadshot', 'khelenge', 'chid', 'chidna', 'bhadak', 'react', 'reaction',
  'kalesh', 'lafda', 'natak', 'overacting', 'scene', 'lite', 'aaja', 'squad', 'dkh',
  'rhta', 'horha', 'merko', 'merse', 'muje', 'mne', 'pauch', 'ni'
]);

export function getCleanFirstName(title: string): string {
  if (!title) return 'bhai';
  const cleaned = title.replace(/[^\w\s]/gi, '').trim();
  const parts = cleaned.split(/\s+/);
  return parts[0] || 'bhai';
}

const SEMANTIC_TOPIC_WHITELIST = new Set([
  'deadshot', 'game', 'gaming', 'pubg', 'bgmi', 'cod', 'match',
  'exp3', 'pdf', 'assignment', 'submission', 'lab', 'homework', 'exam', 'test', 'marks',
  'train', 'flight', 'metro', 'trip', 'travel', 'station', 'tickets',
  'cafe', 'coffee', 'dinner', 'lunch', 'party', 'food', 'outing',
  'tannu', 'group', 'reaction', 'emoji', 'qr', 'photo', 'video',
  'project', 'code', 'design', 'report', 'presentation', 'deck',
  'meeting', 'sync', 'call', 'budget', 'invoice', 'payment'
]);

export function analyzeConversationStyle(bubbles: ChatBubble[]): {
  languageStyle: 'hinglish' | 'english' | 'hindi';
  hinglishRatio: number;
  formalityLevel: 1 | 2 | 3 | 4 | 5;
  sentimentTone: 'casual' | 'formal' | 'respectful' | 'friendly';
  inferredPersona: PersonaType;
  recentTopics: string[];
  pendingQuestions: string[];
  lastIncomingMessage?: string;
  lastOutgoingMessage?: string;
} {
  if (bubbles.length === 0) {
    return {
      languageStyle: 'hinglish',
      hinglishRatio: 0.5,
      formalityLevel: 2,
      sentimentTone: 'friendly',
      inferredPersona: 'Friend',
      recentTopics: [],
      pendingQuestions: [],
    };
  }

  let totalWords = 0;
  let hinglishCount = 0;
  let formalCount = 0;
  let casualCount = 0;
  let slangCount = 0;
  let hasDevanagari = false;
  let hasLaughingEmoji = false;
  const questions: string[] = [];
  const topics: string[] = [];
  let lastIncoming: string | undefined;
  let lastOutgoing: string | undefined;

  for (const b of bubbles) {
    const text = b.text.trim();
    if (!text) continue;

    if (/[\u0900-\u097F]/.test(text)) {
      hasDevanagari = true;
    }
    if (/[😂🤣💀🔥❤️]/.test(text)) {
      hasLaughingEmoji = true;
    }

    if (b.isSelf === false) {
      lastIncoming = text;
      if (text.includes('?') || /\b(kab|kya|kaisa|when|how|why|update|free|milna)\b/i.test(text)) {
        questions.push(text);
      }
    } else if (b.isSelf === true) {
      lastOutgoing = text;
    }

    const words = text.toLowerCase().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      if (!clean) continue;
      totalWords++;
      if (COMPREHENSIVE_HINGLISH_WORDS.has(clean)) hinglishCount++;
      if (FORMAL_WORDS.has(clean)) formalCount++;
      if (CASUAL_WORDS.has(clean)) casualCount++;
      if (SLANG_WORDS.has(clean)) slangCount++;

      // Strict semantic topic matching (no common verbs or function words)
      if (SEMANTIC_TOPIC_WHITELIST.has(clean)) {
        if (!topics.includes(clean)) {
          topics.push(clean);
        }
      }
    }
  }

  // Language Detection
  let languageStyle: 'hinglish' | 'english' | 'hindi' = 'english';
  const hinglishRatio = totalWords > 0 ? hinglishCount / totalWords : 0.4;

  if (hasDevanagari) {
    languageStyle = 'hindi';
  } else if (hinglishCount >= 1 || slangCount >= 1 || hinglishRatio > 0.05) {
    languageStyle = 'hinglish';
  }

  // Calculate Formality & Relationship Persona
  let formalityLevel: 1 | 2 | 3 | 4 | 5 = 2;
  let inferredPersona: PersonaType = 'Friend';

  if (slangCount > 0 || hasLaughingEmoji || casualCount >= 3) {
    formalityLevel = 1;
    inferredPersona = 'Friend';
  } else if (formalCount > casualCount && formalCount >= 2) {
    formalityLevel = formalCount >= 4 ? 5 : 4;
    inferredPersona = formalCount >= 4 ? 'Boss' : 'Client';
  } else {
    formalityLevel = 2;
    inferredPersona = 'Friend';
  }

  let sentimentTone: 'casual' | 'formal' | 'respectful' | 'friendly' = 'friendly';
  if (formalityLevel >= 4) {
    sentimentTone = formalityLevel === 5 ? 'respectful' : 'formal';
  } else if (formalityLevel <= 2) {
    sentimentTone = 'casual';
  }

  return {
    languageStyle,
    hinglishRatio: Math.round(hinglishRatio * 100) / 100,
    formalityLevel,
    sentimentTone,
    inferredPersona,
    recentTopics: topics.slice(-6),
    pendingQuestions: questions.slice(-3),
    lastIncomingMessage: lastIncoming,
    lastOutgoingMessage: lastOutgoing,
  };
}

// ─── Public Context Store Operations ────────────────────────────────────────

/**
 * Gets or initializes a concrete thread context profile from the persistent DB.
 */
export async function getThreadContext(
  threadId: string,
  threadTitle?: string,
): Promise<ThreadContextProfile> {
  await ensureDbLoaded();

  if (threadDbCache[threadId]) {
    if (threadTitle && threadTitle !== threadDbCache[threadId].threadTitle) {
      threadDbCache[threadId].threadTitle = threadTitle;
      persistDb().catch(() => {});
    }
    return threadDbCache[threadId];
  }

  // Initial inference from thread title
  const inferred = inferPersonaFromTitle(threadTitle || '');
  const newProfile: ThreadContextProfile = {
    threadId,
    threadTitle: threadTitle || 'Contact',
    persona: inferred.persona,
    formalityLevel: inferred.formalityLevel,
    languageStyle: 'hinglish',
    hinglishRatio: 0.5,
    sentimentTone: inferred.formalityLevel >= 4 ? 'respectful' : 'casual',
    recentTopics: [],
    pendingQuestions: [],
    messageCount: 0,
    lastUpdatedMs: Date.now(),
  };

  threadDbCache[threadId] = newProfile;
  persistDb().catch(() => {});
  return newProfile;
}

/**
 * Automatically updates and persists the conversation style and context
 * whenever new chat bubbles are observed.
 */
export async function updateContextFromBubbles(
  threadId: string,
  threadTitle: string,
  bubbles: ChatBubble[],
): Promise<ThreadContextProfile> {
  await ensureDbLoaded();

  const existing = await getThreadContext(threadId, threadTitle);
  const analysis = analyzeConversationStyle(bubbles);

  // Dynamically adapt persona if observed messages show close friend/slang or boss/formal
  let activePersona = existing.persona;
  if (analysis.inferredPersona === 'Friend' && analysis.formalityLevel <= 2) {
    activePersona = 'Friend';
  } else if (analysis.inferredPersona === 'Boss' || analysis.inferredPersona === 'Client') {
    activePersona = analysis.inferredPersona;
  }

  const updatedProfile: ThreadContextProfile = {
    ...existing,
    persona: activePersona,
    threadTitle: threadTitle || existing.threadTitle,
    languageStyle: analysis.languageStyle,
    hinglishRatio: analysis.hinglishRatio,
    formalityLevel: analysis.formalityLevel,
    sentimentTone: analysis.sentimentTone,
    recentTopics: Array.from(new Set([...existing.recentTopics, ...analysis.recentTopics])).slice(-8),
    pendingQuestions: analysis.pendingQuestions,
    lastIncomingMessage: analysis.lastIncomingMessage || existing.lastIncomingMessage,
    lastOutgoingMessage: analysis.lastOutgoingMessage || existing.lastOutgoingMessage,
    messageCount: bubbles.length,
    lastUpdatedMs: Date.now(),
  };

  threadDbCache[threadId] = updatedProfile;
  await persistDb();
  return updatedProfile;
}

/**
 * Manually updates the persona or formality of a contact in the DB.
 */
export async function setThreadPersona(
  threadId: string,
  persona: PersonaType,
  formalityLevel?: 1 | 2 | 3 | 4 | 5,
): Promise<ThreadContextProfile> {
  await ensureDbLoaded();
  const profile = await getThreadContext(threadId);
  profile.persona = persona;
  if (formalityLevel) {
    profile.formalityLevel = formalityLevel;
  } else {
    profile.formalityLevel =
      persona === 'Boss' || persona === 'Elder' ? 5 :
      persona === 'Client' ? 4 :
      persona === 'Colleague' ? 3 : 1;
  }
  profile.sentimentTone = profile.formalityLevel >= 4 ? 'respectful' : 'casual';
  profile.lastUpdatedMs = Date.now();

  threadDbCache[threadId] = profile;
  await persistDb();
  return profile;
}

/**
 * Returns all saved context profiles from the persistent DB.
 */
export async function getAllThreadContexts(): Promise<ThreadContextProfile[]> {
  await ensureDbLoaded();
  return Object.values(threadDbCache);
}

