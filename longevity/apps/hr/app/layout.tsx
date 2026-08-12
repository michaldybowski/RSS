import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { biezacaSesja } from '../lib/aktor.ts';
import { nazwaOrganizacji } from '../lib/dane.ts';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel HR',
  description: 'Agregaty i rozliczenia programu Długowieczności',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sesja = await biezacaSesja();

  return (
    <html lang="pl">
      <body>
        <div className="pasek-prototyp">
          Prototyp — dane syntetyczne. Panel pokazuje wyłącznie statystyki zbiorcze;
          dane pojedynczych osób nie są tu dostępne.
        </div>
        <div className="uklad">
          {sesja !== undefined && (
            <nav className="glowna">
              <a href="/dashboard">Statystyki</a>
              <a href="/rozliczenia">Rozliczenia</a>
              <a href="/dziennik">Dziennik dostępu</a>
              <a href="/" style={{ marginLeft: 'auto' }}>
                {nazwaOrganizacji(sesja.organizationId)} — zmień
              </a>
            </nav>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
