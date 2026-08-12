import { redirect } from 'next/navigation';

import { can } from '@longevity/access';
import { sprawdzGotowosc, wgESRS } from '@longevity/audit';

import { wydaj, zamknij, zapiszArkusz } from '../../../lib/akcje.ts';
import { biezacaSesja } from '../../../lib/aktor.ts';
import { nazwaOrganizacji, OCENY, OPIS_POZIOMU, SCHEMAT } from '../../../lib/dane.ts';
import { pobierzAudyt, pobierzCertyfikaty, pobierzUstalenia } from '../../../lib/stan.ts';

export default async function Arkusz({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sesja] = await Promise.all([params, biezacaSesja()]);
  if (sesja === undefined) redirect('/');

  const audyt = pobierzAudyt(id);
  if (audyt === undefined) redirect('/audyty');

  // Decyzja podejmowana raz i tu — a nie powtarzana przy każdym przycisku.
  const decyzja = can(sesja.actor, 'zapis_audytu', {
    kind: 'audyt',
    organizationId: audyt.organizationId,
    auditorId: audyt.audytorId,
  });

  const ustalenia = pobierzUstalenia();
  const gotowosc = sprawdzGotowosc(SCHEMAT, audyt, ustalenia);
  const wgKryterium = new Map(
    ustalenia.filter((u) => u.audytId === audyt.id).map((u) => [u.kryteriumId, u]),
  );
  const zamkniety = audyt.status === 'zamkniety';
  const certyfikat = pobierzCertyfikaty().find((pozycja) => pozycja.audytId === audyt.id);
  const tylkoOdczyt = !decyzja.allowed || zamkniety;

  return (
    <>
      <header className="strona">
        <h1>{nazwaOrganizacji(audyt.organizationId)}</h1>
        <p>
          Audyt {audyt.id} · schemat {SCHEMAT.nazwa} {audyt.schematWersja} ·{' '}
          {zamkniety ? `zamknięty ${audyt.zamkniety?.slice(0, 10)}` : 'w toku'}
        </p>
      </header>

      {!decyzja.allowed && (
        <div className="blad">
          {decyzja.reason} Arkusz jest widoczny w trybie odczytu — ustaleń nie zapiszesz.
        </div>
      )}

      <div className="karta">
        <div className="warsztat-wiersz" style={{ marginBottom: 12 }}>
          <strong style={{ flex: 1, fontSize: 22 }}>{gotowosc.wynik.wynikProcent}%</strong>
          <span className={`poziom ${gotowosc.wynik.poziom}`}>
            {OPIS_POZIOMU[gotowosc.wynik.poziom]}
          </span>
        </div>

        {gotowosc.wynik.domeny.map((domena) => (
          <div className="domena-wynik" key={domena.kod}>
            <span>
              {domena.nazwa}
              {domena.pominietych > 0 && (
                <span className="mala"> · {domena.pominietych} nie dotyczy</span>
              )}
            </span>
            <strong>{domena.ocenionych === 0 ? '—' : `${domena.wynikProcent}%`}</strong>
          </div>
        ))}

        {!gotowosc.gotowy && (
          <div className="wstrzymane" style={{ marginTop: 14 }}>
            <h3>Audyt nie jest gotowy do zamknięcia</h3>
            <ul className="zwykla">
              {gotowosc.brakujace.map((pozycja) => (
                <li key={`${pozycja.kryterium.id}-${pozycja.powod}`}>
                  {pozycja.kryterium.tresc} —{' '}
                  {pozycja.powod === 'brak_oceny' ? 'brak oceny' : 'ocena pozytywna bez dowodu'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {gotowosc.gotowy && !zamkniety && decyzja.allowed && (
          <form action={zamknij} style={{ marginTop: 14 }}>
            <input type="hidden" name="audytId" value={audyt.id} />
            <button type="submit">Zamknij audyt</button>
          </form>
        )}

        {zamkniety && certyfikat === undefined && gotowosc.wynik.poziom !== 'brak' && (
          <form action={wydaj} style={{ marginTop: 14 }}>
            <input type="hidden" name="audytId" value={audyt.id} />
            <button type="submit">Wydaj certyfikat</button>
          </form>
        )}

        {zamkniety && gotowosc.wynik.poziom === 'brak' && (
          <div className="wstrzymane" style={{ marginTop: 14 }}>
            <h3>Wynik poniżej progu certyfikacji</h3>
            <p>
              Audyt jest zamknięty, ale wynik {gotowosc.wynik.wynikProcent}% nie uprawnia
              do certyfikatu. Zakład otrzymuje raport z ustaleniami i może przystąpić
              do ponownego audytu.
            </p>
          </div>
        )}

        {certyfikat !== undefined && (
          <div className="notka" style={{ marginTop: 14 }}>
            Wydano certyfikat <strong>{certyfikat.numer}</strong>, poziom{' '}
            {OPIS_POZIOMU[certyfikat.poziom]}, ważny do {certyfikat.waznyDo}.
          </div>
        )}
      </div>

      <form action={zapiszArkusz}>
        <input type="hidden" name="audytId" value={audyt.id} />

        {SCHEMAT.domeny.map((domena) => (
          <div className="karta" key={domena.kod}>
            <h2 style={{ marginTop: 0 }}>
              {domena.nazwa} <span className="kryterium-waga">waga {domena.waga}</span>
            </h2>

            {SCHEMAT.kryteria
              .filter((kryterium) => kryterium.domenaKod === domena.kod)
              .map((kryterium) => {
                const ustalenie = wgKryterium.get(kryterium.id);
                const pozytywna =
                  ustalenie?.ocena === 'spelnione' || ustalenie?.ocena === 'czesciowo';
                const brakDowodu =
                  kryterium.dowodWymagany && pozytywna && ustalenie?.dowodKey === undefined;

                return (
                  <div className="kryterium" key={kryterium.id}>
                    <div className="kryterium-naglowek">
                      <span className="kryterium-tresc">{kryterium.tresc}</span>
                      <span className="kryterium-waga">waga {kryterium.waga}</span>
                      {kryterium.wskaznikESRS !== undefined && (
                        <span className="esrs">{kryterium.wskaznikESRS}</span>
                      )}
                    </div>

                    <div className="oceny">
                      {OCENY.map((ocena) => (
                        <label key={ocena.wartosc}>
                          <input
                            type="radio"
                            name={`oc_${kryterium.id}`}
                            value={ocena.wartosc}
                            defaultChecked={ustalenie?.ocena === ocena.wartosc}
                            disabled={tylkoOdczyt}
                          />
                          {ocena.etykieta}
                        </label>
                      ))}
                    </div>

                    {kryterium.dowodWymagany && (
                      <label className={`dowod${brakDowodu ? ' wymagany' : ''}`}>
                        <input
                          type="checkbox"
                          name={`dw_${kryterium.id}`}
                          defaultChecked={ustalenie?.dowodKey !== undefined}
                          disabled={tylkoOdczyt}
                        />
                        {brakDowodu
                          ? 'Dowód wymagany — ocena pozytywna bez załącznika nie zamknie audytu'
                          : 'Dowód załączony'}
                      </label>
                    )}

                    <input
                      type="text"
                      name={`uw_${kryterium.id}`}
                      placeholder="Uwaga audytora (opcjonalnie)"
                      defaultValue={ustalenie?.uwaga ?? ''}
                      maxLength={300}
                      disabled={tylkoOdczyt}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                );
              })}
          </div>
        ))}

        {!tylkoOdczyt && (
          <div className="akcje">
            <button type="submit">Zapisz ustalenia</button>
          </div>
        )}
      </form>

      {gotowosc.wynik.bezOceny.length < SCHEMAT.kryteria.length && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Mapowanie na ESRS S1</h2>
          <p className="mala">
            Zestawienie wejściowe do sprawozdawczości CSRD. Kryteria bez przypisanego
            wskaźnika i oznaczone jako „nie dotyczy" są pomijane.
          </p>
          <table>
            <thead>
              <tr>
                <th>Wskaźnik</th>
                <th style={{ width: 140 }}>Spełnione</th>
              </tr>
            </thead>
            <tbody>
              {wgESRS(SCHEMAT, ustalenia.filter((u) => u.audytId === audyt.id)).map((pozycja) => (
                <tr key={pozycja.wskaznik}>
                  <td>{pozycja.wskaznik}</td>
                  <td>
                    {pozycja.spelnione} z {pozycja.wszystkie}
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
