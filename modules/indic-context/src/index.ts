/**
 * indic-context — TypeScript API
 *
 * This is the public JavaScript/TypeScript surface of the local Expo module.
 * All calls here are bridged to Kotlin via expo-modules-core NativeModule.
 */

import { EventEmitter, NativeModulesProxy, requireNativeModule } from 'expo-modules-core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatBubble {
  /** The visible text content of the chat bubble */
  text: string;
  /** true = sent by the local user; false = received from the other party; null = indeterminate */
  isSelf: boolean | null;
  /** Unix timestamp (ms) at which this bubble was captured */
  capturedAtMs: number;
  /** Android node class name, e.g. "android.widget.TextView" */
  nodeClassName: string | null;
  /** Package name of the host app, e.g. "com.whatsapp" */
  appPackage: string;
}

export interface PermissionStatus {
  /** SYSTEM_ALERT_WINDOW — draw floating overlay */
  overlay: 'granted' | 'denied' | 'unknown';
  /** Accessibility service is enabled and connected */
  accessibility: 'granted' | 'denied' | 'unknown';
  /** RECORD_AUDIO runtime permission */
  microphone: 'granted' | 'denied' | 'unknown';
}

/**
 * Controls how the overlay is triggered:
 * - INPUT_BAR  — toolbar appears only when the user focuses a chat input field.
 * - EDGE_SLIDER — a faded pill stays on the right edge of supported apps; tap to expand.
 */
export type OverlayMode = 'INPUT_BAR' | 'EDGE_SLIDER';

export interface BufferUpdatedEvent {
  buffer: ChatBubble[];
  threadTitle?: string | null;
  threadId?: string | null;
}

export interface ActionTriggeredEvent {
  /** The action triggered by the user on the floating toolbar */
  action: 'improve' | 'factcheck' | 'icebreaker';
  /** The text currently in the input field when the action was tapped */
  draftText?: string;
}

export interface InputFieldEvent {
  /** Current text content of the focused input field */
  text: string;
  /** Package of the app whose input field is focused */
  appPackage: string;
}

export interface VoiceTranscriptEvent {
  /** Transcribed speech text from Gnani Prisma V2.5 */
  text: string;
  /** Whether recognition was successful */
  success: boolean;
  /** Language code used for recognition */
  language: string;
}

export interface RecordingStateEvent {
  /** Whether the microphone is actively capturing audio */
  isRecording: boolean;
}

export type IndicLanguageCode =
  | 'hi-IN'
  | 'en-IN'
  | 'bn-IN'
  | 'gu-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'mr-IN'
  | 'pa-IN'
  | 'ta-IN'
  | 'te-IN';

// ─── Native Module Binding ────────────────────────────────────────────────────

const MODULE_NAME = 'IndicContext';

// requireNativeModule throws at runtime if the native code isn't built in;
// this only works in an Expo Dev Client / bare workflow build — NOT Expo Go.
const NativeModule = requireNativeModule(MODULE_NAME);

const emitter = new EventEmitter(NativeModule ?? NativeModulesProxy[MODULE_NAME]);

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * Returns the current state of all three required permissions.
 * Safe to call repeatedly — does not prompt the user.
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  return NativeModule.checkPermissions();
}

/**
 * Triggers the system microphone permission dialog.
 * For overlay and accessibility, the user must navigate to system settings
 * (use Linking.sendIntent as shown in the dashboard screen).
 */
export async function requestMicrophonePermission(): Promise<void> {
  return NativeModule.requestMicrophonePermission();
}

// ─── Overlay Control ──────────────────────────────────────────────────────────

/**
 * Starts the OverlayService, which draws the floating copilot panel
 * above the stock keyboard using SYSTEM_ALERT_WINDOW.
 *
 * @param mode Overlay behaviour mode. Defaults to 'INPUT_BAR'.
 * Prerequisites: overlay permission must be granted.
 */
export async function startOverlay(mode: OverlayMode = 'INPUT_BAR'): Promise<void> {
  try {
    await NativeModule.startOverlay(mode);
  } catch (err: any) {
    // Android's startForegroundService returns ComponentName, which Expo Modules cannot serialize to JS.
    // The service has already started successfully at this point.
    if (err?.message?.includes('ComponentName')) {
      return;
    }
    throw err;
  }
}

/**
 * Stops the OverlayService and removes the floating panel.
 */
export async function stopOverlay(): Promise<void> {
  return NativeModule.stopOverlay();
}

/**
 * Changes overlay mode at runtime without restarting the service.
 * If the copilot is already active, the UI switches immediately.
 */
export async function setOverlayMode(mode: OverlayMode): Promise<void> {
  return NativeModule.setOverlayMode(mode);
}

// ─── Context Buffer ───────────────────────────────────────────────────────────

/**
 * Returns the current in-memory session buffer (up to 30 ChatBubble entries).
 * The buffer is populated by ChatAccessibilityService in real time.
 */
export async function getSessionBuffer(): Promise<ChatBubble[]> {
  return NativeModule.getSessionBuffer();
}

/**
 * Returns the currently active chat thread title (e.g. WhatsApp contact name)
 * and anonymized thread ID.
 */
