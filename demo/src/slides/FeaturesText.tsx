/** Feature slides 1–4: smart bubble, ✨ Improve, 💬 Smart replies, 🌐 Translate. Each has 4 build steps. */

import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  mdiCheckCircle,
  mdiCreation,
  mdiDragVariant,
  mdiForumOutline,
  mdiGestureSwipeDown,
  mdiGestureTap,
  mdiTranslate,
  mdiWhatsapp,
} from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { FeatureLayout } from '../components/FeatureLayout';
import { InfoCard, Reveal } from '../components/Cards';
import { ChatBubble, GlideMenu, OverlayCard, OverlayToolbar } from '../components/Chat';
import { MorphText, Typewriter } from '../components/Effects';
import { Icon } from '../components/Icon';
import { c, ov } from '../theme';

/** 2 × 2 card grid; card i appears at step i. */
export function Grid({ step, children }: { step: number; children: ReactNode[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 22,
        height: '100%',
      }}
    >
      {children.map((ch, i) => (
        <div key={i} style={{ minHeight: 0 }}>
          <Reveal show={step >= i} from={i % 2 ? 'right' : 'left'} style={{ height: '100%' }}>
            {ch}
          </Reveal>
        </div>
      ))}
    </div>
  );
}

const fill: CSSProperties = { height: '100%' };
const body: CSSProperties = { fontSize: 21, lineHeight: 1.5 };

export function Point({ icon, children, color = c.primary }: { icon: string; children: ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 10, ...body }}>
      <span style={{ marginTop: 3, flex: 'none' }}>
        <Icon path={icon} size={24} color={color} />
      </span>
      <span>{children}</span>
    </div>
  );
}

// ─── Smart bubble ───────────────────────────────────────────────────────────

