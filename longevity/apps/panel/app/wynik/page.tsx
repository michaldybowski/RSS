import { redirect } from 'next/navigation';

import { summarizeFailure } from '@longevity/plan';

import { startOver } from '../../lib/actions.ts';
import { getSession } from '../../lib/session.ts';

const PLIKI = [
  { format: 'html', nazwa: 'Komplet dokumentów (HTML)', opis: 'Do przeglądania i wydruku' },
  { format: 'pdf', nazwa: 'Komplet dokumentów (PDF)', opis: 'Do wydrukowania i zabrania na wizytę' },
  { format: 'docx', nazwa: 'Wersja edytowalna (DOCX)', opis: 'Dla lekarza — do naniesienia poprawek' },
  { format: 'ics', nazwa: 'Harmonogram (kalendarz)', opis: 'Do zaimportowania w telefonie' },
] as const;

export default async function Wynik() {
  const session = await getSession();
  const { assessment, result } = session;

  if (assessment === undefined || result === undefined) redirect('/');

  const { healthScore, riskCategory, flags } = assessment;
  const maPlan = result.kind === 'plan';

  return (
    <>
      <header className="strona">
        <h1>Twój wynik</h1>
      </header>

      <div className="karta">
        <div className="wynik-glowny">
          <span className="wynik-liczba">{healthScore.overall}</span>
          <span className="wynik-max">/ 100</span>
          <span className={`kategoria ${riskCategory}`} style={{ marginLeft: 'auto' }}>
            {riskCategory}
          </span>
        </div>

        <h2>Obszary</h2>
        <div className="skladowe">
          {[...healthScore.components]
            .sort((a, b) => a.score - b.score)
            .map((component) => (
              <div key={component.component}>
                <div className="skladowa-naglowek">
                  <span>{component.component}</span>
                  <strong>{component.score}</strong>
                </div>
                <div className="skladowa-tor">
                  <div className="skladowa-wypelnienie" style={{ width: `${component.score}%` }} />
                </div>
                {/* Pokazujemy, co obniżyło wynik. Sama liczba bez uzasadnienia
                    nie mówi uczestnikowi, co ma z tym zrobić. */}
                {component.contributions.length > 0 && (
                  <ul className="skladowa-wklad">
                    {component.contributions.map((contribution) => (
                      <li key={contribution.factor}>
                        {contribution.factor} ({contribution.points} pkt)
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
        </div>
      </div>

      {flags.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Na co zwrócić uwagę</h2>
          {flags.map((flag) => (
            <div className={`flaga ${flag.level}`} key={flag.code}>
              <div className="flaga-kod">{flag.code}</div>
              <p>{flag.message}</p>
            </div>
          ))}
        </div>
      )}

      {result.kind === 'raport_ryzyk' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Plan nie został wygenerowany</h2>
          <p>
            Twoje odpowiedzi wskazują na sytuację, w której program wymaga oceny
            lekarskiej przed rozpoczęciem. Zamiast planu przygotowaliśmy raport
            ryzyk oraz zlecenie badań i pytania do lekarza.
          </p>
          <div className="notka">{result.report.disclaimer}</div>
        </div>
      )}

      {result.kind === 'kolejka_reczna' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Plan przygotuje specjalista</h2>
          <p>
            {result.reason === 'sciezka_reczna'
              ? 'Zgodnie z Twoim wyborem plan nie powstaje automatycznie. Ocena ryzyka i skierowania są gotowe — plan opisowy przygotuje specjalista.'
              : 'Automatyczne przygotowanie planu nie spełniło naszych kryteriów jakości, więc przekazaliśmy zadanie specjaliście. Skierowania i pytania do lekarza są już gotowe.'}
          </p>
          {result.attempts.length > 0 && (
            <details>
              <summary>Szczegóły techniczne</summary>
              <ul className="zwykla">
                {summarizeFailure(result.attempts).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {maPlan && result.kind === 'plan' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Twój plan</h2>
          <p>{result.plan.podsumowanie}</p>

          <h3>Tydzień w skrócie</h3>
          <table>
            <thead>
              <tr>
                <th>Dzień</th>
                <th>Pora</th>
                <th>Czynność</th>
              </tr>
            </thead>
            <tbody>
              {result.plan.harmonogram.map((item) => (
                <tr key={`${item.dzien}-${item.pora}-${item.czynnosc}`}>
                  <td>
                    {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][item.dzien - 1] ?? item.dzien}
                  </td>
                  <td>{item.pora}</td>
                  <td>{item.czynnosc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="notka">{result.disclaimer}</div>
        </div>
      )}

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Dokumenty</h2>
        <ul className="lista-plikow">
          {PLIKI.filter((plik) => plik.format !== 'ics' || maPlan).map((plik) => (
            <li key={plik.format}>
              <span>
                <strong>{plik.nazwa}</strong>
                <p className="plik-opis">{plik.opis}</p>
              </span>
              <a className="przycisk wtorny" href={`/dokumenty/${plik.format}`}>
                Pobierz
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Wyzwania</h2>
        <p style={{ marginTop: 0 }}>
          Dobór wyzwań wynika z tej samej oceny co plan. Te, które wymagają wysiłku
          niewskazanego przy Twojej kategorii ryzyka, zobaczysz z podanym powodem —
          nie znikną bez wyjaśnienia.
        </p>
        <a className="przycisk" href="/wyzwania">
          Przejdź do wyzwań
        </a>
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Biblioteka i Akademia</h2>
        <p style={{ marginTop: 0 }}>
          Materiały programu oraz ścieżki nauki. Propozycje dobierane są do obszarów,
          w których Twój wynik wypadł najsłabiej — liczone przy otwarciu strony
          i nigdzie niezapisywane.
        </p>
        <a className="przycisk" href="/biblioteka">
          Otwórz bibliotekę
        </a>
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Konsultacja</h2>
        <p style={{ marginTop: 0 }}>
          Rozmowa z lekarzem o wynikach i planie. Rezerwacja terminu nie jest zgodą
          na udostępnienie Karty Pacjenta — o tym decydujesz osobno.
        </p>
        <a className="przycisk" href="/konsultacje">
          Umów konsultację
        </a>
      </div>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Marketplace</h2>
        <p style={{ marginTop: 0 }}>
          Oferty partnerów programu. Katalog nie jest dobierany na podstawie Twoich
          wyników, a przy każdej ofercie widzisz wysokość prowizji programu.
        </p>
        <a className="przycisk" href="/marketplace">
          Otwórz marketplace
        </a>
      </div>

      <form action={startOver}>
        <div className="akcje">
          <button type="submit" className="wtorny">
            Zacznij od nowa
          </button>
        </div>
      </form>
    </>
  );
}
