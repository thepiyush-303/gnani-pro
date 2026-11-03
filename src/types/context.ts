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
  /** Day the message was sent (yyyy-MM-dd), from WhatsApp date dividers; null if unknown */
  sentDate?: string | null;
  /** Time the message was sent (HH:mm, 24h), from the bubble's time label; null if unknown */
  sentTime?: string | null;
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

export type HinglishIntensity = 'pure_english' | 'light_hinglish' | 'deep_indic';

/**
 * Global user preferences (the USER's own style — not a contact category)
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
 * Smart Replies — 3 suggested next messages written as the user.
 * tone / relationship / language are inferred by the LLM from the conversation.
 */
export interface SmartRepliesResult {
  replies: string[];
  /**
   * One short line about something due / overdue / pending as of now
   * (e.g. "Rahul said yesterday he'd send the details today, not received yet").
   * Empty when nothing is pending.
   */
  followUp: string;
  tone: string;
  relationship: string;
  language: string;
}

/**
 * Improve Text — contextual rewrite of the user's draft.
 */
export interface ImproveTextResult {
  improved: string;
  alternatives: string[];
  tone: string;
  relationship: string;
  note: string;
  /** false when the LLM judged the draft already natural for this conversation. */
  wasModified: boolean;
}

export type { ChatMessage, ChatPayload, Sender } from '../services/llm/chatPayload';
