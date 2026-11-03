# Product Requirements Document (PRD) v3.0

## Context Management & Intelligent Copilot Features
**Project:** IndicContext Assistant (`gnani-pro`)  
**Version:** 3.0  
**Date:** October 23, 2026  
**Status:** Approved — In Implementation  

---

## 1. Executive Summary & Goals

The **IndicContext Assistant** currently captures visible chat bubbles on Android via `AccessibilityService` into an ephemeral FIFO buffer (`SessionBuffer.kt`) and renders a floating overlay toolbar.

To elevate this copilot into an indispensable everyday communication assistant, we are implementing a comprehensive **Hierarchical Context Management System** powering 5 context-dependent AI features:
1. **Listener-Aware Disrespect & Tone Guard**: Evaluates outgoing drafts against the listener's identity and power dynamic (e.g. boss vs client vs elder vs friend) to detect and correct unintended disrespect, arrogance, or inappropriate informality.
2. **Contextual Thread Summarizer**: Aggregates unread or recently received messages, producing structured catch-up briefs with pending questions and action items.
3. **Contextual Update Enhancer**: Rewrites terse, vague status drafts (e.g., *"update is delayed, will finish soon"*) into polished, context-enriched messages referencing specific discussed deliverables.
4. **Context-Driven Icebreakers & Revivers**: Generates natural conversation starters tailored to the relationship, shared interests, and elapsed time since the last interaction.
5. **Contextual Fact & Inconsistency Checker**: Cross-checks claims, dates, commitments, and numbers in user drafts against earlier statements in the conversation history as well as general factual claims.
6. **Global User Persona & Intent Store**: Preserves the user’s personal communication profile, linguistic code-switching balance (English/Hindi/Hinglish), honorific customs, and vocabulary.

---

## 2. The 3-Tier Memory Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TIER 3: GLOBAL USER PERSONA                      │
│  • User identity, natural voice & preferred tone defaults              │
│  • Code-switching ratio (EN / HI / Hinglish) & honorifics               │
│  • PII blocklists, vocabulary overrides & banned expressions            │
│  • Stored: Local Encrypted Storage (expo-secure-store / MMKV)           │
│  • Scope: Cross-app, persistent across all conversations                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                    TIER 2: LISTENER / THREAD CONTEXT                   │
│  • Contact Hash / Identifier & Display Title                           │
│  • Persona Role (Boss, Client, Elder, Friend, Colleague)               │
│  • Power dynamic, formality rating (1-5) & cultural sensitivity rules   │
│  • Open commitments, promises, deadlines & unresolved inquiries         │
│  • Stored: Local SQLite / Encrypted Preferences (keyed by thread hash)  │
│  • Scope: Per-contact thread, persistent across sessions               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                    TIER 1: EPHEMERAL SESSION BUFFER                    │
│  • Last 30 visible chat messages (FIFO ring buffer)                     │
│  • Sender classification (`isSelf: true / false / null`)                │
│  • Timestamps, view nodes, raw bubble text                             │
│  • Live input bar draft buffer                                         │
│  • Stored: RAM-only (SessionBuffer.kt), zero disk footprint            │
│  • Scope: Active conversation window; reset on app switch              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Feature Specifications

### 3.1 Feature 1 — Listener-Aware Disrespect & Tone Guard ("Tone Guard")

#### Problem
Tone misjudgments are asymmetric: a blunt command like *"send the file now"* is acceptable among close peers but insubordinate to a manager, abrasive to a client, and culturally disrespectful to an elder.

#### Functional Requirements
1. **Listener Context Ingestion**:
   * Inspects `threadId` to load `ListenerContext`.
   * Formality Scale (1 to 5):
     * **1 (Intimate/Casual)**: Friends, peers. High tolerance for banter, slang, emojis.
     * **3 (Collaborative/Standard)**: Coworkers, vendors. Professional yet warm.
     * **5 (Strict/Hierarchical)**: Direct executives, VIP clients, traditional elders. Zero tolerance for unpadded demands; requires honorifics (`ji`, `sir`, `please`).
