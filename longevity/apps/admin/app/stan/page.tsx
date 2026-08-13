import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';

import { biezacaSesja } from '../../lib/aktor.ts';
import { OPIS_ZRODLA } from '../../lib/dane.ts';
import { stanSystemu, type StanSystemu } from '../../lib/operacje.ts';

const OPIS_PODSTAWY: Readonly<Record<string, string>> = {
  art6_1a_zgoda: 'art. 6 ust. 1 lit. a — zgoda',
  art6_1b_umowa: 'art. 6 ust. 1 lit. b — umowa',
  art9_2a_zgoda_wyrazna: 'art. 9 ust. 2 lit. a — zgoda wyraźna',
};

/**
 * Warunki, których nie da się spełnić kodem. Są tu, bo panel administratora
 * jest jedynym miejscem, gdzie ktoś je zobaczy przed uruchomieniem programu
 * na prawdziwych ludziach — a nie w dokumencie, który się zamyka.
 */
const BLOKADY_PRZED_PRODUKCJA: readonly { tytul: string; opis: string }[] = [
  {
    tytul: 'Imienna akceptacja progów przez lekarza',
    opis:
      'Zestaw reguł ma status roboczy. Do czasu akceptacji ścieżka danych rzeczywistych ' +
      'jest zablokowana technicznie (assertRulesetApprovedForRealData), nie tylko proceduralnie.',
  },
  {
    tytul: 'Rozszerzenie zakresu IOD na FDP i zgłoszenie do UODO',
    opis: 'Aneks do umowy z inspektorem ochrony danych oraz aktualizacja zgłoszenia.',
  },
  {
    tytul: 'DPIA z udziałem IOD',
    opis:
      'Ocena skutków dla ochrony danych obejmuje profilowanie zdrowotne i transfer ' +
      'do dostawcy modelu poza EOG.',
  },
  {
    tytul: 'Rozstrzygnięcie relacji HCPL — FDP',
    opis: 'Współadministrowanie (art. 26) czy powierzenie (art. 28). Od tego zależy treść umów.',
  },
  {
    // Decyzja 1 jest rozstrzygnięta (CloudFerro), ale warunek nie znika razem
    // z nią: przed wejściem prawdziwych danych trzeba jeszcze umowy powierzenia.
    // Wykreślenie tej pozycji po wyborze dostawcy zamieniłoby listę warunków
    // w listę zakupów.
    tytul: 'Umowa powierzenia z dostawcą hostingu',
    opis:
      'Hosting: CloudFerro (Polska) — decyzja 1 rozstrzygnięta. Dane klasy K1 ' +
      'wymagają jeszcze umowy powierzenia przetwarzania (art. 28 RODO) ' +
      'i szyfrowanego wolumenu z odtworzeniem kopii przetestowanym raz.',
  },
];

export default async function Stan() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  let stan: StanSystemu | undefined;
  let odmowa: string | undefined;

  try {
    stan = stanSystemu(sesja.actor);
  } catch (blad) {
    if (!(blad instanceof AccessDeniedError)) throw blad;
    odmowa = blad.message;
  }

  return (
    <>
      <header className="strona">
        <h1>Stan systemu</h1>
        <p>Wersje reguł i zgód oraz warunki, które muszą być spełnione przed produkcją.</p>
      </header>

      {odmowa !== undefined && <div className="blad">{odmowa}</div>}

      {stan !== undefined && (
        <>
          {!stan.ruleset.zatwierdzony && (
            <div className="blad">
              Zestaw reguł {stan.ruleset.wersja} ma status „{stan.ruleset.status}". Ocena ryzyka
              dla danych rzeczywistego uczestnika jest zablokowana do czasu imiennej akceptacji
              lekarza. Ścieżka syntetyczna (prototyp, demo, testy) działa bez zmian.
            </div>
          )}

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Wersje</h2>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: 280 }}>Zestaw reguł medycznych</th>
                  <td>
                    {stan.ruleset.wersja} · status {stan.ruleset.status}
                  </td>
                </tr>
                <tr>
                  <th>Kwestionariusz</th>
                  <td>
                    {stan.kwestionariusz.wersja} · {stan.kwestionariusz.pytan} pytań
                  </td>
                </tr>
                <tr>
                  <th>Próg k-anonimowości</th>
                  <td>{stan.progK} osób w grupie</td>
                </tr>
                <tr>
                  <th>Źródła wymagające potwierdzenia</th>
                  <td>{stan.zrodlaKrytyczne.map((source) => OPIS_ZRODLA[source]).join(', ')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Katalog zgód</h2>
            <p className="mala" style={{ marginTop: 0 }}>
              Zmiana wersji zgody wymaga ponownego zebrania od wszystkich uczestników.
              Nie jest to poprawka redakcyjna.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th style={{ width: 80 }}>Wersja</th>
                  <th style={{ width: 260 }}>Podstawa</th>
                  <th style={{ width: 130 }}>Obowiązuje od</th>
                </tr>
              </thead>
              <tbody>
                {stan.zgody.map((zgoda) => (
                  <tr key={zgoda.kod}>
                    <td>{zgoda.kod}</td>
                    <td>{zgoda.wersja}</td>
                    <td>{OPIS_PODSTAWY[zgoda.podstawa] ?? zgoda.podstawa}</td>
                    <td>{zgoda.obowiazujeOd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Warunki przed uruchomieniem produkcyjnym</h2>
            {BLOKADY_PRZED_PRODUKCJA.map((blokada) => (
              <div className="wstrzymane" key={blokada.tytul} style={{ marginBottom: 10 }}>
                <h3>{blokada.tytul}</h3>
                <p>{blokada.opis}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
