import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';
import { opisRodzaju, POLITYKA_RETENCJI } from '@longevity/gdpr';

import { wykonajRetencjeDla } from '../../lib/akcje.ts';
import { biezacaSesja } from '../../lib/aktor.ts';
import { DZIS, OPIS_AKCJI_RETENCJI } from '../../lib/dane.ts';
import { kolejkaRetencji, type KolejkaRetencji } from '../../lib/operacje.ts';
import { pobierzWykonaneZadania } from '../../lib/stan.ts';

const OPIS_PUNKTU: Readonly<Record<string, string>> = {
  od_utworzenia: 'od utworzenia rekordu',
  od_zakonczenia_uczestnictwa: 'od zakończenia uczestnictwa',
  od_konca_roku_obrotowego: 'od końca roku obrotowego',
};

export default async function Retencja() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  let kolejka: readonly KolejkaRetencji[] = [];
  let odmowa: string | undefined;

  try {
    kolejka = kolejkaRetencji(sesja.actor);
  } catch (blad) {
    if (!(blad instanceof AccessDeniedError)) throw blad;
    odmowa = blad.message;
  }

  const wykonane = pobierzWykonaneZadania();

  return (
    <>
      <header className="strona">
        <h1>Retencja</h1>
        <p>
          Zadania wymagalne na {DZIS}. Podmioty występują pod pseudonimami —
          do wykonania retencji nie trzeba wiedzieć, czyje to dane.
        </p>
      </header>

      {odmowa !== undefined && <div className="blad">{odmowa}</div>}

      {odmowa === undefined && (
        <>
          {kolejka.length === 0 ? (
            <div className="karta">
              <p style={{ margin: 0 }}>Brak zadań wymagalnych na dziś.</p>
            </div>
          ) : (
            kolejka.map((pozycja) => (
              <div className="karta" key={pozycja.subjectRef}>
                <div className="warsztat-wiersz" style={{ marginBottom: 6 }}>
                  <strong style={{ flex: 1 }}>{pozycja.subjectRef}</strong>
                  <span className="mala">
                    {pozycja.uczestnictwoDo === undefined
                      ? 'uczestnictwo trwa'
                      : `uczestnictwo do ${pozycja.uczestnictwoDo}`}
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Rekord</th>
                      <th>Rodzaj</th>
                      <th style={{ width: 110 }}>Termin</th>
                      <th style={{ width: 210 }}>Działanie</th>
                      <th>Podstawa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pozycja.zadania.map((zadanie) => (
                      <tr key={zadanie.rekordId}>
                        <td>{zadanie.rekordId}</td>
                        <td>{opisRodzaju(zadanie.rodzaj)}</td>
                        <td>{zadanie.termin}</td>
                        <td>{OPIS_AKCJI_RETENCJI[zadanie.akcja]}</td>
                        <td className="mala">{zadanie.podstawa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <form action={wykonajRetencjeDla}>
                  <input type="hidden" name="subjectRef" value={pozycja.subjectRef} />
                  <button type="submit">Wykonaj zadania ({pozycja.zadania.length})</button>
                </form>
              </div>
            ))
          )}

          {wykonane.length > 0 && (
            <div className="karta">
              <h2 style={{ marginTop: 0 }}>Wykonane</h2>
              <table>
                <thead>
                  <tr>
                    <th>Podmiot</th>
                    <th>Rekord</th>
                    <th>Rodzaj</th>
                    <th>Działanie</th>
                  </tr>
                </thead>
                <tbody>
                  {wykonane.map((zadanie) => (
                    <tr key={`${zadanie.subjectRef}-${zadanie.rekordId}`}>
                      <td>{zadanie.subjectRef}</td>
                      <td>{zadanie.rekordId}</td>
                      <td>{opisRodzaju(zadanie.rodzaj)}</td>
                      <td>{OPIS_AKCJI_RETENCJI[zadanie.akcja]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Polityka</h2>
            <p className="mala" style={{ marginTop: 0 }}>
              Trzy punkty odniesienia, bo trzy różne podstawy. Liczenie wszystkiego od
              utworzenia rekordu kasowałoby dane osobie, która wciąż jest w programie.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Rodzaj</th>
                  <th style={{ width: 240 }}>Liczone</th>
                  <th style={{ width: 90 }}>Okres</th>
                  <th style={{ width: 200 }}>Działanie</th>
                </tr>
              </thead>
              <tbody>
                {POLITYKA_RETENCJI.map((regula) => (
                  <tr key={regula.rodzaj}>
                    <td>{opisRodzaju(regula.rodzaj)}</td>
                    <td>{OPIS_PUNKTU[regula.punktOdniesienia]}</td>
                    <td>{regula.miesiace} mies.</td>
                    <td>{OPIS_AKCJI_RETENCJI[regula.akcja]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
