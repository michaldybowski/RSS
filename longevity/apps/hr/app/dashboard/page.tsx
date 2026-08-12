import { redirect } from 'next/navigation';

import {
  PROG_K,
  type AgeBand,
  type DashboardFilters,
  type DashboardResult,
  type Metric,
} from '@longevity/analytics';

import { biezacaSesja } from '../../lib/aktor.ts';
import { DZIALY, nazwaDzialu, nazwaOrganizacji } from '../../lib/dane.ts';
import { pobierzDashboard } from '../../lib/zapytania.ts';

const METRYKI: readonly { kod: Metric; nazwa: string }[] = [
  { kod: 'uczestnictwo', nazwa: 'Uczestnictwo' },
  { kod: 'rozklad_health_score', nazwa: 'Rozkład wyniku zdrowia' },
  { kod: 'wyzwania', nazwa: 'Wyzwania' },
  { kod: 'frekwencja_warsztatow', nazwa: 'Frekwencja na warsztatach' },
];

const PRZEDZIALY_WIEKU: readonly AgeBand[] = ['18-29', '30-39', '40-49', '50-59', '60+'];

const POWODY: Readonly<Record<string, string>> = {
  grupa_ponizej_progu:
    `Wybrana grupa liczy mniej niż ${PROG_K} osób. Pokazanie wyniku pozwoliłoby ` +
    'powiązać dane z konkretnymi pracownikami.',
  dopelnienie_ponizej_progu:
    'Filtr wyklucza mniej niż dziesięć osób. Wynik dałoby się porównać z całością ' +
    'i wyliczyć dane osób pominiętych.',
  brak_danych_metryki:
    'Zbyt mało osób w tej grupie wypełniło kwestionariusz, żeby pokazać rozkład.',
};

function Wynik({ wynik }: { wynik: DashboardResult }) {
  if (wynik.kind === 'za_malo_danych') {
    return (
      <div className="wstrzymane">
        <h3>Wynik wstrzymany</h3>
        <p>{POWODY[wynik.powod] ?? 'Grupa jest zbyt mała.'}</p>
        <p className="mala" style={{ marginTop: 8 }}>
          Rozszerz zakres — wybierz szerszy dział albo zdejmij część filtrów.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="kafle" style={{ marginBottom: 18 }}>
        <div className="kafel">
          <div className="kafel-etykieta">Liczebność grupy</div>
          <div className="kafel-wartosc">{wynik.liczebnosc}</div>
        </div>
        {wynik.podsumowanie !== undefined && (
          <div className="kafel">
            <div className="kafel-etykieta">Podsumowanie</div>
            <div className="kafel-wartosc" style={{ fontSize: 19 }}>
              {wynik.podsumowanie}
            </div>
          </div>
        )}
      </div>

      {wynik.wartosci.map((band) => (
        <div className="slupek" key={band.etykieta}>
          <div className="slupek-naglowek">
            <span>{band.etykieta}</span>
            <strong>{band.udzialProcent}%</strong>
          </div>
          <div className="slupek-tor">
            <div className="slupek-wypelnienie" style={{ width: `${band.udzialProcent}%` }} />
          </div>
        </div>
      ))}

      <p className="mala" style={{ marginTop: 14 }}>
        Udziały zaokrąglone do pełnych pięciu punktów procentowych, liczebność podana
        jako przedział. Dokładne wartości pozwalałyby odtworzyć liczbę osób.
      </p>
    </>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; unitId?: string; ageBand?: string; sex?: string }>;
}) {
  const [params, sesja] = await Promise.all([searchParams, biezacaSesja()]);
  if (sesja === undefined) redirect('/');

  const metric = (METRYKI.find((m) => m.kod === params.metric)?.kod ?? 'uczestnictwo') as Metric;

  // Parametry z adresu są tekstem od użytkownika — sprawdzamy je wobec listy
  // dopuszczalnych wartości zamiast rzutować. Rzutowanie przepuściłoby
  // dowolny ciąg do zapytania o dane.
  const unitId = DZIALY.find((dzial) => dzial.id === params.unitId)?.id;
  const ageBand = PRZEDZIALY_WIEKU.find((przedzial) => przedzial === params.ageBand);
  const sex = params.sex === 'K' || params.sex === 'M' ? params.sex : undefined;

  const filters: DashboardFilters = {
    ...(unitId !== undefined ? { unitId } : {}),
    ...(ageBand !== undefined ? { ageBand } : {}),
    ...(sex !== undefined ? { sex } : {}),
  };

  const wynik = pobierzDashboard(
    sesja.actor,
    { organizationId: sesja.organizationId, metric, filters },
    new Date().toISOString(),
  );

  return (
    <>
      <header className="strona">
        <h1>Statystyki — {nazwaOrganizacji(sesja.organizationId)}</h1>
        <p>
          {nazwaDzialu(filters.unitId)}
          {filters.ageBand !== undefined ? `, wiek ${filters.ageBand}` : ''}
          {filters.sex !== undefined ? `, ${filters.sex === 'K' ? 'kobiety' : 'mężczyźni'}` : ''}
        </p>
      </header>

      <nav className="glowna">
        {METRYKI.map((pozycja) => {
          // Zmiana metryki zachowuje filtry. Gubienie ich przy przełączaniu
          // zakładki zmuszałoby do ustawiania zakresu od nowa przy każdym
          // spojrzeniu na inną liczbę.
          const adres = new URLSearchParams({ metric: pozycja.kod });
          if (unitId !== undefined) adres.set('unitId', unitId);
          if (ageBand !== undefined) adres.set('ageBand', ageBand);
          if (sex !== undefined) adres.set('sex', sex);

          return (
            <a
              key={pozycja.kod}
              className={pozycja.kod === metric ? 'aktywna' : ''}
              href={`/dashboard?${adres.toString()}`}
            >
              {pozycja.nazwa}
            </a>
          );
        })}
      </nav>

      <form className="karta" method="get">
        <input type="hidden" name="metric" value={metric} />
        <div className="filtry">
          <label className="filtr">
            Dział
            <select name="unitId" defaultValue={params.unitId ?? ''}>
              <option value="">wszystkie</option>
              {DZIALY.map((dzial) => (
                <option key={dzial.id} value={dzial.id}>
                  {dzial.nazwa}
                </option>
              ))}
            </select>
          </label>

          <label className="filtr">
            Wiek
            <select name="ageBand" defaultValue={params.ageBand ?? ''}>
              <option value="">wszystkie</option>
              {PRZEDZIALY_WIEKU.map((przedzial) => (
                <option key={przedzial} value={przedzial}>
                  {przedzial}
                </option>
              ))}
            </select>
          </label>

          <label className="filtr">
            Płeć
            <select name="sex" defaultValue={params.sex ?? ''}>
              <option value="">wszystkie</option>
              <option value="K">kobiety</option>
              <option value="M">mężczyźni</option>
            </select>
          </label>

          <button type="submit">Pokaż</button>
        </div>
      </form>

      <div className="karta">
        <Wynik wynik={wynik} />
      </div>
    </>
  );
}
