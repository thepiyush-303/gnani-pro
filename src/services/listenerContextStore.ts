/**
 * IndicContext Assistant — Tier 2: Per-Listener Context Store
 *
 * Persists relationship and formality metadata keyed by the anonymized threadId.
 * Automatically infers listener hierarchy (Boss vs Client vs Elder vs Friend)
 * upon first interaction if not explicitly set by the user.
 */

import * as FileSystem from 'expo-file-system';
import { ListenerContext, PersonaType } from '../types/context';

const LISTENERS_FILE = `${FileSystem.documentDirectory}indic_listener_contexts.json`;

// In-memory cache for synchronous instant lookups
let inMemoryStore: Record<string, ListenerContext> = {};
let isLoaded = false;

// ─── Persona Inference Heuristics ──────────────────────────────────────────

const ELDER_KEYWORDS = [
  'papa', 'dad', 'mummy', 'mom', 'maa', 'uncle', 'aunty', 'chachi', 'chacha',
  'mama', 'mami', 'dada', 'dadi', 'nana', 'nani', 'bua', 'fufa',
];

const BOSS_KEYWORDS = [
  'sir', 'madam', 'boss', 'manager', 'lead', 'director', 'vp', 'ceo', 'cto',
  'head', 'hr', 'supervisor', 'founder',
];

const CLIENT_KEYWORDS = [
  'client', 'customer', 'vendor', 'partner', 'consultant', 'account',
];

const FRIEND_KEYWORDS = [
  'bro', 'bhai', 'yaar', 'dude', 'sis', 'dost', 'buddy', 'bestie', 'gang', 'homie',
];

export function inferPersonaFromTitle(title: string): {
  persona: PersonaType;
  formalityLevel: 1 | 2 | 3 | 4 | 5;
  honorificRequired: boolean;
} {
  const lower = title.toLowerCase().trim();

  // Check Elder keywords
  if (ELDER_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { persona: 'Elder', formalityLevel: 5, honorificRequired: true };
  }

  // Check Boss keywords
  if (BOSS_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { persona: 'Boss', formalityLevel: 5, honorificRequired: true };
  }

  // Check Client keywords
  if (CLIENT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { persona: 'Client', formalityLevel: 4, honorificRequired: true };
  }

  // Check Friend keywords
  if (FRIEND_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { persona: 'Friend', formalityLevel: 1, honorificRequired: false };
  }

  // Default neutral / colleague
  return { persona: 'Colleague', formalityLevel: 3, honorificRequired: false };
}

// ─── Persistent Storage Helpers ─────────────────────────────────────────────

async function loadStore(): Promise<void> {
  if (isLoaded) return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(LISTENERS_FILE);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(LISTENERS_FILE);
      inMemoryStore = JSON.parse(content);
    } else {
      inMemoryStore = {};
    }
  } catch (err) {
    console.warn('[ListenerContextStore] Failed to load store:', err);
    inMemoryStore = {};
  } finally {
    isLoaded = true;
  }
}

async function persistStore(): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(LISTENERS_FILE, JSON.stringify(inMemoryStore, null, 2));
  } catch (err) {
    console.warn('[ListenerContextStore] Failed to persist store:', err);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Retrieves the ListenerContext for the specified threadId.
 * If no entry exists, infers the persona from the threadTitle and persists it.
 */
export async function getListenerContext(
  threadId: string,
  threadTitle?: string,
): Promise<ListenerContext> {
  await loadStore();

  if (inMemoryStore[threadId]) {
    // Update threadTitle or lastSeen if provided
    if (threadTitle && threadTitle !== inMemoryStore[threadId].threadTitle) {
      inMemoryStore[threadId].threadTitle = threadTitle;
    }
    inMemoryStore[threadId].lastSeenMs = Date.now();
    return inMemoryStore[threadId];
  }

  // Auto-infer persona and default formality
  const inferred = inferPersonaFromTitle(threadTitle || '');
  const newContext: ListenerContext = {
    threadId,
    threadTitle: threadTitle || 'Unknown Contact',
    persona: inferred.persona,
    formalityLevel: inferred.formalityLevel,
    honorificRequired: inferred.honorificRequired,
    openAgreements: [],
    lastSeenMs: Date.now(),
  };

  inMemoryStore[threadId] = newContext;
  persistStore().catch(() => {});
  return newContext;
}

/**
 * Updates and saves an entire ListenerContext record.
 */
export async function saveListenerContext(context: ListenerContext): Promise<void> {
  await loadStore();
  inMemoryStore[context.threadId] = {
    ...context,
    lastSeenMs: Date.now(),
  };
  await persistStore();
}

/**
 * Updates only the persona and formality for a given thread.
 */
export async function updateListenerPersona(
  threadId: string,
  persona: PersonaType,
  formalityLevel?: 1 | 2 | 3 | 4 | 5,
): Promise<ListenerContext> {
  await loadStore();
  const existing = inMemoryStore[threadId] || {
    threadId,
    threadTitle: 'Contact',
    persona: 'Colleague',
    formalityLevel: 3,
    honorificRequired: false,
    openAgreements: [],
    lastSeenMs: Date.now(),
  };

  existing.persona = persona;
  if (formalityLevel !== undefined) {
    existing.formalityLevel = formalityLevel;
  } else {
    // Set standard defaults for known personas
    if (persona === 'Elder' || persona === 'Boss') existing.formalityLevel = 5;
    else if (persona === 'Client') existing.formalityLevel = 4;
    else if (persona === 'Colleague') existing.formalityLevel = 3;
    else if (persona === 'Friend') existing.formalityLevel = 1;
  }
  existing.honorificRequired = existing.formalityLevel >= 4;

  inMemoryStore[threadId] = existing;
  await persistStore();
  return existing;
}

/**
 * Adds an open agreement or commitment to the listener record.
 */
export async function addOpenAgreement(threadId: string, agreement: string): Promise<void> {
  if (!agreement || !agreement.trim()) return;
  await loadStore();
  const existing = await getListenerContext(threadId);
  if (!existing.openAgreements.includes(agreement.trim())) {
    existing.openAgreements.push(agreement.trim());
    await saveListenerContext(existing);
  }
}

/**
 * Returns all saved listener context records.
 */
export async function getAllListeners(): Promise<ListenerContext[]> {
  await loadStore();
  return Object.values(inMemoryStore);
}

