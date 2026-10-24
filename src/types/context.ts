/**
 * IndicContext Assistant — Shared Type Definitions
 * Complete Context Management System (Tiers 1, 2, 3)
 */

export interface ChatBubble {
  /** The visible text content of the message bubble */
  text: string;
  /** true = sent by current user, false = received from contact, null = unclassified */
  isSelf?: boolean | null;
  /** Unix timestamp in ms when the message was detected */
  capturedAtMs: number;
  /** Android View class name (e.g. android.widget.TextView) */
  nodeClassName?: string | null;
  /** Package name of the host app (e.g. com.whatsapp, org.telegram.messenger) */
  appPackage: string;
}

export interface SessionBufferState {
  bubbles: ChatBubble[];
  maxCapacity: number;
  activeAppPackage: string | null;
  currentThreadId: string | null;
  currentThreadTitle: string | null;
}

export type ToneOption = 'casual' | 'polite' | 'respectful' | 'informative';

export type TemperatureLevel = 1 | 2 | 3 | 4 | 5;

export type PersonaType =
  | 'Boss'
  | 'Client'
  | 'Elder'
  | 'Friend'
  | 'Colleague'
  | 'Auto';

export type HinglishIntensity = 'pure_english' | 'light_hinglish' | 'deep_indic';

/**
 * Tier 2: Per-Listener Context Profile
 * Stored locally and keyed by hashed threadId.
 */
export interface ListenerContext {
  threadId: string;
  threadTitle: string;
  persona: PersonaType;
  formalityLevel: 1 | 2 | 3 | 4 | 5;
  preferredLanguage?: string;
  honorificRequired: boolean;
  openAgreements: string[];
  customNotes?: string;
  lastSeenMs: number;
}

/**
 * Tier 3: Global User Persona & Communication Store
 */
export interface GlobalUserPersona {
  userName: string;
  defaultTone: ToneOption;
  hinglishIntensity: HinglishIntensity;
  useHonorificsByDefault: boolean;
  autoToneCheckEnabled: boolean;
  autoFactCheckEnabled: boolean;
  customVocabulary: string[];
}

/**
 * Listener-Aware Tone & Disrespect Detection
 */
export interface ToneSensitivityResult {
  isDisrespectful: boolean;
  severity: 'none' | 'low' | 'medium' | 'high';
  toneDetected: string;
  reasons: string[];
  suggestedDraft: string;
  originalDraft: string;
}

/**
 * Fact & Inconsistency Verification Result
 */
export interface FactConflictItem {
  statement: string;
  earlierStatement: string;
  explanation: string;
}

export interface FactCheckResult {
  hasConflict: boolean;
  flagged: boolean;
  inconsistencies: FactConflictItem[];
  claims: Array<{
    claim: string;
    isAccurate: boolean;
    explanation: string;
    suggestedCorrection?: string;
  }>;
  summary?: string;
  suggestedCorrection?: string;
}

/**
 * Thread Catch-Up Summary
 */
export interface ThreadSummaryResult {
  brief: string;
  keyPoints: string[];
  directAsks: string[];
  actionItems: string[];
  messageCount: number;
}

/**
 * Contextual Update Enhancement
 */
export interface EnhancedUpdateResult {
  enhancedDraft: string;
  toneUsed: ToneOption;
  contextReferences: string[];
}

/**
 * Context-Driven Icebreakers
 */
export interface IcebreakerResult {
  suggestions: string[];
  category?: 'reconnect' | 'conversation_starter' | 'followup';
}
