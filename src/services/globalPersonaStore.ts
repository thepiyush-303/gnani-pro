/**
 * IndicContext Assistant — Tier 3: Global User Persona Store
 *
 * Persists the user's communication profile across all conversations.
 * Stores Hinglish intensity, default tone, honorific preferences, and custom vocabulary.
 */

import * as FileSystem from 'expo-file-system';
import { GlobalUserPersona } from '../types/context';

const GLOBAL_PERSONA_FILE = `${FileSystem.documentDirectory}indic_global_persona.json`;

const DEFAULT_GLOBAL_PERSONA: GlobalUserPersona = {
  userName: 'User',
  defaultTone: 'polite',
  hinglishIntensity: 'light_hinglish',
  useHonorificsByDefault: true,
  autoToneCheckEnabled: true,
  autoFactCheckEnabled: true,
  customVocabulary: ['arre', 'accha', 'theek hai', 'bhai', 'yaar', 'pakka'],
};

let inMemoryPersona: GlobalUserPersona = { ...DEFAULT_GLOBAL_PERSONA };
let isLoaded = false;

async function loadStore(): Promise<void> {
  if (isLoaded) return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(GLOBAL_PERSONA_FILE);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(GLOBAL_PERSONA_FILE);
      inMemoryPersona = { ...DEFAULT_GLOBAL_PERSONA, ...JSON.parse(content) };
    } else {
      inMemoryPersona = { ...DEFAULT_GLOBAL_PERSONA };
      await FileSystem.writeAsStringAsync(GLOBAL_PERSONA_FILE, JSON.stringify(inMemoryPersona, null, 2));
    }
  } catch (err) {
    console.warn('[GlobalPersonaStore] Failed to load persona store:', err);
    inMemoryPersona = { ...DEFAULT_GLOBAL_PERSONA };
  } finally {
    isLoaded = true;
  }
}

async function persistStore(): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(GLOBAL_PERSONA_FILE, JSON.stringify(inMemoryPersona, null, 2));
  } catch (err) {
    console.warn('[GlobalPersonaStore] Failed to persist persona store:', err);
  }
}

/**
 * Retrieves the current GlobalUserPersona configuration.
 */
export async function getGlobalPersona(): Promise<GlobalUserPersona> {
  await loadStore();
  return inMemoryPersona;
}

/**
 * Updates properties of the GlobalUserPersona configuration.
 */
export async function updateGlobalPersona(
  updates: Partial<GlobalUserPersona>,
): Promise<GlobalUserPersona> {
  await loadStore();
  inMemoryPersona = {
    ...inMemoryPersona,
    ...updates,
  };
  await persistStore();
  return inMemoryPersona;
}

/**
 * Adds a new slang or jargon word to the custom vocabulary.
 */
export async function addCustomVocabularyWord(word: string): Promise<void> {
  if (!word || !word.trim()) return;
  await loadStore();
  const trimmed = word.trim().toLowerCase();
  if (!inMemoryPersona.customVocabulary.includes(trimmed)) {
    inMemoryPersona.customVocabulary.push(trimmed);
    await persistStore();
  }
}

/**
 * Removes a word from the custom vocabulary list.
 */
export async function removeCustomVocabularyWord(word: string): Promise<void> {
  await loadStore();
  inMemoryPersona.customVocabulary = inMemoryPersona.customVocabulary.filter(
    (w) => w.toLowerCase() !== word.trim().toLowerCase(),
  );
  await persistStore();
}

