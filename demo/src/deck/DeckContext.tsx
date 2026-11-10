import { createContext, useContext } from 'react';

export interface DeckState {
  /** HUD hidden (H): also hides helper labels such as empty video-slot names. */
  clean: boolean;
  /** Clip audio muted (M). */
  muted: boolean;
  /** Increments on R: the active clip restarts. */
  replayToken: number;
}

export const DeckContext = createContext<DeckState>({ clean: false, muted: false, replayToken: 0 });

export const useDeck = () => useContext(DeckContext);
