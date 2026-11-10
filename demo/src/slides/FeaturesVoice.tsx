/** Feature slides 5–8: 🎙 Dictate (Prisma), 🗣 Voice notes (Prisma → Timbre), ⏰ Reminders, tutorial & Home. */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  mdiAccountVoice,
  mdiAlarm,
  mdiBellOutline,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiFaceMan,
  mdiFaceWoman,
  mdiGestureTap,
  mdiLayersOutline,
  mdiMicrophoneOutline,
  mdiSchoolOutline,
} from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { FeatureLayout } from '../components/FeatureLayout';
import { InfoCard } from '../components/Cards';
import { ChatBubble, OverlayCard } from '../components/Chat';
import { PulseDot, Typewriter, Waveform } from '../components/Effects';
import { Icon } from '../components/Icon';
import { Grid, Point } from './FeaturesText';
import { c, ov } from '../theme';

const fill: CSSProperties = { height: '100%' };
const body: CSSProperties = { fontSize: 21, lineHeight: 1.5 };

const LANGS = [
  'English',
  'हिन्दी',
  'मराठी',
  'বাংলা',
  'తెలుగు',
  'தமிழ்',
  'മലയാളം',
  'ગુજરાતી',
  'ಕನ್ನಡ',
  'ਪੰਜਾਬੀ',
];

function useCycle(count: number, ms = 900) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return i;
}

function MessageBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '16px 22px',
        borderRadius: 30,
        background: '#FFFFFF',
        border: '1.5px solid #9F123926',
        fontSize: 24,
        color: '#111B21',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background: '#00A884',
          flex: 'none',
        }}
      />
    </div>
  );
}

// ─── 🎙 Dictate ─────────────────────────────────────────────────────────────

export function DictateSlide({ step }: SlideProps) {
  const lang = useCycle(LANGS.length, 800);
  return (
    <FeatureLayout
      number={5}
      icon={mdiMicrophoneOutline}
      title="🎙 Dictate in your own language"
      tagline="Tap 🎙 and just speak. Gnani Prisma types it into the message box, in 10 Indian languages."
      clip="dictate"
      stages={[
        { label: 'MIC' },
        { label: 'PRISMA', caption: 'speech → text', gnani: true },
        { label: 'LANGUAGE', caption: 'hold & glide' },
        { label: 'MESSAGE BOX', caption: 'ready to send' },
      ]}
      activeStage={step}
    >
      <Grid step={step}>
        <InfoCard title="LISTENING" badge="your voice" style={fill}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 6,
            }}
          >
            <PulseDot />
            <span style={{ fontSize: 22, fontWeight: 600, color: c.primary }}>
              Recording · tap again to stop
            </span>
          </div>
          <div style={{ marginTop: 22 }}>
            <Waveform bars={40} />
          </div>
        </InfoCard>

        <InfoCard
          title="HEARD"
          variant="gnani"
          badge="Gnani Prisma v3"
          style={fill}
        >
          <Waveform bars={40} color={c.success} live={false} height={40} />
          <div
            style={{
              fontSize: 28,
              marginTop: 14,
              color: '#14532D',
              lineHeight: 1.4,
            }}
          >
            <Typewriter text="मैं आज शाम को पाँच बजे पहुँच जाऊँगा" speed={55} />
          </div>
          <div
            style={{
              fontSize: 16,
              color: c.success,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            hi-IN · Hindi
          </div>
        </InfoCard>

        <InfoCard
          title="10 INDIAN LANGUAGES"
          badge="hold 🎙, glide"
          style={fill}
        >
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}
          >
            {LANGS.map((l, i) => (
              <motion.span
                key={l}
                animate={{
                  backgroundColor: i === lang ? c.primary : c.surfaceAlt,
                  color: i === lang ? '#FFF1F2' : c.text,
                  scale: i === lang ? 1.08 : 1,
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                {l}
              </motion.span>
            ))}
          </div>
        </InfoCard>

        <InfoCard title="IN THE MESSAGE BOX" badge="no typing" style={fill}>
          <MessageBox>मैं आज शाम को पाँच बजे पहुँच जाऊँगा</MessageBox>
          <div style={{ ...body, color: c.textMuted, marginTop: 14 }}>
            The badge on 🎙 shows the current language (HI, EN, TA…).
          </div>
        </InfoCard>
      </Grid>
    </FeatureLayout>
  );
}

// ─── 🗣 Voice notes ─────────────────────────────────────────────────────────

const VOICES = [
  { id: 'Devansh', g: 'm' },
  { id: 'Yashraj', g: 'm' },
  { id: 'Avinash', g: 'm' },
  { id: 'Lakshmi', g: 'f' },
  { id: 'Shivani', g: 'f' },
  { id: 'Riyaa', g: 'f' },
];

export function VoiceSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={6}
      icon={mdiAccountVoice}
      title="🗣 Voice notes in another voice"
      tagline="Record yourself. ConvoAI re-speaks your exact words in a natural Indian voice and sends it to the chat."
      clip="voice"
      stages={[
        { label: 'RECORD' },
        { label: 'PRISMA', caption: 'what you said', gnani: true },
        { label: 'VOICE', caption: '6 voices' },
        { label: 'TIMBRE', caption: 're-spoken', gnani: true },
        { label: 'SEND', caption: 'to the open chat' },
      ]}
      activeStage={[1, 2, 3, 4][step]}
    >
      <Grid step={step}>
        <InfoCard
          title="HEARD"
          variant="gnani"
          badge="Gnani Prisma v3"
          style={fill}
        >
          <Waveform bars={40} color={c.primary} height={44} />
          <div style={{ fontSize: 28, marginTop: 16, color: '#14532D' }}>
            <Typewriter text="kal shaam milte hain, main 6 baje tak aa jaunga" />
          </div>
        </InfoCard>

        <InfoCard title="PICK A VOICE" badge="hold 🗣, glide" style={fill}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 10,
            }}
          >
            {VOICES.map((v) => {
              const on = v.id === 'Lakshmi';
              return (
                <motion.div
                  key={v.id}
                  animate={on ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: on ? c.primary : c.surfaceAlt,
                    color: on ? '#FFF1F2' : c.text,
                    fontSize: 19,
                    fontWeight: 600,
                  }}
                >
                  <Icon
                    path={v.g === 'm' ? mdiFaceMan : mdiFaceWoman}
                    size={22}
                    color={on ? '#FFF1F2' : c.primary}
                  />
                  {v.id}
                </motion.div>
              );
            })}
          </div>
          <div style={{ fontSize: 17, color: c.textMuted, marginTop: 12 }}>
            3 male · 3 female · ▶ samples in the app
          </div>
        </InfoCard>

        <InfoCard
          title="SAID"
          variant="gnani"
          badge="Gnani Timbre v3.0 · Lakshmi"
          style={fill}
        >
          <Waveform bars={40} color={c.success} height={44} />
          <div style={{ fontSize: 24, marginTop: 16, color: '#14532D' }}>
            Same words, natural Indian voice, as a WhatsApp voice note.
          </div>
        </InfoCard>

        <div
          style={{ ...fill, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <OverlayCard
            title="✅ Ready in Lakshmi’s voice"
            subtitle="“kal shaam milte hain…”"
            chips={['📤 Send to Ravi', '▶ Play']}
            highlight={0}
          />
          <div style={{ fontSize: 17, color: c.textMuted, lineHeight: 1.45 }}>
            Guarded auto-send: picks the open chat in WhatsApp’s share screen
            only when exactly one chat matches.
          </div>
        </div>
      </Grid>
    </FeatureLayout>
  );
}