2. **Real-Time Pre-Send Evaluation**:
   * Triggered when user taps the "Improve" (✨) button or upon typing pause when pre-send guard is enabled.
   * Compares draft against listener sensitivity thresholds.
3. **Detection Categories**:
   * *Perceived Insubordination / Command without Politeness*: Demanding without modal verbs (`could you`, `please`).
   * *Passive-Aggressive Phrasing*: (e.g., *"as per my previous message"*, *"fine, whatever"*).
   * *Cultural Honorific Omission*: Addressing an Indian senior/elder by first name without expected respect tokens.
   * *Excessive Informality in High-Stakes Channels*: Slang or typos in client conversations.
4. **Resolution Flow**:
   * If flagged, displays an unobtrusive card on the overlay with:
     * Specific risk explanation (e.g. *"May sound overly direct to your manager"*).
     * 1-tap "Polite Version" replacement.

---

### 3.2 Feature 2 — Contextual Thread Summarizer ("Catch-Up")

#### Problem
Users returning to active group chats or long threads often miss vital action items or reply out-of-context because they lack time to read 20+ messages.

#### Functional Requirements
1. **Unread Window Isolation**:
   * Identifies all incoming messages (`isSelf == false`) received after the user’s last sent message (`isSelf == true`).
2. **Structured Summary Schema**:
   * **Direct Asks**: Explicit questions directed at the user.
   * **Decisions Made**: Timelines, agreements, or changes finalized by other parties.
   * **Action Items**: What needs to be done next and by whom.
3. **Multi-Turn Contextual Grounding**:
   * If the visible window only shows *"yes, let's go with that"*, the summarizer checks Tier 2 Thread Memory to recall what *"that"* refers to.

---

### 3.3 Feature 3 — Context-Aware Message Improvement ("Update Enhancer")

#### Problem
Generic text enhancement tools (like Grammarly) only correct syntax without knowing the project, task, or context being discussed.

#### Functional Requirements
1. **Entity & Context Extraction**:
   * Scans Tier 1 buffer for project names, bug IDs, meeting references, and milestones.
2. **Draft Enrichment (Temperature 1–5)**:
   * **Level 1 (Concise Polish)**: Corrects typos and grammar, keeps original word count.
   * **Level 3 (Balanced Nuance)**: Adds natural introductory or transitional context from earlier messages.
   * **Level 5 (Full Context Expansion)**: Synthesizes the raw draft with discussed facts:
     * *Draft*: *"feature delayed will do by tomorrow"*
     * *Enhanced*: *"Regarding the UPI Payment module, regression tests took longer than expected. We'll deploy the fix by tomorrow 2:00 PM."*
3. **One-Tap Injection**:
   * Injects the accepted text directly into the chat app's input field using `ACTION_SET_TEXT`.

---

### 3.4 Feature 4 — Contextual Fact-Checking & Inconsistency Guard

#### Problem
Users frequently misquote dates, times, amounts, or promises made earlier in the thread (e.g., agreeing to meet at 5:00 PM when earlier messages specified 4:00 PM).

#### Functional Requirements
1. **Dual-Track Verification Engine**:
   * **Track A — Internal Conversation Contradiction**:
     * Extracts date/time/numeric commitments from draft.
     * Validates against Tier 1 buffer & Tier 2 open commitments.
     * Flags contradictions (e.g., *"Wait! Earlier they said Monday, but your draft says Tuesday"*).
   * **Track B — Real-World Assertion Check**:
     * Verifies objective entities, statistics, and historical assertions using Gnani Evon LLM.
2. **Safety Intervention**:
   * Blocks inadvertent sending if a contradiction is detected.
   * Offers 1-tap correction with the earlier agreed-upon fact.

---

### 3.5 Feature 5 — Context-Driven Icebreakers & Revivers

#### Problem
Starting or restarting a conversation is intimidating. Generic icebreakers (*"How are you?"*) lead to dead ends.

#### Functional Requirements
1. **State-Based Suggestions**:
   * **State A: Fresh Start (Zero history)**: Provides openers based on the contact persona (Professional introduction vs friendly hello).
   * **State B: Revive Stalled Chat (Days/weeks since last message)**: Analyzes the last topic discussed:
     * *Example*: If last message 4 days ago was *"heading into my presentation"*, suggests: *"Hey, how did the presentation go on Thursday?"*
   * **State C: Awkward Silence / Reply Delay**: Offers smooth reconnect bridges without sounding impatient or passive-aggressive.

