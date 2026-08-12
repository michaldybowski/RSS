import { zweryfikuj } from '@longevity/audit';

import { nazwaOrganizacji, OPIS_POZIOMU, TERAZ } from '../../lib/dane.ts';
import { pobierzCertyfikaty } from '../../lib/stan.ts';

/**
 * Rejestr weryfikacji.
 *
 * Celowo bez logowania — certyfikat, którego nie da się sprawdzić, jest
 * naklejką. Wyszukiwarka zwraca status i poziom, ale nie ustalenia z audytu:
 * te są sprawą zakładu, nie osoby sprawdzającej numer.
 */
export default async function Rejestr({
  searchParams,
}: {
  searchParams: Promise<{ numer?: string }>;
}) {
  const { numer } = await searchParams;
  const certyfikaty = pobierzCertyfikaty();
  const wynik = numer !== undefined && numer !== '' ? zweryfikuj(certyfikaty, numer, TERAZ) : undefined;

  return (
    <>
      <header className="strona">
        <h1>Rejestr certyfikatów</h1>
        <p>
          Sprawdź numer certyfikatu „Pracodawca Długowieczności". Weryfikacja nie
          wymaga logowania i nie ujawnia ustaleń z audytu.
        </p>
      </header>

      <form className="karta" method="get">
        <div className="filtry">
          <label className="filtr" style={{ flex: 1 }}>
            Numer certyfikatu
            <input type="text" name="numer" defaultValue={numer ?? ''} placeholder="PD/2026/0001" />
          </label>
          <button type="submit">Sprawdź</button>
        </div>
      </form>

      {wynik !== undefined && (
        <div className="karta">
          {!wynik.znaleziony ? (
            <div className="blad" style={{ marginBottom: 0 }}>
              Nie znaleziono certyfikatu o numerze {wynik.numer}. Sprawdź zapis numeru
              albo skontaktuj się z Centrum Audytu i Certyfikacji.
            </div>
          ) : (
            <>
              <div className="warsztat-wiersz">
                <strong style={{ flex: 1, fontSize: 20 }}>{wynik.numer}</strong>
                <span className={`poziom ${wynik.poziom}`}>
                  {OPIS_POZIOMU[wynik.poziom ?? 'brak']}
                </span>
              </div>
              <p style={{ marginBottom: 0 }}>
                Status: <strong>{wynik.status}</strong> · ważny do {wynik.waznyDo}
              </p>
            </>
          )}
        </div>
      )}

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Wydane certyfikaty</h2>
        {certyfikaty.length === 0 ? (
          <p style={{ margin: 0 }}>Nie wydano jeszcze żadnego certyfikatu.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Numer</th>
                <th>Zakład</th>
                <th style={{ width: 110 }}>Poziom</th>
                <th style={{ width: 80 }}>Wynik</th>
                <th style={{ width: 120 }}>Ważny do</th>
              </tr>
            </thead>
            <tbody>
              {certyfikaty.map((certyfikat) => (
                <tr key={certyfikat.numer}>
                  <td>{certyfikat.numer}</td>
                  <td>{nazwaOrganizacji(certyfikat.organizationId)}</td>
                  <td>{OPIS_POZIOMU[certyfikat.poziom]}</td>
                  <td>{certyfikat.wynikProcent}%</td>
                  <td>{certyfikat.waznyDo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
