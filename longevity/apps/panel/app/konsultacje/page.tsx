import { OKNO_ODWOLANIA_H, widokTerminarza } from '@longevity/clinical';

import { odwolajTermin, zarezerwujTermin } from '../../lib/actions.ts';
import { dzienIGodzina, LEKARZE, terminPoId, TERAZ, TERMINY } from '../../lib/konsultacje.ts';
import { getSession } from '../../lib/session.ts';

const OPIS_STATUSU: Readonly<Record<string, string>> = {
  zarezerwowana: 'zarezerwowana',
  odbyta: 'odbyta',
  odwolana: 'odwołana',
  niestawiennictwo: 'niestawiennictwo',
};

export default async function Konsultacje() {
  const session = await getSession();
  const { assessment } = session;

  if (assessment === undefined) {
    return (
      <>
        <header className="strona">
          <h1>Konsultacje</h1>
        </header>
        <div className="karta">
          <p style={{ marginTop: 0 }}>
            Terminarz otwiera się po wypełnieniu kwestionariusza — dostępność terminów
            zależy od kategorii ryzyka.
          </p>
          <a className="przycisk" href="/">
            Wypełnij kwestionariusz
          </a>
        </div>
      </>
    );
  }

  const widok = widokTerminarza(TERMINY, session.konsultacje, assessment.riskCategory, TERAZ);
  const moje = session.konsultacje;

  return (
    <>
      <header className="strona">
        <h1>Konsultacje</h1>
        <p>
          Rezerwacja terminu <strong>nie jest</strong> zgodą na udostępnienie Karty
          Pacjenta. To dwie osobne decyzje: rozmowa może się odbyć bez udostępniania
          wyników, a zgodę możesz cofnąć w każdej chwili.
        </p>
      </header>

      {session.bladRezerwacji !== undefined && <div className="blad">{session.bladRezerwacji}</div>}

      {moje.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Twoje wizyty</h2>
          <table>
            <thead>
              <tr>
                <th>Termin</th>
                <th style={{ width: 150 }}>Lekarz</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {moje.map((konsultacja) => {
                const termin = terminPoId(konsultacja.terminId)!;

                return (
                  <tr key={konsultacja.id}>
                    <td>{dzienIGodzina(termin.start)}</td>
                    <td>{LEKARZE[termin.clinicianId]}</td>
                    <td>
                      {OPIS_STATUSU[konsultacja.status]}
                      {konsultacja.poznoOdwolana === true && (
                        <span className="mala"> · odwołana późno</span>
                      )}
                    </td>
                    <td>
                      {konsultacja.status === 'zarezerwowana' && (
                        <form action={odwolajTermin}>
                          <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
                          <button type="submit" className="wtorny">
                            Odwołaj
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mala" style={{ marginBottom: 0 }}>
            Odwołanie później niż {OKNO_ODWOLANIA_H} godzin przed wizytą jest odnotowane
            w grafiku, ale nie wiąże się z żadną opłatą.
          </p>
        </div>
      )}

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Wolne terminy</h2>
        {widok.length === 0 ? (
          <p style={{ margin: 0 }}>Brak terminów w najbliższym czasie.</p>
        ) : (
          widok.map(({ termin, dostepny, powod }) => (
            <div className="wyzwanie" key={termin.id}>
              <div className="wyzwanie-naglowek">
                <span className="wyzwanie-nazwa">{dzienIGodzina(termin.start)}</span>
                {termin.rodzaj === 'pilny' && <span className="znacznik">pula pilna</span>}
                <span className="mala">
                  {LEKARZE[termin.clinicianId]} · {termin.minut} min
                </span>
              </div>

              {!dostepny ? (
                // Termin zamknięty zostaje na liście z powodem. Zniknięcie bez
                // słowa wygląda jak brak wolnych miejsc, a to co innego.
                <div className="wstrzymane">
                  <h3>Termin niedostępny</h3>
                  <p>{powod}</p>
                </div>
              ) : (
                <form action={zarezerwujTermin}>
                  <input type="hidden" name="terminId" value={termin.id} />
                  <div className="pytanie">
                    <label className="etykieta" htmlFor={`powod-${termin.id}`}>
                      Czego ma dotyczyć rozmowa (opcjonalnie)
                    </label>
                    <input
                      id={`powod-${termin.id}`}
                      type="text"
                      name="powod"
                      maxLength={200}
                      placeholder="np. omówienie wyników badań"
                    />
                  </div>
                  <button type="submit">Zarezerwuj</button>
                </form>
              )}
            </div>
          ))
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
