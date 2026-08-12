import { redirect } from 'next/navigation';

import { AccessDeniedError } from '@longevity/access';
import { formatPln } from '@longevity/billing';
import {
  rejectedRecords,
  wymagaPotwierdzenia,
  type PodgladZrodla,
  type SourceCode,
} from '@longevity/notion-sync';

import { potwierdzZapowiedz, synchronizuj } from '../../lib/akcje.ts';
import { biezacaSesja } from '../../lib/aktor.ts';
import { OPIS_ZRODLA, OSTATNIA_SYNCHRONIZACJA } from '../../lib/dane.ts';
import { pobierzStanCache, pokazZapowiedz } from '../../lib/operacje.ts';
import { odczytajBlad, pobierzPotwierdzone, pobierzPrzebieg, trybZOpisu } from '../../lib/stan.ts';

const WSZYSTKIE_ZRODLA: readonly SourceCode[] = [
  'filary',
  'biblioteka',
  'wyzwania',
  'partnerzy',
  'cennik',
  'progi_zfss',
];

const OPIS_TRYBU: Readonly<Record<string, string>> = {
  pelna: 'pełna',
  przyrostowa: 'przyrostowa',
};

const OPIS_ZMIANY: Readonly<Record<string, string>> = {
  nowy: 'nowy',
  zmieniony: 'zmieniony',
  zniknal: 'zniknął w Notion',
  odrzucony: 'odrzucony',
};

/**
 * Pola trzymane w groszach. Bez tej mapy zapowiedź pokazywałaby „89000 → 129000",
 * a osoba zatwierdzająca zmianę cennika musiałaby zgadywać, czy patrzy
 * na 890 zł czy na 89 tysięcy. Zatwierdzenie z pamięci to nie zatwierdzenie.
 */
const POLA_KWOTOWE: Readonly<Record<string, readonly string[]>> = {
  cennik: ['cenaNetto'],
  progi_zfss: ['progDochodowy'],
};

function wartosc(source: SourceCode, pole: string, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number' && (POLA_KWOTOWE[source] ?? []).includes(pole)) {
    return formatPln(value);
  }
  if (typeof value === 'string') return value === '' ? '(puste)' : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** „1 strona", „3 strony", „5 stron" — liczebnik po polsku, nie „3 stron". */
function strony(ile: number): string {
  const reszta10 = ile % 10;
  const reszta100 = ile % 100;
  if (ile === 1) return '1 strona';
  if (reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14)) return `${ile} strony`;
  return `${ile} stron`;
}

