/**
 * IndicContext Assistant — Shared Type Definitions
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

export interface PersonaConfig {
  contactId: string;
  contactName?: string;
  persona: PersonaType;
  customNotes?: string;
}

export interface FactCheckClaim {
  claim: string;
  isAccurate: boolean;
  explanation: string;
  suggestedCorrection?: string;
}

export interface FactCheckResult {
  flagged: boolean;
  claims: FactCheckClaim[];
  summary?: string;
}

export interface CulturalSensitivityConcern {
  category: 'formality' | 'humor' | 'directness' | 'honorifics' | 'other';
  explanation: string;
  suggestion?: string;
}

export interface CulturalSensitivityResult {
  flagged: boolean;
  personaDetectedOrConfigured: PersonaType | string;
  concerns: CulturalSensitivityConcern[];
}

export interface PreSendResult {
  passed: boolean;
  factCheck?: FactCheckResult;
  culturalSensitivity?: CulturalSensitivityResult;
}

export interface IcebreakerResult {
  suggestions: string[];
}
