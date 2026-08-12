import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { biezacaSesja } from '../lib/aktor.ts';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel audytora',
  description: 'Audyt Zdrowe Biuro i certyfikacja Pracodawca Długowieczności',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sesja = await biezacaSesja();

  return (
    <html lang="pl">
      <body>
        <div className="pasek-prototyp">
          Prototyp — dane syntetyczne. Certyfikat jest oświadczeniem wobec osób
          trzecich: wydawaj go wyłącznie na podstawie zweryfikowanych dowodów.
        </div>
        <div className="uklad">
          {sesja !== undefined && (
            <nav className="glowna">
              <a href="/audyty">Moje audyty</a>
              <a href="/rejestr">Rejestr certyfikatów</a>
              <a href="/" style={{ marginLeft: 'auto' }}>{sesja.imie} — zmień</a>
            </nav>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
