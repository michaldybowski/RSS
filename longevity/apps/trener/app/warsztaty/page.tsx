import { redirect } from 'next/navigation';

import { frekwencja, obloznosc } from '@longevity/workshops';

import { biezacaSesja } from '../../lib/aktor.ts';
import { stanWarsztatu } from '../../lib/stanWarsztatu.ts';
import { TERAZ, WARSZTATY } from '../../lib/dane.ts';
import { pobierzObecnosci, pobierzZapisy } from '../../lib/stan.ts';

function data(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

export default async function Warsztaty() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  // Filtrowanie po prowadzącym jest tu wygodą wyświetlania. Właściwa kontrola
  // jest w pakiecie: próba otwarcia cudzego warsztatu po adresie kończy się
  // odmową, a nie pustą listą.
  const moje = WARSZTATY.filter((warsztat) => warsztat.trenerId === sesja.trenerId);
  const zapisy = pobierzZapisy().zapisy;
  const obecnosci = pobierzObecnosci();

  return (
    <>
      <header className="strona">
        <h1>Moje warsztaty</h1>
        <p>Okres wrzesień 2026. Obecność można odnotować dopiero po rozpoczęciu zajęć.</p>
      </header>

      {moje.map((warsztat) => {
        const stan = stanWarsztatu(warsztat, TERAZ);
        const zajete = obloznosc(warsztat, zapisy);
        const wynik = frekwencja(warsztat, zapisy, obecnosci);
        const odnotowano = wynik.obecnych + wynik.nieobecnych > 0;

        return (
          <div className="karta" key={warsztat.id}>
            <div className="warsztat-wiersz">
              <span className="data">{data(warsztat.start)}</span>
              <strong style={{ flex: 1 }}>{warsztat.temat}</strong>
              <span className={`stan ${stan.kod}`}>{stan.opis}</span>
            </div>

            <p className="mala" style={{ margin: '10px 0 0' }}>
              Zapisanych {zajete.zapisani} z {zajete.miejsc} miejsc
              {zajete.naLiscieRezerwowej > 0 && `, na liście rezerwowej ${zajete.naLiscieRezerwowej}`}
              {odnotowano && ` · obecnych ${wynik.obecnych}, frekwencja ${wynik.udzialProcent}%`}
              {!odnotowano && stan.kod === 'po' && ' · lista obecności nieodnotowana'}
            </p>

            <div className="akcje" style={{ marginTop: 14 }}>
              {stan.kod === 'odwolany' ? (
                <span className="mala">Warsztat odwołany — zapisy zachowane do powiadomienia.</span>
              ) : (
                <a className={stan.kod === 'przed' ? 'przycisk wtorny' : 'przycisk'} href={`/warsztaty/${warsztat.id}`}>
                  {stan.kod === 'przed' ? 'Zobacz listę zapisanych' : 'Lista obecności'}
                </a>
              )}
            </div>
          </div>
        );
      })}

      {moje.length === 0 && (
        <div className="karta">
          <p style={{ margin: 0 }}>Brak warsztatów w tym okresie.</p>
        </div>
      )}
    </>
  );
}
