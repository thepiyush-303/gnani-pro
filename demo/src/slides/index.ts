import type { SlideDef } from '../deck/types';
import { Intro } from './Intro';
import { Problem } from './Problem';
import { HOW_STEPS, HowItWorks } from './HowItWorks';
import { BubbleSlide, ImproveSlide, RepliesSlide, TranslateSlide } from './FeaturesText';
import { DictateSlide, RemindersSlide, TutorialSlide, VoiceSlide } from './FeaturesVoice';
import { Unique } from './Unique';
import { Tech } from './Tech';
import { Quality } from './Quality';
import { Future } from './Future';
import { Closing } from './Closing';

/** The presentation, in order. `steps` = how many → presses a slide takes before moving on. */
export const slides: SlideDef[] = [
  { id: 'intro', title: 'ConvoAI', steps: 1, Component: Intro },
  { id: 'problem', title: 'The problem', steps: 3, Component: Problem },
  { id: 'how', title: 'How it works', steps: HOW_STEPS, Component: HowItWorks },
  { id: 'bubble', title: 'Smart bubble', steps: 4, Component: BubbleSlide },
  { id: 'improve', title: '✨ Improve', steps: 4, Component: ImproveSlide },
  { id: 'replies', title: '💬 Smart replies', steps: 4, Component: RepliesSlide },
  { id: 'translate', title: '🌐 Translate', steps: 4, Component: TranslateSlide },
  { id: 'dictate', title: '🎙 Dictate', steps: 4, Component: DictateSlide },
  { id: 'voice', title: '🗣 Voice notes', steps: 4, Component: VoiceSlide },
  { id: 'reminders', title: '⏰ Reminders', steps: 4, Component: RemindersSlide },
  { id: 'tutorial', title: 'Tutorial & Home', steps: 4, Component: TutorialSlide },
  { id: 'unique', title: 'What’s unique', steps: 2, Component: Unique },
  { id: 'tech', title: 'Technologies', steps: 2, Component: Tech },
  { id: 'quality', title: 'Quality', steps: 3, Component: Quality },
  { id: 'future', title: 'Future scope', steps: 3, Component: Future },
  { id: 'closing', title: 'Thank you', steps: 1, Component: Closing },
];
