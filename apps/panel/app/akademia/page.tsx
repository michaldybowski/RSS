import { dostepneSciezki, postepSciezki, type StanModulu } from '@longevity/academy';

import { odbierzZaswiadczenie } from '../../lib/actions.ts';
import { MATERIALY, SCIEZKI } from '../../lib/akademia.ts';
import { MODUL, odmiana } from '../../lib/format.ts';
import { getSession } from '../../lib/session.ts';
import { PAKIET_UCZESTNIKA } from '../../lib/wyzwania.ts';

const OPIS_STANU: Readonly<Record<StanModulu, string>> = {
  zaliczony: 'zaliczony',
  otwarty: 'do zrobienia',
  zablokowany: 'po poprzednim module',
  niedostepny: 'materiał wycofany — moduł pominięty',
};

export default async function Akademia() {
  const session = await getSession();
  const sciezki = dostepneSciezki(SCIEZKI, PAKIET_UCZESTNIKA);

  return (
    <>
      <header className="strona">
        <h1>Akademia</h1>
        <p>
          Ścieżki złożone z materiałów biblioteki. Moduł otwiera się po zaliczeniu
          poprzedniego; materiał wycofany przez redakcję jest pomijany i nie blokuje
          ukończenia.
        </p>
      </header>

      {sciezki.map((sciezka) => {
        const postep = postepSciezki(sciezka, MATERIALY, session.zaliczenia);
        const zaswiadczenie = session.zaswiadczenia.find(
          (pozycja) => pozycja.sciezkaId === sciezka.id,
        );

        return (
          <div className="karta" key={sciezka.id}>
            <div className="wyzwanie-naglowek">
              <span className="wyzwanie-nazwa" style={{ fontSize: 18 }}>
                {sciezka.nazwa}
              </span>
              <span className="mala">
                {postep.procent}% · {postep.minutyNauki} min nauki
              </span>
            </div>
            <p className="mala" style={{ marginTop: 0 }}>{sciezka.opis}</p>

            <div className="postep">
              <div className="postep-tor">
                <div className="postep-wypelnienie" style={{ width: `${postep.procent}%` }} />
              </div>
            </div>

            <ul className="moduly">
              {postep.pozycje.map((pozycja, index) => (
                <li key={pozycja.modul.materialId} className={`modul ${pozycja.stan}`}>
                  <span className="modul-numer">{index + 1}</span>
                  <span className="modul-tresc">
                    <strong>{pozycja.material?.tytul ?? 'Materiał niedostępny'}</strong>
                    <span className="mala">
                      {' '}
                      — {OPIS_STANU[pozycja.stan]}
                      {!pozycja.modul.obowiazkowy && pozycja.stan !== 'niedostepny' && ' · dodatkowy'}
                      {pozycja.zaliczenie?.sposob === 'quiz' &&
                        ` · sprawdzian ${pozycja.zaliczenie.wynikProcent}%`}
                      {pozycja.zaliczenie?.sposob === 'deklaracja' && ' · deklaracja'}
                    </span>
                  </span>
                  {pozycja.stan === 'otwarty' && pozycja.material !== undefined && (
                    <a className="przycisk wtorny" href={`/biblioteka/${pozycja.material.id}`}>
                      Otwórz
                    </a>
                  )}
                </li>
              ))}
            </ul>

            {postep.pominietych > 0 && (
              <p className="mala">
                Pominięto {odmiana(postep.pominietych, MODUL)} z materiałem wycofanym
                przez redakcję. Ścieżka pozostaje możliwa do ukończenia.
              </p>
            )}

            {zaswiadczenie !== undefined ? (
              <div className="notka">
                Zaświadczenie <strong>{zaswiadczenie.numer}</strong> z {zaswiadczenie.wydane} ·{' '}
                {zaswiadczenie.minutyNauki} minut nauki. Dokument należy do Ciebie —
                pracodawca widzi wyłącznie zestawienia zbiorcze.
              </div>
            ) : postep.ukonczona ? (
              <form action={odbierzZaswiadczenie}>
                <input type="hidden" name="sciezkaId" value={sciezka.id} />
                <button type="submit">Odbierz zaświadczenie</button>
              </form>
            ) : (
              <p className="mala" style={{ marginBottom: 0 }}>
                Do ukończenia zostało{' '}
                {odmiana(postep.wymaganych - postep.zaliczonychObowiazkowych, MODUL)}{' '}
                obowiązkowych.
              </p>
            )}
          </div>
        );
      })}

      <div className="akcje">
        <a className="przycisk wtorny" href="/biblioteka">
          Wróć do biblioteki
        </a>
      </div>
    </>
  );
}
