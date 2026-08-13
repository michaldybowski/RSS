import { redirect } from 'next/navigation';

import { grafik } from '@longevity/clinical';

import { biezacaSesja } from '../../lib/aktor.ts';
import { DZIS, godzina, OPIS_STATUSU, TERMINY } from '../../lib/dane.ts';
import { pobierzKonsultacje } from '../../lib/stan.ts';

export default async function Grafik() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const dzien = grafik(pobierzKonsultacje(), TERMINY, sesja.lekarz.id, DZIS);

  return (
    <>
      <header className="strona">
        <h1>Grafik na {DZIS}</h1>
        <p>
          Konsultacje przypisane do Ciebie. Pacjenci są opisani pseudonimem —
          tożsamość nie jest potrzebna do prowadzenia grafiku.
        </p>
      </header>

      {dzien.length === 0 ? (
        <div className="karta">
          <p style={{ margin: 0 }}>Brak konsultacji na dziś.</p>
        </div>
      ) : (
        <div className="karta">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Godzina</th>
                <th style={{ width: 110 }}>Pacjent</th>
                <th>Powód</th>
                <th style={{ width: 90 }}>Rodzaj</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {dzien.map(({ konsultacja, termin }) => (
                <tr key={konsultacja.id}>
                  <td>{godzina(termin.start)}</td>
                  <td>{konsultacja.subjectRef}</td>
                  <td>{konsultacja.powod ?? '—'}</td>
                  <td>{termin.rodzaj === 'pilny' ? 'pilny' : 'planowy'}</td>
                  <td>{OPIS_STATUSU[konsultacja.status]}</td>
                  <td>
                    <a className="przycisk wtorny" href={`/konsultacje/${konsultacja.id}`}>
                      Otwórz
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
