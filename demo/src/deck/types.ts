import type { ComponentType } from 'react';

export interface SlideProps {
  /** 0-based build step within the slide. */
  step: number;
}

export interface SlideDef {
  id: string;
  /** Short name shown in the HUD. */
  title: string;
  /** Number of build steps (≥ 1). → advances a step; after the last one, the next slide. */
  steps: number;
  Component: ComponentType<SlideProps>;
}
