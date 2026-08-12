import { redirect } from 'next/navigation';

import { formatPln, LINIE, type Dokument } from '@longevity/billing';

import { biezacaSesja } from '../../lib/aktor.ts';
import { nazwaOrganizacji, OKRES } from '../../lib/dane.ts';
import { pobierzRozliczenia, podsumujPrzebieg } from '../../lib/zapytania.ts';

function Tabela({ dokument }: { dokument: Dokument }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Pozycja</th>
          <th style={{ width: 70 }}>Ilość</th>
          <th style={{ width: 60 }}>VAT</th>
          <th className="kwota" style={{ width: 120 }}>
            Netto
          </th>
          <th className="kwota" style={{ width: 120 }}>
            Brutto
          </th>
        </tr>
      </thead>
      <tbody>
        {dokument.pozycje.map((pozycja) => (
          <tr key={pozycja.kod}>
            <td>{pozycja.nazwa}</td>
            <td>{pozycja.ilosc}</td>
            <td>{pozycja.vat === 'zw' ? 'zw.' : `${pozycja.vat}%`}</td>
            <td className="kwota">{formatPln(pozycja.nettoGr)}</td>
            <td className="kwota">{formatPln(pozycja.bruttoGr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function Rozliczenia() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const wynik = pobierzRozliczenia(sesja.actor, sesja.organizationId);
  const sumy = podsumujPrzebieg(wynik);

  // Noty imienne z linii B trafiają do pracowników. Pracodawca administruje
  // ZFŚS, więc zna kwoty dopłat, ale panel pokazuje je zbiorczo — powiązanie
  // kwoty z nazwiskiem nie jest tu do niczego potrzebne.
  const notyImienne = wynik.dokumenty.filter((dokument) => dokument.typ === 'nota_imienna');
  const pozostale = wynik.dokumenty.filter((dokument) => dokument.typ !== 'nota_imienna');

  const sumaDoplat = notyImienne.reduce(
    (total, nota) => total + (nota.typ === 'nota_imienna' ? nota.doplataGr : 0),
    0,
  );

  return (
    <>
      <header className="strona">
        <h1>
          Rozliczenia — {nazwaOrganizacji(sesja.organizationId)}, okres {OKRES}
        </h1>
        <p>Dokumenty według linii finansowania. Typ dokumentu wynika z podstawy wydatku.</p>
      </header>

      <div className="kafle" style={{ marginBottom: 18 }}>
        {(['A', 'B', 'C'] as const).map((linia) => (
          <div className="kafel" key={linia}>
            <div className="kafel-etykieta">
              Linia {linia} — {LINIE[linia].zrodlo}
            </div>
            <div className="kafel-wartosc">{formatPln(sumy[linia])}</div>
          </div>
        ))}
      </div>

      {wynik.ostrzezenia.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Uwagi do przebiegu</h2>
          {[...new Map(wynik.ostrzezenia.map((o) => [o.komunikat, o])).values()].map((ostrzezenie) => (
            <div className="ostrzezenie-linia" key={ostrzezenie.komunikat}>
              {ostrzezenie.komunikat}
            </div>
          ))}
        </div>
      )}

      {pozostale.map((dokument) => (
        <div className="karta" key={dokument.numer}>
          <h2 style={{ marginTop: 0 }}>
            {dokument.numer}{' '}
            <span className="mala">
              · linia {dokument.linia} · odbiorca: {LINIE[dokument.linia].odbiorca}
            </span>
          </h2>

          {'liczbaUczestnikow' in dokument && (
            <p className="mala">
              Dotyczy {dokument.liczbaUczestnikow} uczestników. Dokument nie zawiera
              listy osób — w tej linii pracodawca otrzymuje wyłącznie liczby.
            </p>
          )}

          <Tabela dokument={dokument} />

          <p className="kwota" style={{ fontWeight: 700, fontSize: 18 }}>
            Razem: {formatPln(dokument.sumaBruttoGr)}
          </p>
        </div>
      ))}

      {notyImienne.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Linia B — dopłaty indywidualne z ZFŚS</h2>
          <p>
            Wystawiono {notyImienne.length} not imiennych na łączną dopłatę{' '}
            <strong>{formatPln(sumaDoplat)}</strong>. Noty trafiają bezpośrednio
            do pracowników.
          </p>
          <div className="notka">
            Panel nie pokazuje powiązania kwoty dopłaty z nazwiskiem. Pracodawca
            administruje funduszem i ma dostęp do not w systemie kadrowo-płacowym;
            zakres tego dostępu jest pytaniem do inspektora ochrony danych,
            nie do panelu programu.
          </div>
        </div>
      )}
    </>
  );
}
