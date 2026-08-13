import { redirect } from 'next/navigation';

import { can } from '@longevity/access';
import { dokumentZlecenia } from '@longevity/clinical';

import {
  odnotujWizyte,
  przygotujZlecenie,
  rozpatrzZlecenie,
  zapiszWnioski,
} from '../../../lib/akcje.ts';
import { biezacaSesja } from '../../../lib/aktor.ts';
import { godzina, OPIS_STATUSU, terminPoId, TERAZ, uczestnikPoId } from '../../../lib/dane.ts';
import { AUDIT, pobierzKonsultacje1, pobierzNotatke, pobierzZlecenie } from '../../../lib/stan.ts';

export default async function Konsultacja({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sesja] = await Promise.all([params, biezacaSesja()]);
  if (sesja === undefined) redirect('/');

  const konsultacja = pobierzKonsultacje1(id);
  if (konsultacja === undefined) redirect('/grafik');

  const termin = terminPoId(konsultacja.terminId)!;
  const uczestnik = uczestnikPoId(konsultacja.participantId);

  const decyzja = can(sesja.actor, 'prowadzenie_konsultacji', {
    kind: 'konsultacja',
    organizationId: konsultacja.organizationId,
    clinicianId: konsultacja.clinicianId,
    participantId: konsultacja.participantId,
  });

  // Dostęp do karty to osobne pytanie od prowadzenia konsultacji: rola nie
  // wystarcza, potrzebna jest aktywna zgoda uczestnika.
  const dostepDoKarty = can(
    sesja.actor,
    'odczyt_karty_pacjenta',
    {
      kind: 'uczestnik',
      organizationId: konsultacja.organizationId,
      participantId: konsultacja.participantId,
    },
    { clinicianConsent: uczestnik?.zgodaNaKarte === true },
  );

  // Odnotowujemy także odmowę. Log, który zapisuje wyłącznie udane odczyty,
  // nie odpowiada na pytanie „kto próbował".
  if (decyzja.allowed) {
    AUDIT.dopisz({
      actorRef: sesja.lekarz.id,
      subjectRef: konsultacja.subjectRef,
      akcja: 'udostepnienie_lekarzowi',
      zasob: `karta/${konsultacja.participantId}`,
      kontekst: { wynik: dostepDoKarty.allowed ? 'udostepniono' : 'odmowa' },
      at: TERAZ,
    });
  }

  const notatka = pobierzNotatke(konsultacja.id);
  const zlecenie = pobierzZlecenie(konsultacja.id);
  const rozpoczeta = TERAZ >= termin.start;

  return (
    <>
      <header className="strona">
        <h1>Konsultacja {godzina(termin.start)}</h1>
        <p>
          Pacjent {konsultacja.subjectRef} · {termin.rodzaj === 'pilny' ? 'termin pilny' : 'termin planowy'} ·{' '}
          {OPIS_STATUSU[konsultacja.status]}
          {konsultacja.powod !== undefined && ` · ${konsultacja.powod}`}
        </p>
      </header>

      {/*
        Panel operuje na pseudonimie. Tożsamość pacjenta potwierdza się przy
        wizycie — osobiście albo kodem z aplikacji uczestnika. Pokazywanie tu
        imienia i nazwiska rozlałoby dane identyfikacyjne na kolejny system;
        pominięcie weryfikacji zupełnie byłoby jednak błędem klinicznym,
        dlatego procedura jest nazwana wprost, a nie przemilczana.
      */}
      <div className="notka">
        Tożsamość pacjenta potwierdź przy rozpoczęciu wizyty — panel prowadzi
        dokumentację pod pseudonimem <strong>{konsultacja.subjectRef}</strong>.
      </div>

      {!decyzja.allowed && (
        <div className="blad">
          {decyzja.reason} Konsultacja jest widoczna w trybie odczytu — Karty Pacjenta
          ani wniosków nie zapiszesz.
        </div>
      )}

      {/* --- Karta Pacjenta --- */}
      <div className="karta">
        <h2 style={{ marginTop: 0 }}>Karta Pacjenta</h2>

        {!dostepDoKarty.allowed || !decyzja.allowed ? (
          <div className="wstrzymane">
            <h3>Karta niedostępna</h3>
            <p>
              {decyzja.allowed
                ? 'Uczestnik nie udzielił zgody na udostępnienie Karty Pacjenta albo ją wycofał. ' +
                  'Zgoda jest odrębna od zapisu na konsultację — rozmowa może się odbyć bez niej.'
                : 'Kartę otwiera wyłącznie lekarz prowadzący tę konsultację.'}
            </p>
          </div>
        ) : (
          uczestnik !== undefined && (
            <>
              <div className="warsztat-wiersz" style={{ marginBottom: 10 }}>
                <strong style={{ flex: 1, fontSize: 22 }}>
                  {uczestnik.ocena.healthScore.overall}
                  <span className="mala"> / 100</span>
                </strong>
                <span className={`kategoria ${uczestnik.ocena.riskCategory}`}>
                  {uczestnik.ocena.riskCategory}
                </span>
              </div>

              {uczestnik.ocena.flags.length > 0 && (
                <>
                  <h3>Flagi</h3>
                  <ul className="zwykla">
                    {uczestnik.ocena.flags.map((flaga) => (
                      <li key={flaga.code}>
                        <strong>{flaga.level}</strong> — {flaga.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <table>
                <tbody>
                  <tr>
                    <th style={{ width: 200 }}>BMI</th>
                    <td>{uczestnik.ocena.derived.bmi}</td>
                  </tr>
                  <tr>
                    <th>TDEE</th>
                    <td>{uczestnik.ocena.derived.tdee} kcal</td>
                  </tr>
                  {uczestnik.ocena.derived.whr !== undefined && (
                    <tr>
                      <th>WHR</th>
                      <td>
                        {uczestnik.ocena.derived.whr} ({uczestnik.ocena.derived.whrCategory})
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <p className="mala" style={{ marginBottom: 0 }}>
                Zestaw reguł {uczestnik.ocena.rulesetVersion}, tryb {uczestnik.ocena.mode}.
                Materiał informacyjny — nie stanowi diagnozy.
              </p>
            </>
          )
        )}
      </div>

      {/* --- Przebieg konsultacji --- */}
      {decyzja.allowed && konsultacja.status === 'zarezerwowana' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Przebieg</h2>
          {!rozpoczeta ? (
            <p style={{ margin: 0 }}>
              Konsultacja jeszcze się nie zaczęła. Rozliczyć ją można dopiero po godzinie
              rozpoczęcia — lista wypełniona z góry nie jest zapisem tego, co się wydarzyło.
            </p>
          ) : (
            <div className="filtry">
              <form action={odnotujWizyte}>
                <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
                <input type="hidden" name="wynik" value="odbyta" />
                <button type="submit">Odnotuj odbycie</button>
              </form>
              <form action={odnotujWizyte}>
                <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
                <input type="hidden" name="wynik" value="niestawiennictwo" />
                <button type="submit" className="wtorny">
                  Niestawiennictwo
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* --- Notatka --- */}
      {decyzja.allowed && konsultacja.status === 'odbyta' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Wnioski z konsultacji</h2>
          <p className="mala" style={{ marginTop: 0 }}>
            Notatkę piszesz Ty; platforma jej nie generuje ani nie streszcza.
            Uczestnik widzi ją w swoim panelu.
          </p>

          {notatka !== undefined && (
            <div className="notka">
              {notatka.tresc}
              {notatka.zalecenia.length > 0 && (
                <ul className="zwykla" style={{ marginBottom: 0 }}>
                  {notatka.zalecenia.map((zalecenie) => (
                    <li key={zalecenie}>{zalecenie}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form action={zapiszWnioski}>
            <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
            <div className="pytanie">
              <label className="etykieta" htmlFor="tresc">
                Treść
              </label>
              <textarea id="tresc" name="tresc" rows={4} required defaultValue={notatka?.tresc ?? ''} />
            </div>
            <div className="pytanie">
              <label className="etykieta" htmlFor="zalecenia">
                Zalecenia (jedno w wierszu)
              </label>
              <textarea
                id="zalecenia"
                name="zalecenia"
                rows={3}
                defaultValue={(notatka?.zalecenia ?? []).join('\n')}
              />
            </div>
            <div className="akcje">
              <button type="submit">Zapisz wnioski</button>
            </div>
          </form>
        </div>
      )}

      {/* --- Zlecenie badań --- */}
      {decyzja.allowed && konsultacja.status === 'odbyta' && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Zlecenie badań</h2>
          <p className="mala" style={{ marginTop: 0 }}>
            Zakres proponują reguły platformy. Dokument powstaje dopiero po Twoim
            podpisie — propozycji nie da się wydrukować.
          </p>

          {zlecenie === undefined ? (
            <form action={przygotujZlecenie}>
              <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
              <button type="submit">Przygotuj propozycję z reguł</button>
            </form>
          ) : zlecenie.status === 'propozycja' ? (
            <form action={rozpatrzZlecenie}>
              <input type="hidden" name="konsultacjaId" value={konsultacja.id} />
              {zlecenie.pozycje.map((pozycja) => (
                <label className="opcja" key={pozycja.badanie}>
                  <input type="checkbox" name={`poz_${pozycja.badanie}`} defaultChecked />
                  <span>
                    {pozycja.badanie}
                    <span className="mala"> — {pozycja.powod}</span>
                  </span>
                </label>
              ))}

              <div className="pytanie" style={{ marginTop: 12 }}>
                <label className="etykieta" htmlFor="uzasadnienie">
                  Uzasadnienie odrzucenia (wymagane przy odrzuceniu)
                </label>
                <input type="text" id="uzasadnienie" name="uzasadnienie" maxLength={300} />
              </div>

              <div className="filtry">
                <button type="submit" name="decyzja" value="zatwierdz">
                  Podpisz zlecenie
                </button>
                <button type="submit" name="decyzja" value="odrzuc" className="wtorny">
                  Odrzuć propozycję
                </button>
              </div>
            </form>
          ) : zlecenie.status === 'odrzucone' ? (
            <div className="wstrzymane">
              <h3>Propozycja odrzucona</h3>
              <p>{zlecenie.uzasadnienieOdrzucenia}</p>
            </div>
          ) : (
            <Dokument zlecenieId={zlecenie.id} konsultacjaId={konsultacja.id} />
          )}
        </div>
      )}

      <div className="akcje">
        <a className="przycisk wtorny" href="/grafik">
          Wróć do grafiku
        </a>
      </div>
    </>
  );
}

/** Wydruk zlecenia. Bramka jest w pakiecie — tu tylko prezentacja. */
function Dokument({ konsultacjaId }: { zlecenieId: string; konsultacjaId: string }) {
  const zlecenie = pobierzZlecenie(konsultacjaId)!;
  const dokument = dokumentZlecenia(zlecenie);

  return (
    <>
      <div className="notka">
        Zlecenie <strong>{dokument.numer}</strong> podpisane przez {dokument.wystawil}.
      </div>
      <ul className="zwykla">
        {dokument.pozycje.map((badanie) => (
          <li key={badanie}>{badanie}</li>
        ))}
      </ul>
      {zlecenie.usuniete !== undefined && (
        <p className="mala">Usunięto przed podpisem: {zlecenie.usuniete.join(', ')}.</p>
      )}
      <p className="mala" style={{ marginBottom: 0 }}>{dokument.zastrzezenie}</p>
    </>
  );
}
