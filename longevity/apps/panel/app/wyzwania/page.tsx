import {
  podsumuj,
  postepPoziomu,
  pozycjaWlasna,
  przegladKatalogu,
  przyznaneOdznaki,
  rankingZespolow,
  JEDNOSTKI,
} from '@longevity/challenges';

import { dolaczDoWyzwania } from '../../lib/actions.ts';
import { liczba } from '../../lib/format.ts';
import { getSession } from '../../lib/session.ts';
import {
  DZISIAJ,
  KATALOG,
  KOHORTA,
  PAKIET_UCZESTNIKA,
  SUBJECT_REF,
  ZESPOL_UCZESTNIKA,
} from '../../lib/wyzwania.ts';

export default async function Wyzwania() {
  const session = await getSession();
  const { assessment } = session;

  // Kwalifikacja wymaga oceny ryzyka. Bez niej nie wiemy, komu proponujemy
  // liczenie kroków — więc katalog nie jest pokazywany „na razie bez filtra".
  if (assessment === undefined) {
    return (
      <>
        <header className="strona">
          <h1>Wyzwania</h1>
        </header>
        <div className="karta">
          <p style={{ marginTop: 0 }}>
            Wyzwania otwierają się po wypełnieniu kwestionariusza. To nie jest
            formalność: dobór wyzwań zależy od oceny ryzyka, a bez niej program
            proponowałby wysiłek osobie, która najpierw powinna trafić do lekarza.
          </p>
          <a className="przycisk" href="/">
            Wypełnij kwestionariusz
          </a>
        </div>
      </>
    );
  }

  const przeglad = przegladKatalogu(KATALOG, { ocena: assessment, pakiet: PAKIET_UCZESTNIKA });
  const zapisane = new Set(session.zapisy.map((zapis) => zapis.wyzwanieId));

  const podsumowanie = podsumuj(KATALOG, session.zapisy, session.pomiary, DZISIAJ);
  const poziom = postepPoziomu(podsumowanie.punkty);
  const odznaki = przyznaneOdznaki(podsumowanie, KATALOG);

  const stawka = [...KOHORTA, { subjectRef: SUBJECT_REF, zespol: ZESPOL_UCZESTNIKA, punkty: podsumowanie.punkty }];
  const pozycja = pozycjaWlasna(SUBJECT_REF, stawka);
  const ranking = rankingZespolow(stawka);

  return (
    <>
      <header className="strona">
        <h1>Wyzwania</h1>
        <p>
          Punkty nie są walutą — nie da się ich wymienić na pieniądze ani na zniżkę
          na świadczenie zdrowotne. Otwierają poziomy i odznaki, nic więcej.
        </p>
      </header>

      <div className="karta">
        <div className="wynik-glowny">
          <span className="wynik-liczba">{liczba(podsumowanie.punkty)}</span>
          <span className="wynik-max">pkt</span>
          {/* Własna klasa, nie „kategoria" — zielona pastylka z ekranu wyniku
              oznacza kategorię ryzyka i nie może znaczyć dwóch rzeczy. */}
          <span className="poziom-znacznik" style={{ marginLeft: 'auto' }}>
            {poziom.biezacy.nazwa}
          </span>
        </div>

        {poziom.nastepny !== undefined && (
          <p className="postep-opis" style={{ marginTop: 10 }}>
            Do poziomu „{poziom.nastepny.nazwa}" brakuje {poziom.brakuje} pkt.
          </p>
        )}

        <div className="kafle" style={{ marginTop: 14 }}>
          <div className="kafel">
            <div className="kafel-etykieta">Ukończone wyzwania</div>
            <div className="kafel-wartosc">{podsumowanie.ukonczone}</div>
          </div>
          <div className="kafel">
            <div className="kafel-etykieta">Najdłuższa passa</div>
            <div className="kafel-wartosc">{podsumowanie.najdluzszaPassa} dni</div>
          </div>
          {pozycja !== undefined && (
            <div className="kafel">
              <div className="kafel-etykieta">Twoja pozycja</div>
              <div className="kafel-wartosc">
                {pozycja.pozycja} <span className="wynik-max">z {pozycja.uczestnikow}</span>
              </div>
            </div>
          )}
        </div>

        {odznaki.length > 0 && (
          <>
            <h2>Odznaki</h2>
            <ul className="odznaki">
              {odznaki.map((odznaka) => (
                <li key={odznaka.kod}>
                  <strong>{odznaka.nazwa}</strong>
                  <span className="mala"> — {odznaka.opis}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Katalog</h2>
        {przeglad.map(({ wyzwanie, kwalifikacja }) => (
          <div className="wyzwanie" key={wyzwanie.id}>
            <div className="wyzwanie-naglowek">
              <span className="wyzwanie-nazwa">{wyzwanie.nazwa}</span>
              {wyzwanie.typ === 'zespolowe' && <span className="znacznik">zespołowe</span>}
              <span className="mala">{wyzwanie.punkty} pkt/dzień</span>
            </div>
            <p className="mala" style={{ margin: '4px 0 8px' }}>
              Cel dzienny: {liczba(wyzwanie.cel)} {JEDNOSTKI[wyzwanie.metryka]} · {wyzwanie.czasTrwaniaDni} dni
              {wyzwanie.filar !== undefined && ` · filar ${wyzwanie.filar}`}
            </p>

            {!kwalifikacja.dozwolone ? (
              // Wyzwanie niedostępne zostaje na liście razem z powodem.
              // Coś, co znika bez słowa, uczy tylko szukania obejścia.
              <div className="wstrzymane">
                <h3>Wyzwanie wstrzymane</h3>
                <p>{kwalifikacja.powod}</p>
              </div>
            ) : zapisane.has(wyzwanie.id) ? (
              <a className="przycisk wtorny" href={`/wyzwania/${wyzwanie.id}`}>
                Otwórz — jesteś zapisany
              </a>
            ) : (
              <form action={dolaczDoWyzwania}>
                <input type="hidden" name="wyzwanieId" value={wyzwanie.id} />
                <button type="submit">Dołącz</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Ranking zespołów</h2>
        <p className="mala" style={{ marginTop: 0 }}>
          Zestawienie obejmuje wyłącznie zespoły liczące co najmniej {ranking.prog} osób
          i pokazuje średnią, nie sumę. Rankingu imiennego nie ma — z liczby kroków
          da się wnioskować o czyimś zdrowiu, a zapis do wyzwania nie jest zgodą
          na taki wniosek.
        </p>
        <table>
          <thead>
            <tr>
              <th>Zespół</th>
              <th style={{ width: 90 }}>Osób</th>
              <th style={{ width: 150 }}>Średnio punktów</th>
            </tr>
          </thead>
          <tbody>
            {ranking.wyniki.map((wynik) => (
              <tr key={wynik.zespol}>
                <td>{wynik.zespol}</td>
                <td>{wynik.osob}</td>
                <td>{liczba(wynik.sredniaPunktow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranking.pominietych > 0 && (
          <p className="mala" style={{ marginBottom: 0 }}>
            Pominięto {ranking.pominietych} zespół poniżej progu. Nazwa też zawęża grupę,
            więc nie jest podawana.
          </p>
        )}
      </div>

      <div className="akcje">
        <a className="przycisk wtorny" href="/wynik">
          Wróć do wyniku
        </a>
      </div>
    </>
  );
}
