import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';
import { frekwencja, listaDlaTrenera, obloznosc } from '@longevity/workshops';

import { zapiszListeObecnosci } from '../../../lib/akcje.ts';
import { biezacaSesja } from '../../../lib/aktor.ts';
import { OSOBY, TERAZ, warsztatPoId } from '../../../lib/dane.ts';
import { pobierzObecnosci, pobierzPoprawki, pobierzZapisy } from '../../../lib/stan.ts';
import { stanWarsztatu } from '../../../lib/stanWarsztatu.ts';

export default async function ListaObecnosci({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sesja] = await Promise.all([params, biezacaSesja()]);
  if (sesja === undefined) redirect('/');

  const warsztat = warsztatPoId(id);
  if (warsztat === undefined) redirect('/warsztaty');

  const zapisy = pobierzZapisy().zapisy;
  const obecnosci = pobierzObecnosci();

  // Uprawnienie sprawdzane przy pobieraniu listy, nie przy rysowaniu widoku.
  // Cudzy warsztat kończy się komunikatem o odmowie, nie pustą tabelą.
  let lista;
  try {
    lista = listaDlaTrenera(sesja.actor, warsztat, zapisy, OSOBY, obecnosci);
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    return (
      <>
        <header className="strona">
          <h1>Brak dostępu</h1>
        </header>
        <div className="karta">
          <div className="blad" style={{ marginBottom: 0 }}>
            {error.message}
          </div>
        </div>
      </>
    );
  }

  const stan = stanWarsztatu(warsztat, TERAZ);
  const przedStartem = stan.kod === 'przed';
  const zajete = obloznosc(warsztat, zapisy);
  const wynik = frekwencja(warsztat, zapisy, obecnosci);
  const poprawki = pobierzPoprawki(warsztat.id);

  return (
    <>
      <header className="strona">
        <h1>{warsztat.temat}</h1>
        <p>
          {warsztat.start.replace('T', ' ').slice(0, 16)} · zapisanych {zajete.zapisani} z{' '}
          {zajete.miejsc}
          {zajete.naLiscieRezerwowej > 0 && ` · rezerwa ${zajete.naLiscieRezerwowej}`}
        </p>
      </header>

      {przedStartem && (
        <div className="wstrzymane" style={{ marginBottom: 16 }}>
          <h3>Obecność będzie dostępna po rozpoczęciu</h3>
          <p>
            Lista wypełniona przed zajęciami nie jest listą obecności, tylko listą
            zapisów. Odnotujesz obecność od godziny {warsztat.start.slice(11, 16)}.
          </p>
        </div>
      )}

      <form action={zapiszListeObecnosci}>
        <input type="hidden" name="warsztatId" value={warsztat.id} />

        <div className="karta">
          <ul className="lista-obecnosci">
            {lista.map((pozycja) => (
              <li key={pozycja.participantId}>
                <span className="osoba">
                  <span className="osoba-etykieta">{pozycja.etykieta}</span>{' '}
                  <span className="osoba-kod">#{pozycja.kod}</span>
                  {pozycja.status === 'lista_rezerwowa' && (
                    <span className="znacznik-rezerwa" style={{ marginLeft: 8 }}>
                      rezerwa
                    </span>
                  )}
                </span>

                <span className="wybor-obecnosci">
                  <label>
                    <input
                      type="radio"
                      name={`ob_${pozycja.participantId}`}
                      value="obecny"
                      defaultChecked={pozycja.obecny === true}
                      disabled={przedStartem}
                    />
                    obecny
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`ob_${pozycja.participantId}`}
                      value="nieobecny"
                      defaultChecked={pozycja.obecny === false}
                      disabled={przedStartem}
                    />
                    nieobecny
                  </label>
                </span>
              </li>
            ))}
          </ul>

          {!przedStartem && (
            <div className="akcje">
              <button type="submit">Zapisz listę obecności</button>
              <span className="mala">
                Odnotowano {wynik.obecnych + wynik.nieobecnych} z {zajete.zapisani}
                {wynik.bezOdnotowania > 0 && ` · bez odpowiedzi ${wynik.bezOdnotowania}`}
              </span>
            </div>
          )}
        </div>
      </form>

      {poprawki.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Poprawki</h2>
          <p className="mala">
            Zmiana raz odnotowanej obecności zostaje w rejestrze. Nie chodzi o kontrolę
            trenera, tylko o to, żeby dało się odtworzyć, na jakiej podstawie policzono
            rozliczenie i frekwencję.
          </p>
          <ul className="zwykla">
            {poprawki.map((wpis, index) => (
              <li key={`${wpis.participantId}-${index}`}>
                Zmieniono odpowiedź dla #{wpis.participantId.slice(-4).toUpperCase()} ·{' '}
                {wpis.at.replace('T', ' ').slice(0, 16)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
