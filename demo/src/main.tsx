import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import './styles.css';
import { Deck } from './deck/Deck';
import { slides } from './slides';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Deck slides={slides} />
  </React.StrictMode>,
);
