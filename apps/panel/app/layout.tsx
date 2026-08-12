import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import './styles.css';

export const metadata: Metadata = {
  title: 'Longevity — panel uczestnika',
  description: 'Prototyp Fazy A programu Długowieczności',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        {/* Prototyp nie przyjmuje danych rzeczywistych osób (decyzja 8,
            specyfikacja 12.6). Komunikat jest stały i widoczny na każdej
            stronie, żeby nikt nie użył tego przez pomyłkę na pilotażu. */}
        <div className="pasek-prototyp">
          Prototyp Fazy A — wyłącznie dane syntetyczne. Nie wprowadzaj informacji
          o rzeczywistych osobach.
        </div>
        <div className="uklad">{children}</div>
      </body>
    </html>
  );
}
