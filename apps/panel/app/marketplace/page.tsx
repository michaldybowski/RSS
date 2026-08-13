import {
  katalogOfert,
  KATEGORIE,
  OPIS_KATEGORII,
  ostrzezeniaOferty,
  type KategoriaPartnera,
} from '@longevity/marketplace';
import { formatPln } from '@longevity/billing';

import { zamowUsluge } from '../../lib/actions.ts';
import { OFERTY, PARTNERZY } from '../../lib/marketplace.ts';
import { getSession } from '../../lib/session.ts';
import { PAKIET_UCZESTNIKA } from '../../lib/wyzwania.ts';

const OPIS_STATUSU: Readonly<Record<string, string>> = {
  zlozone: 'złożone',
  zrealizowane: 'zrealizowane',
  anulowane: 'anulowane',
};

export default async function Marketplace({
  searchParams,
}: {
  searchParams: Promise<{ kategoria?: string }>;
}) {
  const [{ kategoria = '' }, session] = await Promise.all([searchParams, getSession()]);

  const wybrana = KATEGORIE.includes(kategoria as KategoriaPartnera)
    ? (kategoria as KategoriaPartnera)
    : undefined;

  const katalog = katalogOfert(OFERTY, PARTNERZY, {
    pakiet: PAKIET_UCZESTNIKA,
    ...(wybrana !== undefined ? { kategoria: wybrana } : {}),
  });

  const zamowione = new Set(session.zamowienia.map((zamowienie) => zamowienie.ofertaId));

  return (
    <>
      <header className="strona">
        <h1>Marketplace</h1>
        <p>
          Oferty partnerów programu. Katalog <strong>nie jest dobierany</strong> na
          podstawie Twoich wyników — kolejność zależy od kategorii i nazwy, nie od
          tego, co pokazała ocena zdrowia. Przy każdej ofercie widzisz, ile program
          zarabia na transakcji.
        </p>
      </header>

      <form className="karta" method="get">
        <div className="filtry">
          <label className="filtr" style={{ flex: 1 }}>
            Kategoria
            <select name="kategoria" defaultValue={kategoria}>
              <option value="">wszystkie</option>
              {KATEGORIE.map((pozycja) => (
                <option key={pozycja} value={pozycja}>
                  {OPIS_KATEGORII[pozycja]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Pokaż</button>
        </div>
      </form>

      {session.zamowienia.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Twoje zamówienia</h2>
          <table>
            <thead>
              <tr>
                <th>Oferta</th>
                <th style={{ width: 130 }}>Kwota netto</th>
                <th style={{ width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {session.zamowienia.map((zamowienie) => (
                <tr key={zamowienie.id}>
                  <td>
                    {OFERTY.find((oferta) => oferta.id === zamowienie.ofertaId)?.nazwa ??
                      zamowienie.ofertaId}
                  </td>
                  <td className="kwota">{formatPln(zamowienie.kwotaNettoGr)}</td>
                  <td>{OPIS_STATUSU[zamowienie.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mala" style={{ marginBottom: 0 }}>
            Partner dostaje kod odbioru i przedmiot zamówienia. Nie otrzymuje Twojego
            nazwiska, pracodawcy ani niczego z oceny zdrowia.
          </p>
        </div>
      )}

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>
          Oferty <span className="mala">({katalog.length})</span>
        </h2>

        {katalog.length === 0 ? (
          <p style={{ margin: 0 }}>Brak ofert w tej kategorii.</p>
        ) : (
          katalog.map(({ oferta, partner, ujawnienieProwizji }) => {
            const uwagi =
              session.assessment === undefined ? [] : ostrzezeniaOferty(oferta, session.assessment);

            return (
              <div className="wyzwanie" key={oferta.id}>
                <div className="wyzwanie-naglowek">
                  <span className="wyzwanie-nazwa">{oferta.nazwa}</span>
                  <span className="znacznik">{OPIS_KATEGORII[partner.kategoria]}</span>
                  <span className="mala kwota">{formatPln(oferta.cenaNettoGr)} netto</span>
                </div>
                <p className="mala" style={{ margin: '4px 0 8px' }}>
                  {partner.nazwa} · VAT {oferta.stawkaVat === 'zw' ? 'zwolniony' : `${oferta.stawkaVat}%`}
                </p>
                <p style={{ marginTop: 0 }}>{oferta.opis}</p>

                {uwagi.map((uwaga) => (
                  // Ostrzeżenie, nie ukrycie oferty: ocena może ograniczyć,
                  // nigdy podbić sprzedaży.
                  <div className="wstrzymane" key={uwaga.kod}>
                    <h3>Zanim skorzystasz</h3>
                    <p>{uwaga.tresc}</p>
                  </div>
                ))}

                <p className="mala">{ujawnienieProwizji}</p>

                {zamowione.has(oferta.id) ? (
                  <p className="mala" style={{ marginBottom: 0 }}>
                    <strong>Zamówione.</strong> Kod odbioru znajdziesz w zestawieniu powyżej.
                  </p>
                ) : (
                  <form action={zamowUsluge}>
                    <input type="hidden" name="ofertaId" value={oferta.id} />
                    <button type="submit">Zamów</button>
                  </form>
                )}
              </div>
            );
          })
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
