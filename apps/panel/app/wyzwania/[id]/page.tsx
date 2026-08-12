import { redirect } from 'next/navigation';

import {
  JEDNOSTKI,
  LIMIT_PUNKTOW_DZIENNIE,
  MAKSIMA_DOBOWE,
  OKNO_WSTECZNE_DNI,
  postep,
  PROG_UKONCZENIA_PROCENT,
  celOsiagniety,
} from '@longevity/challenges';

import { zapiszWynikDnia } from '../../../lib/actions.ts';
import { liczba } from '../../../lib/format.ts';
import { getSession } from '../../../lib/session.ts';
import { DZISIAJ, wyzwaniePoId } from '../../../lib/wyzwania.ts';

export default async function SzczegolyWyzwania({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);

  const wyzwanie = wyzwaniePoId(id);
  const zapis = session.zapisy.find((pozycja) => pozycja.wyzwanieId === id);
  if (wyzwanie === undefined || zapis === undefined) redirect('/wyzwania');

  const wynik = postep(wyzwanie, zapis, session.pomiary, DZISIAJ);
  const pomiary = session.pomiary
    .filter((pomiar) => pomiar.wyzwanieId === id)
    .slice()
    .reverse();

  return (
    <>
      <header className="strona">
        <h1>{wyzwanie.nazwa}</h1>
        <p>
          Cel dzienny: {liczba(wyzwanie.cel)} {JEDNOSTKI[wyzwanie.metryka]} · start {zapis.od} ·{' '}
          {wyzwanie.czasTrwaniaDni} dni
        </p>
      </header>

      <div className="karta">
        <div className="postep">
          <div className="postep-tor">
            <div className="postep-wypelnienie" style={{ width: `${Math.min(100, wynik.procent)}%` }} />
          </div>
          <p className="postep-opis">
            {wynik.dniZaliczone} z {wynik.dniWyzwania} dni z osiągniętym celem ({wynik.procent}%)
          </p>
        </div>

        <div className="kafle">
          <div className="kafel">
            <div className="kafel-etykieta">Passa</div>
            <div className="kafel-wartosc">{wynik.passa} dni</div>
          </div>
          <div className="kafel">
            <div className="kafel-etykieta">Najdłuższa passa</div>
            <div className="kafel-wartosc">{wynik.najdluzszaPassa} dni</div>
          </div>
          <div className="kafel">
            <div className="kafel-etykieta">Punkty</div>
            <div className="kafel-wartosc">{liczba(wynik.punkty)}</div>
          </div>
        </div>

        {wynik.ukonczone ? (
          <div className="notka" style={{ marginTop: 14 }}>
            Wyzwanie zaliczone. Próg wynosi {PROG_UKONCZENIA_PROCENT}% dni, a nie komplet —
            gorszy tydzień nie przekreśla zmiany nawyku.
          </div>
        ) : (
          <p className="mala" style={{ marginBottom: 0 }}>
            Do zaliczenia brakuje {wynik.brakujeDoUkonczenia} dni z osiągniętym celem
            (próg to {PROG_UKONCZENIA_PROCENT}% z {wynik.dniWyzwania} dni).
          </p>
        )}
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Wpis dzienny</h2>

        {session.bladPomiaru !== undefined && <div className="blad">{session.bladPomiaru}</div>}

        <form action={zapiszWynikDnia}>
          <input type="hidden" name="wyzwanieId" value={wyzwanie.id} />
          <div className="pytanie">
            <label className="etykieta" htmlFor="wartosc">
              Wynik dnia
            </label>
            <p className="pomoc">
              Jednostka: {JEDNOSTKI[wyzwanie.metryka]}. Wpis ręczny obejmuje dziś i wczoraj —
              uzupełnianie odległych dni nie jest pomiarem, tylko deklaracją.
            </p>
            <input
              id="wartosc"
              type="number"
              name="wartosc"
              min={0}
              max={MAKSIMA_DOBOWE[wyzwanie.metryka]}
              required
            />
          </div>
          <div className="pytanie">
            <label className="etykieta" htmlFor="dzien">
              Dzień
            </label>
            <input id="dzien" type="date" name="dzien" defaultValue={DZISIAJ} required />
          </div>
          <div className="akcje">
            <button type="submit">Zapisz wynik</button>
          </div>
        </form>

        <p className="mala" style={{ marginBottom: 0 }}>
          Przekroczenie celu nie daje więcej punktów, a dobowa suma ze wszystkich wyzwań
          jest ograniczona do {LIMIT_PUNKTOW_DZIENNIE} pkt. Wpis z urządzenia może się
          spóźnić do {OKNO_WSTECZNE_DNI.wearable} dni.
        </p>
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Historia</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 130 }}>Dzień</th>
              <th>Wynik</th>
              <th style={{ width: 120 }}>Źródło</th>
              <th style={{ width: 100 }}>Cel</th>
            </tr>
          </thead>
          <tbody>
            {pomiary.map((pomiar) => (
              <tr key={pomiar.dzien}>
                <td>{pomiar.dzien}</td>
                <td>
                  {liczba(pomiar.wartosc)} {JEDNOSTKI[wyzwanie.metryka]}
                </td>
                <td>{pomiar.zrodlo === 'wearable' ? 'urządzenie' : 'wpis ręczny'}</td>
                <td>{celOsiagniety(wyzwanie, pomiar.wartosc) ? 'osiągnięty' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="akcje">
        <a className="przycisk wtorny" href="/wyzwania">
          Wróć do wyzwań
        </a>
      </div>
    </>
  );
}
