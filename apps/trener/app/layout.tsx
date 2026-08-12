import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { biezacaSesja } from '../lib/aktor.ts';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel trenera',
  description: 'Warsztaty, obecności i rozliczenie',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sesja = await biezacaSesja();

  return (
    <html lang="pl">
      <body>
        <div className="pasek-prototyp">
          Prototyp — dane syntetyczne. Lista obecności zawiera dane osobowe:
          nie zostawiaj jej otwartej na wspólnym stanowisku.
        </div>
        <div className="uklad">
          {sesja !== undefined && (
            <nav className="glowna">
              <a href="/warsztaty">Moje warsztaty</a>
              <a href="/rozliczenie">Rozliczenie</a>
              <a href="/" style={{ marginLeft: 'auto' }}>
                {sesja.imie} — zmień
              </a>
            </nav>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