export function BubbleSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={1}
      icon={mdiWhatsapp}
      title="A bubble that knows where it is"
      tagline="ConvoAI floats right above WhatsApp’s message box, but only inside a chat, and only until you need it."
      clip="bubble"
      stages={[
        { label: 'OPEN CHAT' },
        { label: 'DETECT', caption: 'name + message box' },
        { label: 'BUBBLE', caption: 'above the box' },
        { label: 'TOOLBAR', caption: 'one tap' },
        { label: 'AUTO-CLOSE', caption: 'touch outside' },
      ]}
      activeStage={[1, 2, 3, 4][step]}
    >
      <Grid step={step}>
        <InfoCard title="ONLY IN CHATS" badge="Accessibility" style={fill}>
          <div style={body}>
            It appears when a chat room is open and hides on the chat list, Status, Calls, search and every other app.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {['Chat ✓', 'Chat list ✗', 'Status ✗', 'Other apps ✗'].map((t) => (
              <span
                key={t}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 17,
                  fontWeight: 600,
                  background: t.includes('✓') ? c.successSoft : c.surfaceAlt,
                  color: t.includes('✓') ? c.success : c.textMuted,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </InfoCard>
        <InfoCard title="REMEMBERS ITS SPOT" badge="Drag & drop" style={fill}>
          <Point icon={mdiDragVariant}>Drag it to either edge; it stays at that height next time.</Point>
          <Point icon={mdiCheckCircle}>Lifts above the keyboard only when the keyboard would cover it.</Point>
        </InfoCard>
        <InfoCard title="ONE TAP, ALL THE TOOLS" variant="glass" badge="Overlay" style={fill}>
          <div style={{ ...body, color: ov.muted, marginBottom: 18 }}>✨ Improve · 🌐 Translate · 🗣 Voice note · 💬 Replies · 🎙 Dictate</div>
          <OverlayToolbar active="improve" />
        </InfoCard>
        <InfoCard title="OUT OF YOUR WAY" badge="Gestures" style={fill}>
          <Point icon={mdiGestureTap}>Touch anywhere else and the toolbar folds back into the bubble.</Point>
          <Point icon={mdiGestureSwipeDown}>Drag the bubble to the bottom of the screen to turn ConvoAI off.</Point>
        </InfoCard>
      </Grid>
    </FeatureLayout>
  );
}

// ─── ✨ Improve ─────────────────────────────────────────────────────────────

const DRAFT = 'i can come tomorrow evening';

export function ImproveSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={2}
      icon={mdiCreation}
      title="✨ Improve: same draft, the right tone"
      tagline="Type it your way. ConvoAI rewrites it to fit the person and the conversation you’re in."
      clip="improve"
      stages={[
        { label: 'DRAFT' },
        { label: 'CONTEXT', caption: 'last 15 messages' },
        { label: 'GEMINI', caption: 'rewrite' },
        { label: 'CHECKS', caption: 'meaning kept' },
        { label: 'INSERT', caption: 'tap a suggestion' },
      ]}
      activeStage={[0, 1, 2, 4][step]}
    >
      <Grid step={step}>
        <InfoCard title="YOUR DRAFT" style={fill}>
          <div
            style={{
              marginTop: 8,
              padding: '18px 22px',
              borderRadius: 16,
              background: '#FFFFFF',
              border: '1.5px solid #9F123926',
              fontSize: 26,
              color: '#111B21',
            }}
          >
            <Typewriter text={DRAFT} />
          </div>
          <div style={{ ...body, color: c.textMuted, marginTop: 16 }}>Lowercase, no punctuation, no idea who it’s for. Tap ✨.</div>
        </InfoCard>

        <InfoCard title="WHO IT’S FOR" badge="inferred, no presets" style={fill}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ padding: 12, borderRadius: 14, background: '#EFEAE2' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.primary, marginBottom: 6 }}>Ravi</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ChatBubble from="them" style={{ fontSize: 15 }}>Kal ka plan pakka?</ChatBubble>
                <ChatBubble from="them" style={{ fontSize: 15 }} delay={0.1}>Ankit bhi aa raha hai 😄</ChatBubble>
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 14, background: '#EFEAE2' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.primary, marginBottom: 6 }}>Mr. Sharma</div>
              <ChatBubble from="them" style={{ fontSize: 15 }} delay={0.2}>
                Are you free for a quick review call tomorrow?
              </ChatBubble>
            </div>
          </div>
        </InfoCard>

        <InfoCard title="REWRITE" variant="glass" badge="Gemini 3.5 Flash Lite" style={fill}>
          <div style={{ fontSize: 15, fontWeight: 700, color: ov.accent, letterSpacing: 1 }}>FOR RAVI · casual Hinglish</div>
          <div style={{ fontSize: 23, margin: '6px 0 14px', color: ov.text }}>
            <Typewriter text="Kal shaam aa jaunga, pakka! 🙌" delay={300} caret={false} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: ov.accent, letterSpacing: 1 }}>FOR MR. SHARMA · polite English</div>
          <div style={{ fontSize: 23, marginTop: 6, color: ov.text }}>
            <Typewriter text="I can join tomorrow evening. Would that work for you?" delay={1500} caret={false} />
          </div>
        </InfoCard>

        <InfoCard title="CHECKED, THEN YOURS" badge="before you see it" style={fill}>
          {[
            'Keeps your meaning and your day (“tomorrow”)',
            'Never invents times, names or plans',
            'Same language and script as the chat',
            'No slang where the chat is formal',
          ].map((t) => (
            <Point key={t} icon={mdiCheckCircle} color={c.success}>
              {t}
            </Point>
          ))}
        </InfoCard>
      </Grid>
    </FeatureLayout>
  );
}

// ─── 💬 Smart replies ───────────────────────────────────────────────────────

function DayDivider({ label }: { label: string }) {
  return (
    <div style={{ alignSelf: 'center', padding: '3px 12px', borderRadius: 8, background: '#FFFFFFE0', fontSize: 13, color: '#54656F', fontWeight: 600 }}>
      {label}
    </div>
  );
}

