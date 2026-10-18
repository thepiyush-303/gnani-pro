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
  /** true = sent by the local user; false = received from the other party */
  isSelf: boolean;
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

export interface BufferUpdatedEvent {
  buffer: ChatBubble[];
}

export interface InputFieldEvent {
  /** Current text content of the focused input field */
  text: string;
  /** Package of the app whose input field is focused */
  appPackage: string;
}

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
 * Prerequisites: overlay permission must be granted.
 */
export async function startOverlay(): Promise<void> {
  try {
    await NativeModule.startOverlay();
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

// ─── Context Buffer ───────────────────────────────────────────────────────────

/**
 * Returns the current in-memory session buffer (up to 30 ChatBubble entries).
 * The buffer is populated by ChatAccessibilityService in real time.
 */
export async function getSessionBuffer(): Promise<ChatBubble[]> {
  return NativeModule.getSessionBuffer();
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

// ─── Default export (convenience object) ─────────────────────────────────────

const IndicContext = {
  checkPermissions,
  requestMicrophonePermission,
  startOverlay,
  stopOverlay,
  getSessionBuffer,
  injectText,
  readInputFieldText,
  addBufferListener,
  addInputFocusListener,
  addInputBlurListener,
};

export default IndicContext;
