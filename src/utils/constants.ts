export const APP_NAME = 'IndicContext Assistant';
export const PACKAGE_NAME = 'com.indiccontext.assistant';

export const BUFFER_MAX_CAPACITY = 30;

export const SUPPORTED_PACKAGES = [
  'com.whatsapp',
  'com.whatsapp.w4b',
  'org.telegram.messenger',
  'org.telegram.messenger.web',
] as const;

export const TONE_OPTIONS = [
  { id: 'casual', label: 'Casual', description: 'Friendly and colloquial' },
  { id: 'polite', label: 'Polite', description: 'Warm and respectful' },
  { id: 'respectful', label: 'Respectful', description: 'Formal, suitable for seniors & elders' },
  { id: 'informative', label: 'Informative', description: 'Structured and fact-focused' },
] as const;

export const TEMPERATURE_LEVELS = [
  { level: 1, label: 'Minimal', description: 'Concise, closely matches raw input' },
  { level: 2, label: 'Light', description: 'Slight grammatical expansion' },
  { level: 3, label: 'Balanced', description: 'Natural moderate rewrite' },
  { level: 4, label: 'Expanded', description: 'Adds depth from buffer context' },
  { level: 5, label: 'Full Context', description: 'Heavily leverages full chat history' },
] as const;
