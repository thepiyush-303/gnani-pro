/**
 * IndicContext Assistant — Privacy & PII Sanitizer
 *
 * Implements strict on-device data masking before any text is submitted
 * to external LLM APIs (Gnani Evon). Ensures sensitive user data (phone numbers,
 * OTPs, UPI IDs, credit cards) never leaves the local device in plaintext.
 */

import { ChatBubble } from '../types/context';

export interface SanitizationResult {
  sanitized: string;
  hasMaskedData: boolean;
  redactionCount: number;
}

// ─── Regex Patterns for Sensitive Data ───────────────────────────────────────

// Indian and international mobile numbers (e.g. +91 98765 43210, 9876543210, 09876543210)
const PHONE_REGEX = /(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;

// Standard 16-digit credit/debit card numbers with spaces, dashes, or raw
const CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

// Indian UPI Virtual Payment Addresses (e.g. name@okhdfcbank, user@paytm, user@ybl, etc.)
const UPI_REGEX = /\b[a-zA-Z0-9.\-_]{2,256}@(okhdfcbank|okaxis|oksbi|okicici|paytm|ybl|ibl|axl|upi|apl)\b/gi;

// OTP / One-Time Passwords / Pins: 4 to 8 digit codes adjacent to verification keywords
const OTP_CONTEXT_REGEX = /\b(?:otp|code|pin|verification\s*code|secret)\s*[:=is\-]?\s*(\d{4,8})\b/gi;

// Standalone 6-digit verification codes (common Indian bank/Aadhaar OTPs)
const STANDALONE_OTP_REGEX = /\b(?<!\+)\d{6}\b/g;

/**
 * Sanitizes a single string of text by replacing sensitive PII with placeholders.
 */
export function sanitizeText(rawText: string): SanitizationResult {
  if (!rawText || typeof rawText !== 'string') {
    return { sanitized: '', hasMaskedData: false, redactionCount: 0 };
  }

  let count = 0;
  let text = rawText;

  // 1. Mask contextual OTPs first
  text = text.replace(OTP_CONTEXT_REGEX, (match, code) => {
    count++;
    return match.replace(code, '[OTP_REDACTED]');
  });

  // 2. Mask Credit / Debit card patterns
  text = text.replace(CARD_REGEX, () => {
    count++;
    return '[CARD_REDACTED]';
  });

  // 3. Mask UPI IDs
  text = text.replace(UPI_REGEX, () => {
    count++;
    return '[UPI_REDACTED]';
  });

  // 4. Mask Phone numbers
  text = text.replace(PHONE_REGEX, () => {
    count++;
    return '[PHONE_REDACTED]';
  });

  // 5. Mask standalone 6-digit OTPs (if not already part of phone or card)
  text = text.replace(STANDALONE_OTP_REGEX, (match) => {
    // Only mask if not surrounded by card/phone placeholders
    if (match.length === 6) {
      count++;
      return '[OTP_REDACTED]';
    }
    return match;
  });

  return {
    sanitized: text,
    hasMaskedData: count > 0,
    redactionCount: count,
  };
}

/**
 * Sanitizes an array of ChatBubble objects, creating safe copies with masked text.
 */
export function sanitizeBubbles(bubbles: ChatBubble[]): ChatBubble[] {
  if (!Array.isArray(bubbles)) return [];
  return bubbles.map((bubble) => ({
    ...bubble,
    text: sanitizeText(bubble.text).sanitized,
  }));
}

