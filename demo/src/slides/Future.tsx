/**
 * Future scope. Step 0: a suspicious message. Step 1: scan → "⚠ Possible scam" flag + reasons.
 * Step 2: ConvoAI everywhere: channel chips connect to the mascot one by one.
 */

import { motion } from 'framer-motion';
import {
  mdiAlertOctagonOutline,
  mdiChatOutline,
  mdiGmail,
  mdiInstagram,
  mdiLinkedin,
  mdiMicrosoftTeams,
  mdiSendOutline,
  mdiShieldAlertOutline,
  mdiSlack,
  mdiWhatsapp,
} from '@mdi/js';
import type { SlideProps } from '../deck/types';
import { Reveal } from '../components/Cards';
import { ChatBubble } from '../components/Chat';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { c } from '../theme';

const REASONS = ['Urgency: “expires today”', 'Asks for your OTP', 'Unknown number', 'Shortened link'];

const CHANNELS = [
  { name: 'WhatsApp', icon: mdiWhatsapp, live: true },
  { name: 'Slack', icon: mdiSlack },
  { name: 'Discord', icon: mdiChatOutline },
  { name: 'Telegram', icon: mdiSendOutline },
  { name: 'Instagram DMs', icon: mdiInstagram },
  { name: 'Microsoft Teams', icon: mdiMicrosoftTeams },
  { name: 'Gmail', icon: mdiGmail },
  { name: 'LinkedIn', icon: mdiLinkedin },
];

const CX = 380;
const CY = 330;
const R = 270;

export function Future({ step }: SlideProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="eyebrow">What’s next</div>
      <div className="h2" style={{ marginTop: 6 }}>From a writing copilot to a safety net, everywhere you chat</div>

      <div style={{ flex: 1, display: 'flex', gap: 60, marginTop: 34 }}>
        {/* Fraud detection */}
        <div style={{ width: 760, flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 700, color: c.text }}>
            <Icon path={mdiShieldAlertOutline} size={36} color={c.danger} />
            Scam & fraud detection
          </div>
          <div style={{ fontSize: 20, color: c.textMuted, marginTop: 6 }}>Flag scammers inside the chat, before anyone shares an OTP or pays.</div>

          <div style={{ position: 'relative', marginTop: 24, padding: 22, borderRadius: 24, background: '#EFEAE2', overflow: 'hidden' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#54656F', marginBottom: 8 }}>+91 9xxxx xxx21 · not in contacts</div>
            <ChatBubble from="them" time="11:02" style={{ fontSize: 20, maxWidth: '100%' }}>
              Dear customer, your KYC expires TODAY. Share the OTP sent to your phone to avoid account block: bit.ly/kyc-upd8
            </ChatBubble>
            {step >= 1 && (
              <motion.div
                initial={{ top: -40 }}
                animate={{ top: '110%' }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 40,
                  background: 'linear-gradient(180deg, #E11D4800, #E11D4855, #E11D4800)',
                }}
              />
            )}
          </div>

          <Reveal show={step >= 1} delay={1.1} from="pop">
            <div
              style={{
                marginTop: 18,
                padding: '18px 22px',
                borderRadius: 20,
                background: '#1C0A12',
                border: '1.5px solid #F87171',
                color: '#FFF1F2',
                boxShadow: '0 0 0 6px #DC262622',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700, color: '#FCA5A5' }}>
                <Icon path={mdiAlertOctagonOutline} size={30} color="#F87171" />
                Possible scam: don’t share your OTP
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {REASONS.map((r, i) => (
                  <motion.span
                    key={r}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4 + i * 0.12 }}
                    style={{ padding: '6px 14px', borderRadius: 999, background: '#DC262633', fontSize: 17 }}
                  >
                    {r}
                  </motion.span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Every channel */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: c.text }}>Every communication channel</div>
          <div style={{ fontSize: 20, color: c.textMuted, marginTop: 6 }}>One assistant, one memory of your tone, wherever you talk.</div>
          {step >= 2 && (
            <div style={{ position: 'absolute', left: 60, top: 110, width: 760, height: 660 }}>
              <svg width={760} height={660} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                {CHANNELS.map((ch, i) => {
                  const a = (i / CHANNELS.length) * Math.PI * 2 - Math.PI / 2;
                  return (
                    <motion.line
                      key={ch.name}
                      x1={CX}
                      y1={CY}
                      x2={CX + Math.cos(a) * R}
                      y2={CY + Math.sin(a) * R}
                      stroke={ch.live ? c.success : c.primary}
                      strokeWidth={3}
                      strokeDasharray={ch.live ? undefined : '8 8'}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.7 }}
                      transition={{ delay: 0.3 + i * 0.22, duration: 0.5 }}
                    />
                  );
                })}
              </svg>
              <div style={{ position: 'absolute', left: CX - 70, top: CY - 70 }}>
                <Mascot size={140} />
              </div>
              {CHANNELS.map((ch, i) => {
                const a = (i / CHANNELS.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <motion.div
                    key={ch.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.5 + i * 0.22 }}
                    style={{
                      position: 'absolute',
                      left: CX + Math.cos(a) * R,
                      top: CY + Math.sin(a) * R,
                      x: '-50%',
                      y: '-50%',
                    }}
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 18px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                        background: ch.live ? c.successSoft : '#FFFFFF',
                        border: `1.5px solid ${ch.live ? '#15803D55' : '#9F123930'}`,
                        boxShadow: '0 16px 30px -18px #831843AA',
                        fontSize: 19,
                        fontWeight: 600,
                        color: ch.live ? c.success : c.text,
                      }}
                    >
                      <Icon path={ch.icon} size={24} color={ch.live ? c.success : c.primary} />
                      {ch.name}
                      {ch.live && <span style={{ fontSize: 13, fontWeight: 700 }}>· TODAY</span>}
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