export async function getActiveThread(): Promise<{
  threadTitle: string | null;
  threadId: string | null;
}> {
  return NativeModule.getActiveThread();
}

// ─── Text Injection ───────────────────────────────────────────────────────────

/**
 * Injects text into the currently focused input field of the host chat app.
 *
 * Primary strategy: ACTION_SET_TEXT via AccessibilityService node action.
 * Fallback strategy: clipboard paste via ACTION_PASTE.
 */
export async function injectText(text: string): Promise<void> {
  return NativeModule.injectText(text);
}

/**
 * Reads the current text content of the focused input field.
 * Used by features like Tone Rewrite to know what the user has drafted.
 */
export async function readInputFieldText(): Promise<string> {
  return NativeModule.readInputFieldText();
}

// ─── Voice-to-Text & Gnani STT (Phase 3) ──────────────────────────────────────

/**
 * Updates Gnani Prisma API key and default language code.
 * Changes are persisted across app restarts via Android SharedPreferences.
 */
export async function setGnaniConfig(
  apiKey?: string,
  language?: string,
): Promise<{ apiKeySet: boolean; language: string }> {
  return NativeModule.setGnaniConfig(apiKey ?? null, language ?? null);
}

/**
 * Returns whether an API key is configured and the current language code.
 */
export async function getGnaniConfig(): Promise<{ apiKeyConfigured: boolean; language: string }> {
  return NativeModule.getGnaniConfig();
}

/**
 * Updates the active speech recognition language (e.g. 'hi-IN', 'en-IN').
 */
export async function setLanguage(language: IndicLanguageCode | string): Promise<string> {
  return NativeModule.setLanguage(language);
}

/**
 * Returns the currently active speech recognition language.
 */
export async function getLanguage(): Promise<string> {
  return NativeModule.getLanguage();
}

/**
 * Starts audio recording for voice-to-text.
 * Can be called from the dashboard or overlay.
 */
export async function startVoiceRecording(): Promise<void> {
  return NativeModule.startVoiceRecording();
}

/**
 * Stops audio recording, uploads to Gnani Prisma v2.5, and returns the transcript.
 */
export async function stopVoiceRecording(): Promise<string> {
  return NativeModule.stopVoiceRecording();
}

/**
 * Checks if voice recording is currently in progress.
 */
export async function isVoiceRecording(): Promise<boolean> {
  return NativeModule.isVoiceRecording();
}

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Fires whenever the in-memory session buffer changes.
 * Subscribe to receive real-time chat context updates.
 *
 * @example
 * const sub = IndicContext.addBufferListener(({ buffer }) => {
 *   console.log('Buffer updated:', buffer.length, 'messages');
 * });
 * // Later:
 * sub.remove();
 */
export function addBufferListener(
  listener: (event: BufferUpdatedEvent) => void,
) {
  return emitter.addListener<BufferUpdatedEvent>('onBufferUpdated', listener);
}

/**
 * Fires when the accessibility service detects that an input field has
 * received focus in a supported chat app.
 */
export function addInputFocusListener(
  listener: (event: InputFieldEvent) => void,
) {
  return emitter.addListener<InputFieldEvent>('onInputFieldFocused', listener);
}

/**
 * Fires when the input field loses focus (keyboard dismissed, app switched, etc.).
 */
export function addInputBlurListener(
  listener: (event: InputFieldEvent) => void,
) {
  return emitter.addListener<InputFieldEvent>('onInputFieldBlurred', listener);
}

/**
 * Fires when a voice transcription completes from Gnani Prisma V2.5.
 */
export function addVoiceTranscriptListener(
  listener: (event: VoiceTranscriptEvent) => void,
) {
  return emitter.addListener<VoiceTranscriptEvent>('onVoiceTranscript', listener);
}

/**
 * Fires when recording starts or stops.
 */
export function addRecordingStateListener(
  listener: (event: RecordingStateEvent) => void,
) {
  return emitter.addListener<RecordingStateEvent>('onRecordingStateChanged', listener);
}

/**
 * Fires when the overlay copilot is disabled via Drag-to-Disable.
 */
export function addCopilotDisabledListener(
  listener: () => void,
) {
  return emitter.addListener('onCopilotDisabled', listener);
}

/**
 * Fires when an action button (Improve, Fact Check, Icebreaker) is tapped on the overlay toolbar.
 */
export function addActionTriggeredListener(
  listener: (event: ActionTriggeredEvent) => void,
) {
  return emitter.addListener<ActionTriggeredEvent>('onActionTriggered', listener);
}

// ─── Default export (convenience object) ─────────────────────────────────────

const IndicContext = {
  checkPermissions,
  requestMicrophonePermission,
  startOverlay,
  stopOverlay,
  setOverlayMode,
  getSessionBuffer,
  getActiveThread,
  injectText,
  readInputFieldText,
  setGnaniConfig,
  getGnaniConfig,
  setLanguage,
  getLanguage,
  startVoiceRecording,
  stopVoiceRecording,
  isVoiceRecording,
  addBufferListener,
  addInputFocusListener,
  addInputBlurListener,
  addVoiceTranscriptListener,
  addRecordingStateListener,
  addCopilotDisabledListener,
  addActionTriggeredListener,
};

export default IndicContext;
