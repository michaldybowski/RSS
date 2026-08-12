import { redirect } from 'next/navigation';

import { formatPln } from '@longevity/billing';
import { rozliczTrenera, type WarsztatDoRozliczenia } from '@longevity/workshops';

import { biezacaSesja } from '../../lib/aktor.ts';
import { OKRES, STAWKI, WARSZTATY } from '../../lib/dane.ts';
import { pobierzObecnosci, pobierzZapisy } from '../../lib/stan.ts';

const OPIS_STATUSU: Readonly<Record<string, string>> = {
  przeprowadzony: 'przeprowadzony',
  odwolany_platny: 'odwołany — rekompensata',
  odwolany_bezplatny: 'odwołany w terminie',
  bez_obecnosci: 'czeka na listę obecności',
};

export default async function Rozliczenie() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const doRozliczenia: WarsztatDoRozliczenia[] = WARSZTATY.map((warsztat) =>
    warsztat.status === 'odwolany'
      ? { warsztat, odwolanyAt: '2026-09-22T18:00:00.000Z' }
      : { warsztat },
  );

  const wynik = rozliczTrenera(
    sesja.trenerId,
    OKRES,
    doRozliczenia,
    pobierzZapisy().zapisy,
    pobierzObecnosci(),
    STAWKI,
  );

  const wstrzymane = wynik.pozycje.filter((pozycja) => pozycja.status === 'bez_obecnosci');

  return (
    <>
      <header className="strona">
        <h1>Rozliczenie — {OKRES}</h1>
        <p>
          {sesja.imie} · przeprowadzonych warsztatów: {wynik.przeprowadzonych}
        </p>
      </header>

      <div className="kafle" style={{ marginBottom: 18 }}>
        <div className="kafel">
          <div className="kafel-etykieta">Do wypłaty</div>
          <div className="kafel-wartosc">{wynik.sumaOpis}</div>
        </div>
        <div className="kafel">
          <div className="kafel-etykieta">Stawka za warsztat</div>
          <div className="kafel-wartosc" style={{ fontSize: 19 }}>
            {formatPln(STAWKI.zaWarsztatGr)} + {formatPln(STAWKI.zaUczestnikaGr)} za uczestnika
          </div>
        </div>
      </div>

      {wstrzymane.length > 0 && (
        <div className="karta">
          <div className="wstrzymane">
            <h3>
              {wstrzymane.length === 1 ? 'Jedna pozycja czeka' : `${wstrzymane.length} pozycje czekają`} na
              listę obecności
            </h3>
            <p>
              Brak odnotowanej obecności nie oznacza, że warsztat się nie odbył —
              oznacza, że nie mamy tego potwierdzonego. Uzupełnij listę, a pozycja
              wejdzie do rozliczenia.
            </p>
          </div>
        </div>
      )}

      <div className="karta">
        <table>
          <thead>
            <tr>
              <th style={{ width: 130 }}>Data</th>
              <th>Warsztat</th>
              <th style={{ width: 190 }}>Status</th>
              <th style={{ width: 70 }}>Obecnych</th>
              <th className="kwota" style={{ width: 110 }}>
                Kwota
              </th>
            </tr>
          </thead>
          <tbody>
            {wynik.pozycje.map((pozycja) => (
              <tr key={pozycja.warsztatId}>
                <td className="mala">{pozycja.start.replace('T', ' ').slice(0, 16)}</td>
                <td>
                  {pozycja.temat}
                  {pozycja.uwaga !== undefined && (
                    <>
                      <br />
                      <span className="mala">{pozycja.uwaga}</span>
                    </>
                  )}
                </td>
                <td>{OPIS_STATUSU[pozycja.status] ?? pozycja.status}</td>
                <td>{pozycja.status === 'przeprowadzony' ? pozycja.obecnych : '—'}</td>
                <td className="kwota">{formatPln(pozycja.kwotaGr)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="kwota" style={{ fontWeight: 700, fontSize: 18 }}>
          Razem: {wynik.sumaOpis}
        </p>
      </div>
    </>
  );
}
