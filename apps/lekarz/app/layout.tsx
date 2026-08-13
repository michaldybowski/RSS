import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { biezacaSesja } from '../lib/aktor.ts';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel lekarza',
  description: 'Grafik konsultacji, Karta Pacjenta za zgodą, zlecenia badań',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sesja = await biezacaSesja();

  return (
    <html lang="pl">
      <body>
        <div className="pasek-prototyp">
          Prototyp — dane syntetyczne. Progi reguł są w wersji roboczej i nie zostały
          zatwierdzone medycznie; nie podejmuj na ich podstawie decyzji klinicznych.
        </div>
        <div className="uklad">
          {sesja !== undefined && (
            <nav className="glowna">
              <a href="/grafik">Grafik</a>
              <a href="/" style={{ marginLeft: 'auto' }}>{sesja.lekarz.imie} — zmień</a>
            </nav>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
