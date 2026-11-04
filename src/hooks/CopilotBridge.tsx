/**
 * CopilotBridge — the single place where native overlay events are handled.
 *
 * Mounted once in app/_layout.tsx, so toolbar actions work no matter which
 * screen (Home or the tutorial) is showing.
 *
 * LLM calls happen ONLY when the user taps a toolbar button:
 *   ✨ improve       → improveText()
 *   💬 smart_replies → generateSmartReplies()
 * Incoming messages / reopening a chat never trigger a call (they only update
 * the buffer that those buttons read).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IndicContext, { type ActionTriggeredEvent } from 'indic-context';
import type { ChatBubble, SmartRepliesResult } from '../types/context';
import { generateSmartReplies, improveText } from '../services/aiFeatures';
import { describeLlmError, getGnaniSttKey, isLlmError } from '../services/llm/llmClient';
import { getCleanFirstName } from '../utils/contactName';

/** "casual banter · close friends · Hinglish": what the LLM inferred about the chat. */
export function describeInsight(r: { tone: string; relationship: string; language?: string }): string {
  return [r.tone, r.relationship, r.language].filter((x) => x && x !== 'unknown').join(' · ');
}

/** Card header: a pending follow-up (due/overdue promise) takes priority over tone info. */
function smartRepliesCard(res: SmartRepliesResult, firstName: string) {
  return res.followUp
    ? { title: `⏰ Follow up with ${firstName}`, subtitle: res.followUp }
    : { title: `💬 Smart Replies for ${firstName}`, subtitle: describeInsight(res) };
}

interface CopilotState {
  /** Title of the WhatsApp chat last seen by the accessibility service. */
  activeChat: string | null;
  bufferCount: number;
  copilotEnabled: boolean;
  setCopilotEnabled: (on: boolean) => Promise<void>;
}

const Ctx = createContext<CopilotState>({
  activeChat: null,
  bufferCount: 0,
  copilotEnabled: false,
  setCopilotEnabled: async () => {},
});

export const useCopilot = () => useContext(Ctx);

export function CopilotBridgeProvider({ children }: { children: React.ReactNode }) {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [bufferCount, setBufferCount] = useState(0);
  const [copilotEnabled, setEnabledState] = useState(false);

  // STT key + initial running state
  useEffect(() => {
    IndicContext.getLanguage()
      .then((lang) => IndicContext.setGnaniConfig(getGnaniSttKey(), lang))
      .catch(() => {});
    IndicContext.isCopilotActive().then(setEnabledState).catch(() => {});
  }, []);

  const setCopilotEnabled = useCallback(async (on: boolean) => {
    if (on) await IndicContext.startOverlay();
    else await IndicContext.stopOverlay();
    setEnabledState(on);
  }, []);

  useEffect(() => {
    // Buffer updates only refresh what Home shows: no LLM calls here.
    const bufferSub = IndicContext.addBufferListener(({ buffer, threadTitle }) => {
      setBufferCount(buffer.length);
      if (threadTitle) setActiveChat(threadTitle);
    });

    // Dragging the bubble onto the bottom drop zone turns the copilot off natively.
    const disabledSub = IndicContext.addCopilotDisabledListener(() => setEnabledState(false));

    // Toolbar actions (also fired by the error card's ↻ Retry chip)
    const actionSub = IndicContext.addActionTriggeredListener(async (event: ActionTriggeredEvent) => {
      const { action } = event;
      if (action !== 'improve' && action !== 'smart_replies') return;
      try {
        const buffer = (await IndicContext.getSessionBuffer()) as ChatBubble[];
        const threadTitle = (await IndicContext.getActiveThread())?.threadTitle ?? null;
        const firstName = getCleanFirstName(threadTitle);

        if (action === 'improve') {
          // draftText is read by the overlay at tap time; fall back to polling the input field
          const draft = event.draftText?.trim() || ((await IndicContext.readInputFieldText()) || '').trim();
          if (!draft) {
            await IndicContext.showAiError('✨ Improve Text', 'Type a message in the chat first, then tap ✨.', null);
            return;
          }
          const res = await improveText(draft, buffer, threadTitle);
          await IndicContext.showSmartReplies(
            res.wasModified ? `✨ Improved for ${firstName}` : '✨ Already sounds natural',
            res.note || describeInsight(res),
            [res.improved, ...res.alternatives],
          );
          return;
        }

        const res = await generateSmartReplies(buffer, threadTitle);
        if (res.replies.length === 0) {
          await IndicContext.showAiError(
            '💬 Smart Replies',
            'No messages captured from this chat yet. Scroll the chat slightly and try again.',
            null,
          );
          return;
        }
        const card = smartRepliesCard(res, firstName);
        await IndicContext.showSmartReplies(card.title, card.subtitle, res.replies);
      } catch (err: unknown) {
        console.warn(`[CopilotBridge] action "${action}" failed:`, isLlmError(err) ? `${err.kind} ${err.message}` : err);
        await IndicContext.showAiError('⚠️ AI unavailable', describeLlmError(err), action).catch(() => {});
      }
    });

    return () => {
      bufferSub.remove();
      disabledSub.remove();
      actionSub.remove();
    };
  }, []);

  const value = useMemo(
    () => ({ activeChat, bufferCount, copilotEnabled, setCopilotEnabled }),
    [activeChat, bufferCount, copilotEnabled, setCopilotEnabled],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