---

### 3.6 Feature 6 — Global User Persona & Intent Store

#### Data Model (`GlobalUserPersona`)
```typescript
export interface GlobalUserPersona {
  userId: string;
  defaultLanguage: 'en-IN' | 'hi-IN' | 'hinglish';
  communicationArchetype: 'concise' | 'warm' | 'executive' | 'casual';
  codeSwitchingPreference: {
    enabled: boolean;
    hinglishIntensity: 1 | 2 | 3 | 4 | 5; // 1 = light borrowing, 5 = full conversational Hinglish
  };
  honorificRules: {
    useJiForElders: boolean;
    useSirMadamWorkplace: boolean;
  };
  vocabulary: {
    customTerms: string[];       // Team names, company terms, nicknames
    bannedPhrases: string[];     // E.g. "per my last email", "regards"
  };
  privacySettings: {
    anonymizeEntitiesBeforeLlm: boolean;
    maskPhoneNumbers: boolean;
    maskFinancialValues: boolean;
  };
}
```

---

## 4. Privacy, Security & Data Governance

1. **Zero Raw Chat Cloud Storage**:
   * Chat bubbles captured by `AccessibilityService` are stored exclusively in RAM (`SessionBuffer.kt`). They are NEVER saved to external databases or cloud servers.
2. **On-Device PII Masking Pipeline**:
   * Before sending any buffer or draft text to Gnani Evon LLM, the client runs local regex masking:
     * Phone numbers: `\b(?:\+91|0)?[6-9]\d{9}\b` -> `[PHONE_MASKED]`
     * OTPs / 6-digit codes: `\b\d{4,6}\b` -> `[CODE_MASKED]`
     * UPI IDs / Card Numbers -> `[PAYMENT_MASKED]`
3. **Encrypted Local Thread Meta**:
   * Contact metadata (formality tag, persona role, open commitments) is stored in encrypted preferences keyed by the device salt.

---

## 5. Step-by-Step Implementation Roadmap

```
Milestone 1: Native Context Layer & Thread Extraction
  ├─ Step 1.1: Capture Chat Header / Contact Name in ChatAccessibilityService.kt
  ├─ Step 1.2: Thread ID hashing & contact identifier mapping
  └─ Step 1.3: Bridge thread metadata to React Native IndicContextModule

Milestone 2: Tier 2 & Tier 3 Local Context Stores
  ├─ Step 2.1: Implement ListenerContextStore (Local persistent storage for contact personas, formality, open agreements)
  ├─ Step 2.2: Implement GlobalUserPersonaStore (Persistent local user communication persona)
  └─ Step 2.3: Contact Tagging & Persona Configuration UI in Dashboard

Milestone 3: Gnani Evon LLM Context Services
  ├─ Step 3.1: Complete src/services/gnaniEvonLlm.ts with typed endpoints:
  │    • checkToneSensitivity()
  │    • summarizeThread()
  │    • enhanceUpdateWithContext()
  │    • checkFactsAndInconsistencies()
  │    • generateIcebreakers()
  └─ Step 3.2: PII Sanitization & token budget trimming in src/utils/sanitizer.ts

Milestone 4: Overlay UI & Modal Integration
  ├─ Step 4.1: Expand ✨ Improve button with Tone Selector + Context Toggle
  ├─ Step 4.2: Expand 🔍 Fact Check button with Inconsistency Alert Card
  ├─ Step 4.3: Expand 🧊 Icebreaker button with 3 context-aware pill openers
  └─ Step 4.4: Catch-Up / Thread Summary sheet invocation

Milestone 5: Verification & End-to-End Testing
  ├─ Step 5.1: Unit tests for prompt schemas and PII masking
  ├─ Step 5.2: Verification on WhatsApp live chat threads
  └─ Step 5.3: Performance benchmarking (latency < 1.5s, RAM < 40MB)
```