export default async function Synchronizacja({
  searchParams,
}: {
  searchParams: Promise<{ tryb?: string; zrodla?: string }>;
}) {
  const [{ tryb = 'pelna', zrodla = '' }, sesja] = await Promise.all([searchParams, biezacaSesja()]);
  if (sesja === undefined) redirect('/');

  const wybrane = zrodla.split(',').filter(Boolean) as SourceCode[];
  const mode = trybZOpisu(tryb, OSTATNIA_SYNCHRONIZACJA);

  let podglady: readonly PodgladZrodla[] = [];
  let stanCache: readonly { source: SourceCode; aktywne: number; zarchiwizowane: number }[] = [];
  let odmowa: string | undefined;

  try {
    stanCache = await pobierzStanCache(sesja.actor, WSZYSTKIE_ZRODLA);
    if (wybrane.length > 0) podglady = await pokazZapowiedz(sesja.actor, mode, wybrane);
  } catch (blad) {
    if (!(blad instanceof AccessDeniedError)) throw blad;
    odmowa = blad.message;
  }

  const potwierdzone = pobierzPotwierdzone();
  const doPotwierdzenia = wybrane.filter(
    (source) => wymagaPotwierdzenia(source) && !potwierdzone.includes(source),
  );
  const przebieg = pobierzPrzebieg();
  const blokada = odczytajBlad();

  return (
    <>
      <header className="strona">
        <h1>Synchronizacja Notion</h1>
        <p>
          Kierunek jest jeden: Notion → cache aplikacji. Panel nie zapisuje niczego
          z powrotem do Notion i nie ma na to drogi w kodzie.
        </p>
      </header>

      {odmowa !== undefined && <div className="blad">{odmowa}</div>}
      {blokada !== undefined && <div className="blad">{blokada}</div>}

      {odmowa === undefined && (
        <>
          <form className="karta" method="get">
            <div className="filtry">
              <label className="filtr">
                Tryb
                <select name="tryb" defaultValue={tryb}>
                  <option value="pelna">pełna</option>
                  <option value="przyrostowa">przyrostowa</option>
                </select>
              </label>
              <label className="filtr" style={{ flex: 1 }}>
                Źródła (po przecinku)
                <input type="text" name="zrodla" defaultValue={zrodla} placeholder="cennik,progi_zfss" />
              </label>
              <button type="submit">Pokaż zapowiedź</button>
            </div>
            <p className="mala" style={{ marginBottom: 0 }}>
              Tryb przyrostowy pobiera strony zmienione po {OSTATNIA_SYNCHRONIZACJA.slice(0, 16).replace('T', ' ')} i nie
              archiwizuje niczego — „nie przyszło" znaczy tam „nie zmieniło się".
            </p>
          </form>

          {podglady.map((podglad) => (
            <div className="karta" key={podglad.source}>
              <div className="warsztat-wiersz" style={{ marginBottom: 8 }}>
                <strong style={{ flex: 1 }}>{podglad.label}</strong>
                {podglad.wymagaPotwierdzenia && <span className="znacznik-rezerwa">źródło krytyczne</span>}
              </div>
              <p className="mala" style={{ marginTop: 0 }}>
                Pobrano {strony(podglad.pobrane)} · bez zmian {podglad.bezZmian} · do zapisu{' '}
                {podglad.zmiany.filter((zmiana) => zmiana.rodzaj !== 'odrzucony').length}
                {podglad.zmiany.some((zmiana) => zmiana.rodzaj === 'odrzucony') &&
                  ` · odrzuconych ${podglad.zmiany.filter((zmiana) => zmiana.rodzaj === 'odrzucony').length}`}
                {!podglad.wykrywaZnikniecia && ' · tryb przyrostowy nie wykrywa zniknięć'}
              </p>

              {podglad.zmiany.length === 0 ? (
                <p style={{ margin: 0 }}>Brak różnic — synchronizacja niczego nie zmieni.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>Rekord</th>
                      <th style={{ width: 130 }}>Zmiana</th>
                      <th>Szczegóły</th>
                    </tr>
                  </thead>
                  <tbody>
                    {podglad.zmiany.map((zmiana) => (
                      <tr key={zmiana.notionId}>
                        <td>{zmiana.notionId}</td>
                        <td>{OPIS_ZMIANY[zmiana.rodzaj]}</td>
                        <td>
                          {zmiana.blad !== undefined ? (
                            <span className="powod">{zmiana.blad}</span>
                          ) : zmiana.roznice.length === 0 ? (
                            '—'
                          ) : (
                            <ul className="zwykla" style={{ margin: 0 }}>
                              {zmiana.roznice.map((roznica) => (
                                <li key={roznica.pole}>
                                  {roznica.pole}: {wartosc(podglad.source, roznica.pole, roznica.przed)} →{' '}
                                  <strong>{wartosc(podglad.source, roznica.pole, roznica.po)}</strong>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {wybrane.length > 0 && (
            <div className="karta">
              {doPotwierdzenia.length > 0 && (
                <div className="wstrzymane" style={{ marginBottom: 14 }}>
                  <h3>Zapowiedź wymaga potwierdzenia</h3>
                  <p>
                    Źródła {doPotwierdzenia.map((source) => OPIS_ZRODLA[source]).join(', ')} wpływają
                    na kwoty rozliczeń. Potwierdź, że powyższe różnice są zamierzone.
                  </p>
                  <form action={potwierdzZapowiedz} style={{ marginTop: 10 }}>
                    <input type="hidden" name="zrodla" value={doPotwierdzenia.join(',')} />
                    <button type="submit" className="wtorny">
                      Potwierdzam zapowiedź
                    </button>
                  </form>
                </div>
              )}

              <form action={synchronizuj}>
                <input type="hidden" name="zrodla" value={wybrane.join(',')} />
                <input type="hidden" name="tryb" value={tryb} />
                <button type="submit">Synchronizuj teraz</button>
              </form>
            </div>
          )}

          {przebieg !== undefined && (
            <div className="karta">
              <h2 style={{ marginTop: 0 }}>Ostatni przebieg</h2>
              <p className="mala" style={{ marginTop: 0 }}>
                Tryb {OPIS_TRYBU[przebieg.mode]}, rozpoczęty {przebieg.startedAt.slice(0, 16).replace('T', ' ')}.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Źródło</th>
                    <th>Pobrane</th>
                    <th>Nowe</th>
                    <th>Zmienione</th>
                    <th>Bez zmian</th>
                    <th>Zarchiwizowane</th>
                    <th>Odrzucone</th>
                  </tr>
                </thead>
                <tbody>
                  {przebieg.sources.map((raport) => (
                    <tr key={raport.source}>
                      <td>{OPIS_ZRODLA[raport.source]}</td>
                      <td>{raport.fetched}</td>
                      <td>{raport.created}</td>
                      <td>{raport.updated}</td>
                      <td>{raport.unchanged}</td>
                      <td>{raport.archived}</td>
                      <td>{raport.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {rejectedRecords(przebieg).length > 0 && (
                <>
                  <h3>Rekordy odrzucone</h3>
                  <p className="mala" style={{ marginTop: 0 }}>
                    Zostały w Notion i nie trafiły do cache. Poprawka należy do redakcji —
                    panel nie edytuje treści w Notion.
                  </p>
                  <ul className="zwykla">
                    {rejectedRecords(przebieg).map((wpis) => (
                      <li key={`${wpis.source}-${wpis.notionId}`}>
                        <strong>{wpis.notionId}</strong> ({OPIS_ZRODLA[wpis.source]}) — {wpis.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="karta">
            <h2 style={{ marginTop: 0 }}>Zawartość cache</h2>
            <table>
              <thead>
                <tr>
                  <th>Źródło</th>
                  <th style={{ width: 110 }}>Aktywne</th>
                  <th style={{ width: 150 }}>Zarchiwizowane</th>
                </tr>
              </thead>
              <tbody>
                {stanCache.map((pozycja) => (
                  <tr key={pozycja.source}>
                    <td>{OPIS_ZRODLA[pozycja.source]}</td>
                    <td>{pozycja.aktywne}</td>
                    <td>{pozycja.zarchiwizowane}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mala" style={{ marginBottom: 0 }}>
              Rekordy zarchiwizowane zostają w cache. Usunięcie strony w Notion nie kasuje
              treści powiązanej z historią uczestników.
            </p>
          </div>
        </>
      )}
    </>
  );
}
