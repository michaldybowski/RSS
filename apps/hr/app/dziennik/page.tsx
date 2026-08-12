import { redirect } from 'next/navigation';

import { biezacaSesja } from '../../lib/aktor.ts';
import { pobierzDziennik } from '../../lib/zapytania.ts';

export default async function Dziennik() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const wpisy = pobierzDziennik();

  return (
    <>
      <header className="strona">
        <h1>Dziennik dostępu</h1>
        <p>
          Każde wejście na statystyki jest odnotowywane razem z zastosowanymi filtrami.
          Widzisz tu własne zapytania — ten sam zapis trafia do rejestru dostępnego
          inspektorowi ochrony danych.
        </p>
      </header>

      <div className="karta">
        {wpisy.length === 0 ? (
          <p style={{ margin: 0 }}>Brak zapisanych zapytań w tej sesji.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Metryka</th>
                <th>Filtry</th>
                <th>Wynik</th>
                <th style={{ width: 180 }}>Kiedy</th>
              </tr>
            </thead>
            <tbody>
              {wpisy.map((wpis, index) => (
                <tr key={`${wpis.at}-${index}`}>
                  <td>{wpis.metric}</td>
                  <td>{wpis.filtry}</td>
                  <td>{wpis.wynik}</td>
                  <td className="mala">{wpis.at.replace('T', ' ').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="notka" style={{ marginTop: 14 }}>
          Zapis filtrów, a nie samego faktu wejścia, jest tu celowy: próba
          odtworzenia danych pojedynczej osoby polega na serii coraz węższych
          zapytań i bez tej informacji nie dałoby się jej później wykryć.
        </div>
      </div>
    </>
  );
}
