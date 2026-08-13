import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { biezacaSesja } from '../lib/aktor.ts';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel administratora',
  description: 'Synchronizacja Notion, wnioski osób, retencja i stan systemu',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sesja = await biezacaSesja();

  return (
    <html lang="pl">
      <body>
        <div className="pasek-prototyp">
          Prototyp — dane syntetyczne. Panel obsługuje utrzymanie systemu;
          treści danych zdrowotnych uczestników nie da się z niego odczytać.
        </div>
        <div className="uklad">
          {sesja !== undefined && (
            <nav className="glowna">
              <a href="/synchronizacja">Synchronizacja</a>
              <a href="/rodo">Wnioski osób</a>
              <a href="/retencja">Retencja</a>
              <a href="/prowizje">Prowizje</a>
              <a href="/stan">Stan systemu</a>
              <a href="/" style={{ marginLeft: 'auto' }}>
                {sesja.konto.opis} — zmień
              </a>
            </nav>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
