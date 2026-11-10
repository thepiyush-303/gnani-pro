/** 1 · Intro: mascot with orbiting feature chips, name, underline, tagline. */

import { motion } from 'framer-motion';
import { mdiAccountVoice, mdiAlarm, mdiCreation, mdiForumOutline, mdiMicrophoneOutline, mdiTranslate, mdiWhatsapp } from '@mdi/js';
import { Mascot } from '../components/Mascot';
import { Icon } from '../components/Icon';
import { Underline } from '../components/Effects';
import { c } from '../theme';

const CHIPS = [
  { icon: mdiCreation, label: 'Improve' },
  { icon: mdiTranslate, label: 'Translate' },
  { icon: mdiForumOutline, label: 'Smart replies' },
  { icon: mdiMicrophoneOutline, label: 'Dictate' },
  { icon: mdiAccountVoice, label: 'Voice notes' },
  { icon: mdiAlarm, label: 'Reminders' },
];

const R = 300;

export function Intro() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 40 }}>
      {/* Orbit */}
      <div style={{ position: 'relative', width: 800, height: 800, flex: 'none' }}>
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            inset: 100,
            borderRadius: '50%',
            border: '2px dashed #C8143F40',
          }}
        />
        <div style={{ position: 'absolute', left: 400 - 130, top: 400 - 130 }}>
          <Mascot size={260} />
        </div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {CHIPS.map((ch, i) => {
            const a = (i / CHIPS.length) * Math.PI * 2 - Math.PI / 2;
            const x = 400 + Math.cos(a) * R;
            const y = 400 + Math.sin(a) * R;
            return (
              <motion.div
                key={ch.label}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.6 + i * 0.12 }}
                style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}
              >
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                  style={{ position: 'absolute', left: 0, top: 0, x: '-50%', y: '-50%' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 20px',
                      borderRadius: 999,
                      background: '#FFFFFF',
                      border: '1.5px solid #9F123926',
                      boxShadow: '0 16px 30px -18px #83184388',
                      whiteSpace: 'nowrap',
                      fontSize: 19,
                      fontWeight: 600,
                      color: c.text,
                    }}
                  >
                    <Icon path={ch.icon} size={24} color={c.primary} />
                    {ch.label}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Name + tagline */}
      <div style={{ flex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 999,
            background: '#DCFCE7',
            color: c.success,
            fontWeight: 600,
            fontSize: 18,
          }}
        >
          <Icon path={mdiWhatsapp} size={22} color={c.success} />
          Lives inside your WhatsApp chats
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 120, damping: 16 }}
          style={{ fontSize: 168, fontWeight: 800, letterSpacing: -6, lineHeight: 1, marginTop: 28, color: c.text }}
        >
          Convo<span style={{ color: c.primary }}>AI</span>
        </motion.div>
        <div style={{ marginTop: 6 }}>
          <Underline width={560} delay={0.9} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          style={{ fontSize: 40, fontWeight: 600, marginTop: 36, color: c.text, letterSpacing: -0.5 }}
        >
          Your AI assistant that lives inside WhatsApp.
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="lead"
          style={{ marginTop: 14, fontSize: 30 }}
        >
          Write better, in every language, in every chat.
        </motion.div>
      </div>
    </div>
  );
}
