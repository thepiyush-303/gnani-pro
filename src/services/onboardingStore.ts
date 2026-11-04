/**
 * Remembers whether the first-run tutorial was completed (JSON file in the app's
 * documents directory — same storage approach the app already used for settings).
 */

import * as FileSystem from 'expo-file-system';

const FILE = `${FileSystem.documentDirectory}indic_onboarding.json`;

export async function isOnboarded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return false;
    return JSON.parse(await FileSystem.readAsStringAsync(FILE))?.onboarded === true;
  } catch {
    return false;
  }
}

export async function setOnboarded(value = true): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ onboarded: value, at: Date.now() }));
  } catch (e) {
    console.warn('[onboarding] could not save flag:', e);
  }
}
