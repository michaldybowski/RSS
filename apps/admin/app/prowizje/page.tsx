import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';
import { formatPln } from '@longevity/billing';
import type { PodsumowanieProwizji } from '@longevity/marketplace';

import { biezacaSesja } from '../../lib/aktor.ts';
import { OKRES_PROWIZJI, VAT_PROWIZJI } from '../../lib/dane.ts';
import { prowizje } from '../../lib/operacje.ts';

/** „1 pozycja", „2 pozycje", „5 pozycji" — liczebnik po polsku. */
function pozycje(ile: number): string {
  const reszta10 = ile % 10;
  const reszta100 = ile % 100;
  if (ile === 1) return '1 pozycja';
  if (reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14)) return `${ile} pozycje`;
  return `${ile} pozycji`;
}

export default async function Prowizje() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  let podsumowanie: PodsumowanieProwizji | undefined;
  let odmowa: string | undefined;

  try {
    podsumowanie = prowizje(sesja.actor, OKRES_PROWIZJI);
  } catch (blad) {
    if (!(blad instanceof AccessDeniedError)) throw blad;
    odmowa = blad.message;
  }

  return (
    <>
      <header className="strona">
        <h1>Prowizje marketplace</h1>
        <p>
          Linia M — faktury prowizyjne dla partnerów za okres {OKRES_PROWIZJI}. Odbiorcą
          jest partner, nie pracodawca i nie uczestnik.
        </p>
      </header>

      {odmowa !== undefined && <div className="blad">{odmowa}</div>}

      {podsumowanie !== undefined && (
        <>
          <div className="karta">
            <div className="kafle">
              <div className="kafel">
                <div className="kafel-etykieta">Faktur do wystawienia</div>
                <div className="kafel-wartosc">{podsumowanie.faktury.length}</div>
              </div>
              <div className="kafel">
                <div className="kafel-etykieta">Prowizja netto</div>
                <div className="kafel-wartosc">{formatPln(podsumowanie.lacznieNettoGr)}</div>
              </div>
              <div className="kafel">
                <div className="kafel-etykieta">Brutto</div>
                <div className="kafel-wartosc">{formatPln(podsumowanie.lacznieBruttoGr)}</div>
              </div>
            </div>
            <p className="mala" style={{ marginBottom: 0 }}>
              Stawka VAT usługi pośrednictwa: {VAT_PROWIZJI}%. Jest parametrem
              księgowym, tak samo jak stawki w cenniku — nie stałą w kodzie.
            </p>
          </div>

          {podsumowanie.faktury.map((faktura) => (
            <div className="karta" key={faktura.partnerId}>
              <div className="warsztat-wiersz" style={{ marginBottom: 8 }}>
                <strong style={{ flex: 1, fontSize: 18 }}>{faktura.partnerNazwa}</strong>
                <span className="mala">
                  {pozycje(faktura.pozycje.length)} · pominięto {faktura.pominietych}
                </span>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Zamówienie</th>
                    <th style={{ width: 140 }}>Podstawa netto</th>
                    <th style={{ width: 90 }}>Stawka</th>
                    <th style={{ width: 130 }}>Prowizja</th>
                  </tr>
                </thead>
                <tbody>
                  {faktura.pozycje.map((pozycja) => (
                    <tr key={pozycja.zamowienieId}>
                      <td>{pozycja.zamowienieId}</td>
                      <td className="kwota">{formatPln(pozycja.podstawaNettoGr)}</td>
                      <td>{pozycja.prowizjaPct}%</td>
                      <td className="kwota">{formatPln(pozycja.prowizjaGr)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Netto</th>
                    <td className="kwota">{formatPln(faktura.nettoGr)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>VAT {faktura.stawkaVat}%</th>
                    <td className="kwota">{formatPln(faktura.vatGr)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>Brutto</th>
                    <td className="kwota">
                      <strong>{formatPln(faktura.bruttoGr)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>

              <p className="mala" style={{ marginBottom: 0 }}>
                Zestawienie nie zawiera uczestników. Prowizja należy się za zamówienia
                zrealizowane — złożone i anulowane są pominięte.
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
