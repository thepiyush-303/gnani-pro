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

const HINGLISH_MARKERS = new Set([
  'hai', 'bhai', 'yaar', 'kya', 'kaisa', 'kab', 'chal', 'theek', 'accha',
  'aaj', 'kal', 'batao', 'bolo', 'bhej', 'raha', 'hu', 'ho', 'de', 'le',
  'ha', 'haan', 'nahi', 'toh', 'aur', 'sab', 'sirf', 'kuch', 'bas', 'ek',
  'kar', 'karo', 'gaya', 'aaya', 'sahi', 'pakka', 'jaldi', 'thoda', 'milte',
]);

const FORMAL_WORDS = new Set([
  'sir', 'madam', 'kindly', 'please', 'regarding', 'request', 'status',
  'update', 'milestone', 'deliverable', 'review', 'forwarded', 'attached',
  'schedule', 'agenda', 'confirm', 'urgent', 'appreciate', 'sincerely',
]);

const CASUAL_WORDS = new Set([
  'bro', 'dude', 'bhai', 'yaar', 'lol', 'haha', 'scene', 'chal', 'lite',
  'sorted', 'chill', 'arrey', 'arre', 'waah', 'mast', 'tension',
]);

export function analyzeConversationStyle(bubbles: ChatBubble[]): {
  languageStyle: 'hinglish' | 'english' | 'hindi';
  hinglishRatio: number;
  formalityLevel: 1 | 2 | 3 | 4 | 5;
  sentimentTone: 'casual' | 'formal' | 'respectful' | 'friendly';
  recentTopics: string[];
  pendingQuestions: string[];
  lastIncomingMessage?: string;
  lastOutgoingMessage?: string;
} {
  if (bubbles.length === 0) {
    return {
      languageStyle: 'hinglish',
      hinglishRatio: 0.5,
      formalityLevel: 3,
      sentimentTone: 'friendly',
      recentTopics: [],
      pendingQuestions: [],
    };
  }

  let totalWords = 0;
  let hinglishCount = 0;
  let formalCount = 0;
  let casualCount = 0;
  const questions: string[] = [];
  const topics: string[] = [];
  let lastIncoming: string | undefined;
  let lastOutgoing: string | undefined;

  for (const b of bubbles) {
    const text = b.text.trim();
    if (!text) continue;

    if (b.isSelf === false) {
      lastIncoming = text;
      if (text.includes('?') || /\b(kab|kya|kaisa|when|how|why|update|free)\b/i.test(text)) {
        questions.push(text);
      }
    } else if (b.isSelf === true) {
      lastOutgoing = text;
    }

    const words = text.toLowerCase().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z]/g, '');
      if (!clean) continue;
      totalWords++;
      if (HINGLISH_MARKERS.has(clean)) hinglishCount++;
      if (FORMAL_WORDS.has(clean)) formalCount++;
      if (CASUAL_WORDS.has(clean)) casualCount++;
    }

    // Extract potential topic keywords (> 4 letters, capitalized or distinct)
    const topicMatches = text.match(/\b([A-Z][a-z]{3,}|meet|project|plan|call|report|design|budget|party|flight)\b/g);
    if (topicMatches) {
      for (const tm of topicMatches) {
        if (!topics.includes(tm.toLowerCase())) {
          topics.push(tm.toLowerCase());
        }
      }
    }
  }

  const hinglishRatio = totalWords > 0 ? hinglishCount / totalWords : 0.3;
  let languageStyle: 'hinglish' | 'english' | 'hindi' = 'english';
  if (hinglishRatio > 0.15) {
    languageStyle = 'hinglish';
  }

  // Calculate Formality Score
  let formalityLevel: 1 | 2 | 3 | 4 | 5 = 3;
  if (formalCount > casualCount && formalCount >= 2) {
    formalityLevel = formalCount >= 4 ? 5 : 4;
  } else if (casualCount > formalCount || hinglishRatio > 0.4) {
    formalityLevel = casualCount >= 3 ? 1 : 2;
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
    recentTopics: topics.slice(-5),
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
    languageStyle: inferred.formalityLevel >= 4 ? 'english' : 'hinglish',
    hinglishRatio: inferred.formalityLevel >= 4 ? 0.05 : 0.4,
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

  // If user explicitly configured persona (e.g. Boss), keep it; otherwise refine
  const updatedProfile: ThreadContextProfile = {
    ...existing,
    threadTitle: threadTitle || existing.threadTitle,
    languageStyle: analysis.languageStyle,
    hinglishRatio: analysis.hinglishRatio,
    // Blend existing formality with observed style
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