// ─── ⏰ Deadline reminders ──────────────────────────────────────────────────

export function RemindersSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={7}
      icon={mdiAlarm}
      title="⏰ Never miss what you promised"
      tagline="“Update me by 6 PM.” ConvoAI spots deadlines you owe in the chats you open and reminds you before they’re due."
      clip="reminders"
      stages={[
        { label: 'MESSAGE' },
        { label: 'CUE CHECK', caption: 'on the phone' },
        { label: 'GEMINI', caption: 'only cued msgs' },
        { label: 'YOURS?', caption: 'you owe it' },
        { label: 'ALARM', caption: '30 min before' },
        { label: 'NOTIFY' },
      ]}
      activeStage={[0, 1, 3, 5][step]}
    >
      <Grid step={step}>
        <InfoCard title="NEW MESSAGE" badge="Mr. Sharma · 1:50 PM" style={fill}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 14,
              background: '#EFEAE2',
            }}
          >
            <ChatBubble from="them" time="13:40" style={{ fontSize: 16 }}>
              How is the client report going?
            </ChatBubble>
            <ChatBubble from="me" time="13:45" style={{ fontSize: 16 }}>
              Almost done sir
            </ChatBubble>
            <ChatBubble
              from="them"
              time="13:50"
              style={{ fontSize: 18, fontWeight: 600 }}
              delay={0.2}
            >
              Update me by 6:00 PM
            </ChatBubble>
          </div>
        </InfoCard>

        <InfoCard title="CUE CHECK" badge="on the phone · no AI" style={fill}>
          {[
            ['Update me by 6:00 PM', true],
            ['kal tak bhej dunga', true],
            ['ok', false],
            ['haha 😂', false],
          ].map(([t, ok]) => (
            <div
              key={t as string}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 8,
                fontSize: 21,
              }}
            >
              <Icon
                path={ok ? mdiCheckCircle : mdiCloseCircle}
                size={26}
                color={ok ? c.success : '#9F123966'}
              />
              <span style={{ color: ok ? c.text : '#9F123988' }}>
                {t as string}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 16, color: c.textMuted, marginTop: 12 }}>
            Only messages with a time or day go further, each one checked once.
          </div>
        </InfoCard>

        <InfoCard
          title="EXTRACTED"
          variant="glass"
          badge="Evon v3.3/Gemini 3.5 Flash Lite"
          style={fill}
        >
          <pre
            style={{
              fontFamily: 'Poppins, monospace',
              fontSize: 18,
              lineHeight: 1.6,
              color: ov.text,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {`{ kind: "task",
  owed_by: "user",
  task: "Send update to Mr. Sharma",
  due: "today 18:00",
  confidence: "high" }`}
          </pre>
          <div style={{ fontSize: 16, color: ov.muted, marginTop: 8 }}>
            Their promises, past deadlines and finished tasks are ignored.
          </div>
        </InfoCard>

        <div
          style={{ ...fill, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <OverlayCard
            title="⏰ Reminder set"
            subtitle={
              'Send update to Mr. Sharma\nReminds 5:30 PM today · due 6:00 PM'
            }
            chips={['↩ Undo']}
          />
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.6,
              type: 'spring',
              stiffness: 200,
              damping: 18,
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 16,
              background: '#FFFFFF',
              boxShadow: '0 20px 40px -24px #4C051980',
              border: '1px solid #9F123920',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                color: '#667781',
              }}
            >
              <span>ConvoAI · 5:30 PM</span>
              <span>Due 6:00 PM · Mr. Sharma</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#111B21' }}>
              ⏰ Send update to Mr. Sharma
            </div>
            <div
              style={{
                display: 'flex',
                gap: 22,
                marginTop: 4,
                fontSize: 15,
                fontWeight: 700,
                color: c.primary,
              }}
            >
              <span>✓ Done</span>
              <span>Snooze 15 min</span>
            </div>
          </motion.div>
        </div>
      </Grid>
    </FeatureLayout>
  );
}

