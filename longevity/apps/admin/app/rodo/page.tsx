import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';
import {
  INSTRUKCJE_REALIZACJI,
  opisRodzaju,
  stanWniosku,
  terminRealizacji,
  type WniosekOsoby,
} from '@longevity/gdpr';

import { odnotujRealizacje, przygotujPakiet, usunDane } from '../../lib/akcje.ts';
import { biezacaSesja } from '../../lib/aktor.ts';
import { DZIS, OPIS_LOSU, OPIS_PRAWA } from '../../lib/dane.ts';
import { wnioski as pobierzWnioskiDlaAktora } from '../../lib/operacje.ts';
import { pobierzPakiety, pobierzPotwierdzenia } from '../../lib/stan.ts';

const OPIS_STANU: Readonly<Record<string, string>> = {
  przyjety: 'w terminie',
  zalegly: 'po terminie',
  zrealizowany: 'zrealizowany',
};

function przyciskRealizacji(wniosek: WniosekOsoby) {
  switch (wniosek.prawo) {
    case 'dostep':
    case 'przenoszenie':
      return (
        <form action={przygotujPakiet}>
          <input type="hidden" name="wniosekId" value={wniosek.id} />
          <button type="submit">Przygotuj pakiet do odbioru</button>
        </form>
      );

    case 'usuniecie':
      return (
        <form action={usunDane}>
          <input type="hidden" name="wniosekId" value={wniosek.id} />
          <button type="submit">Wykonaj usunięcie</button>
        </form>
      );

    case 'sprostowanie':
    case 'sprzeciw_wobec_profilowania':
      return (
        <form action={odnotujRealizacje}>
          <input type="hidden" name="wniosekId" value={wniosek.id} />
          <button type="submit" className="wtorny">
            Odnotuj realizację
          </button>
        </form>
      );
  }
}

export default async function Rodo() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  let wnioski: readonly WniosekOsoby[] = [];
  let odmowa: string | undefined;

  try {
    wnioski = pobierzWnioskiDlaAktora(sesja.actor);
  } catch (blad) {
    if (!(blad instanceof AccessDeniedError)) throw blad;
    odmowa = blad.message;
  }

  const pakiety = pobierzPakiety();
  const potwierdzenia = pobierzPotwierdzenia();

  return (
    <>
      <header className="strona">
        <h1>Wnioski osób</h1>
        <p>
          Realizacja wniosku to nie odczyt danych. Panel pokazuje, ile i jakich
          rekordów dotyczy sprawa — treść pakietu otwiera wyłącznie osoba,
          tokenem przekazanym poza panelem.
        </p>
      </header>

      {odmowa !== undefined && <div className="blad">{odmowa}</div>}

      {odmowa === undefined && (
        <>
          {wnioski.map((wniosek) => {
            const stan = stanWniosku(wniosek, DZIS);

            return (
              <div className="karta" key={wniosek.id}>
                <div className="warsztat-wiersz" style={{ marginBottom: 6 }}>
                  <strong style={{ flex: 1 }}>{OPIS_PRAWA[wniosek.prawo]}</strong>
                  <span className={`stan ${stan === 'zalegly' ? 'odwolany' : stan === 'zrealizowany' ? 'po' : 'przed'}`}>
                    {OPIS_STANU[stan]}
                  </span>
                </div>
                <p className="mala" style={{ marginTop: 0 }}>
                  {wniosek.id} · podmiot <strong>{wniosek.subjectRef}</strong> · złożony{' '}
                  {wniosek.zlozony} · termin {terminRealizacji(wniosek)}
                  {wniosek.zrealizowany !== undefined && ` · zrealizowany ${wniosek.zrealizowany}`}
                </p>
                <p style={{ marginTop: 0 }}>{INSTRUKCJE_REALIZACJI[wniosek.prawo]}</p>
                {wniosek.zrealizowany === undefined && przyciskRealizacji(wniosek)}
              </div>
            );
          })}

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Pakiety przygotowane do odbioru</h2>
            <p className="mala" style={{ marginTop: 0 }}>
              Widoczne są metadane, nie zawartość. Pakiet otwiera się tokenem, którego
              panel administratora nie przechowuje.
            </p>
            {pakiety.length === 0 ? (
              <p style={{ margin: 0 }}>Nie przygotowano jeszcze żadnego pakietu.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Wniosek</th>
                    <th>Podmiot</th>
                    <th>Rekordów</th>
                    <th>Rodzaje</th>
                    <th>Rozmiar</th>
                    <th>Suma kontrolna</th>
                  </tr>
                </thead>
                <tbody>
                  {pakiety.map((pakiet) => (
                    <tr key={pakiet.wniosekId}>
                      <td>{pakiet.wniosekId}</td>
                      <td>{pakiet.subjectRef}</td>
                      <td>{pakiet.liczbaRekordow}</td>
                      <td className="mala">
                        {pakiet.rodzaje
                          .map((pozycja) => `${opisRodzaju(pozycja.rodzaj)} ×${pozycja.liczba}`)
                          .join(', ')}
                      </td>
                      <td className="kwota">{pakiet.bajtow} B</td>
                      <td className="mala">{pakiet.sumaKontrolna}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {potwierdzenia.length > 0 && (
            <div className="karta">
              <h2 style={{ marginTop: 0 }}>Potwierdzenia usunięcia</h2>
              {potwierdzenia.map((potwierdzenie) => (
                <div key={potwierdzenie.wniosekId} style={{ marginBottom: 18 }}>
                  <p style={{ marginTop: 0 }}>
                    <strong>{potwierdzenie.subjectRef}</strong> · wniosek {potwierdzenie.wniosekId} ·{' '}
                    {potwierdzenie.zrealizowano}
                  </p>
                  <p className="mala" style={{ marginTop: 0 }}>{potwierdzenie.komunikat}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Rodzaj</th>
                        <th style={{ width: 70 }}>Ile</th>
                        <th style={{ width: 230 }}>Los</th>
                        <th>Podstawa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {potwierdzenie.pozycje.map((pozycja) => (
                        <tr key={pozycja.rodzaj}>
                          <td>{opisRodzaju(pozycja.rodzaj)}</td>
                          <td>{pozycja.liczba}</td>
                          <td>
                            {OPIS_LOSU[pozycja.los]}
                            {pozycja.do !== undefined && <span className="mala"> do {pozycja.do}</span>}
                          </td>
                          <td className="mala">{pozycja.podstawa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