export function RepliesSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={3}
      icon={mdiForumOutline}
      title="💬 Smart replies that remember time"
      tagline="Three replies in the chat’s own language and tone, and ConvoAI knows what was due yesterday."
      clip="replies"
      stages={[
        { label: 'READ CHAT' },
        { label: 'DATES', caption: 'yesterday → today' },
        { label: 'GEMINI', caption: 'what’s pending?' },
        { label: '3 REPLIES', caption: 'tap to insert' },
      ]}
      activeStage={step}
    >
      <Grid step={step}>
        <InfoCard title="THE CHAT" badge="with Ravi" style={fill}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 12, borderRadius: 14, background: '#EFEAE2' }}>
            <DayDivider label="Yesterday" />
            <ChatBubble from="me" time="18:05" style={{ fontSize: 15 }}>bhai project ki details bhej de</ChatBubble>
            <ChatBubble from="them" time="18:20" style={{ fontSize: 15 }} delay={0.1}>
              abhi bahar hu, kal subah tak bhej dunga pakka
            </ChatBubble>
            <DayDivider label="Today · 10:30, nothing yet" />
          </div>
        </InfoCard>

        <InfoCard title="WHAT THE AI SEES" badge="role-tagged + dated" variant="soft" style={fill}>
          <pre
            style={{
              fontFamily: 'Poppins, monospace',
              fontSize: 15.5,
              lineHeight: 1.55,
              color: c.text,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {`now: "2026-11-03 10:30 (Tue)"
{ sender: "contact",
  text: "kal subah tak bhej dunga pakka",
  sent: "2026-11-02 18:20 (Mon, yesterday)" }
since_last_message: "16 hours"`}
          </pre>
        </InfoCard>

        <InfoCard title="THE INSIGHT" variant="glass" badge="Gemini 3.5 Flash Lite" style={fill}>
          <div style={{ fontSize: 23, lineHeight: 1.5, color: ov.text }}>
            Ravi promised the details <b style={{ color: ov.accent }}>“by this morning”</b>. It’s 10:30 and nothing came.
          </div>
          <div style={{ fontSize: 23, lineHeight: 1.5, color: ov.text, marginTop: 10 }}>→ suggest a friendly nudge, in Hinglish.</div>
        </InfoCard>

        <OverlayCard
          title="⏰ Follow up with Ravi"
          chips={['Bhai details ka kya hua? Subah tak bhejne wala tha 😅', 'Ravi, details bhej de jab free ho', 'Koi na, aaj shaam tak bhi chalega 👍']}
          highlight={0}
        />
      </Grid>
    </FeatureLayout>
  );
}

// ─── 🌐 Translate ───────────────────────────────────────────────────────────

const EN = 'bro I am so tired today, lets just play tomorrow ok?';
const HI = 'भाई आज बहुत थक गया हूँ, कल खेलते हैं ना?';

export function TranslateSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={4}
      icon={mdiTranslate}
      title="🌐 Translate, without losing the vibe"
      tagline="Hold 🌐, glide to English or हिन्दी, tap. Your draft is replaced in the right script, with the same tone."
      clip="translate"
      stages={[
        { label: 'DRAFT' },
        { label: 'HOLD & GLIDE', caption: 'pick a language' },
        { label: 'GEMINI', caption: 'same tone' },
        { label: 'REPLACE', caption: 'in the box' },
      ]}
      activeStage={step}
    >
      <Grid step={step}>
        <InfoCard title="YOUR DRAFT" style={fill}>
          <div style={{ marginTop: 8, padding: '18px 22px', borderRadius: 16, background: '#FFFFFF', border: '1.5px solid #9F123926', fontSize: 24, color: '#111B21' }}>
            {EN}
          </div>
          <div style={{ ...body, color: c.textMuted, marginTop: 14 }}>Casual English to a friend.</div>
        </InfoCard>

        <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
          <GlideMenu title="TRANSLATE TO" items={['English', 'हिन्दी']} selected={step >= 1 ? 1 : 0} />
          <div style={{ ...body, color: c.textMuted, maxWidth: 230 }}>Hold the button, slide your finger, let go. The choice is remembered.</div>
        </div>

        <InfoCard title="TRANSLATION" variant="glass" badge="Gemini 3.5 Flash Lite" style={fill}>
          <MorphText texts={[EN, HI]} index={step >= 2 ? 1 : 0} style={{ fontSize: 28, lineHeight: 1.5, color: ov.text, minHeight: 90 }} />
          <div style={{ fontSize: 17, color: ov.muted, marginTop: 14 }}>
            Roman Hinglish converts too: “kal milte hai” → “कल मिलते हैं”. Casual stays casual (no sudden आप).
          </div>
        </InfoCard>

        <InfoCard title="REPLACED" badge="no copy-paste" style={fill}>
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            style={{ marginTop: 8, padding: '16px 20px', borderRadius: 28, background: '#FFFFFF', border: '1.5px solid #9F123926', fontSize: 23, color: '#111B21' }}
          >
            {HI}
          </motion.div>
          <div style={{ marginTop: 12, display: 'inline-block', padding: '8px 16px', borderRadius: 12, background: ov.bar, color: ov.text, fontSize: 17 }}>
            🌐 Translated to Hindi
          </div>
          <div style={{ ...body, fontSize: 18, color: c.textMuted, marginTop: 12 }}>Empty or one-word draft? No AI call, just a hint.</div>
        </InfoCard>
      </Grid>
    </FeatureLayout>
  );
}