// ─── Tutorial & Home ────────────────────────────────────────────────────────

export function TutorialSlide({ step }: SlideProps) {
  return (
    <FeatureLayout
      number={8}
      icon={mdiSchoolOutline}
      title="Easy to start, easy to trust"
      tagline="An interactive tour, plain-language permissions and a home screen that shows exactly what ConvoAI is doing."
      clip="tutorial"
      stages={[
        { label: 'WELCOME' },
        { label: 'TRY IT', caption: 'guided tour' },
        { label: 'VOICE', caption: '▶ samples' },
        { label: 'PERMISSIONS', caption: 'explained' },
        { label: 'HOME' },
      ]}
      activeStage={[1, 2, 3, 4][step]}
    >
      <Grid step={step}>
        <InfoCard title="FOLLOW THE GLOW" badge="10-step tour" style={fill}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              marginTop: 6,
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 96,
                height: 96,
                flex: 'none',
              }}
            >
              <motion.div
                animate={{
                  scale: [0.95, 1.18, 0.95],
                  opacity: [0.35, 0.8, 0.35],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  position: 'absolute',
                  inset: -10,
                  borderRadius: 26,
                  border: `6px solid ${ov.accent}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 22,
                  background: ov.bar,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon path={mdiGestureTap} size={44} color={ov.icon} />
              </div>
            </div>
            <div style={body}>
              A practice chat dims everything except the next button to press,
              then ends with 🎉.
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="CHOOSE YOUR VOICE"
          badge="Gnani Timbre samples"
          variant="gnani"
          style={fill}
        >
          <div style={body}>
            Tap ▶ to hear each of the 6 voices before you pick one. Change it
            any time from Home or by holding 🗣.
          </div>
          <div style={{ marginTop: 14 }}>
            <Waveform bars={34} color={c.success} height={36} />
          </div>
        </InfoCard>

        <InfoCard
          title="PERMISSIONS, EXPLAINED"
          badge="live status"
          style={fill}
        >
          {[
            [mdiLayersOutline, 'Display over other apps'],
            [mdiGestureTap, 'Accessibility (with the Android 13+ fix)'],
            [mdiMicrophoneOutline, 'Microphone'],
            [mdiBellOutline, 'Notifications (optional)'],
          ].map(([icon, t]) => (
            <Point key={t} icon={icon} color={c.success}>
              {t}
            </Point>
          ))}
        </InfoCard>

        <InfoCard
          title="HOME"
          badge="follows dark mode"
          variant="soft"
          style={fill}
        >
          {[
            'On / off, and what ConvoAI is doing',
            'Catch-up summary of the open chat',
            'Upcoming reminders: ✓ done or 🗑',
            'Speech language & default voice',
          ].map((t) => (
            <Point key={t} icon={mdiCheckCircle}>
              {t}
            </Point>
          ))}
        </InfoCard>
      </Grid>
    </FeatureLayout>
  );
}
