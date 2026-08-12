/**
 * Budowa widoku dashboardu HR.
 *
 * Wejściem są rekordy uczestników jednej organizacji, wyjściem — wyłącznie
 * agregaty. Nic w typie wyniku nie pozwala przekazać identyfikatora osoby,
 * a test to sprawdza na serializacji.
 */

import { bandSize, checkGroup, PROG_K, roundShare } from './anonymity.ts';
import type {
  Band,
  DashboardFilters,
  DashboardQuery,
  DashboardResult,
  ParticipantRecord,
} from './types.ts';

export interface DashboardOptions {
  prog?: number;
}

function matches(record: ParticipantRecord, filters: DashboardFilters): boolean {
  if (filters.unitId !== undefined && record.unitId !== filters.unitId) return false;
  if (filters.ageBand !== undefined && record.ageBand !== filters.ageBand) return false;
  if (filters.sex !== undefined && record.sex !== filters.sex) return false;
  return true;
}

export function buildDashboard(
  records: readonly ParticipantRecord[],
  query: DashboardQuery,
  options: DashboardOptions = {},
): DashboardResult {
  const prog = options.prog ?? PROG_K;

  const wOrganizacji = records.filter((record) => record.organizationId === query.organizationId);
  const filters = query.filters ?? {};
  const grupa = wOrganizacji.filter((record) => matches(record, filters));

  const kontrola = checkGroup(grupa.length, wOrganizacji.length, prog);
  if (kontrola.suppressed) {
    return { kind: 'za_malo_danych', powod: kontrola.powod, prog };
  }

  switch (query.metric) {
    case 'uczestnictwo':
      return uczestnictwo(grupa, prog);
    case 'rozklad_health_score':
      return rozkladHealthScore(grupa, prog);
    case 'wyzwania':
      return wyzwania(grupa, prog);
    case 'frekwencja_warsztatow':
      return frekwencja(grupa, prog);
  }
}

function wynik(
  metric: DashboardQuery['metric'],
  grupa: readonly ParticipantRecord[],
  wartosci: readonly Band[],
  prog: number,
  podsumowanie?: string,
): DashboardResult {
  return {
    kind: 'wynik',
    metric,
    liczebnosc: bandSize(grupa.length, prog),
    wartosci,
    ...(podsumowanie !== undefined ? { podsumowanie } : {}),
  };
}

function uczestnictwo(grupa: readonly ParticipantRecord[], prog: number): DashboardResult {
  const aktywni = grupa.filter((record) => record.active).length;

  return wynik(
    'uczestnictwo',
    grupa,
    [
      { etykieta: 'aktywni', udzialProcent: roundShare(aktywni, grupa.length) },
      { etykieta: 'nieaktywni', udzialProcent: roundShare(grupa.length - aktywni, grupa.length) },
    ],
    prog,
    `${roundShare(aktywni, grupa.length)}% uczestników aktywnych`,
  );
}

const PRZEDZIALY_SCORE: readonly { etykieta: string; od: number; do: number }[] = [
  { etykieta: '0-39', od: 0, do: 39 },
  { etykieta: '40-59', od: 40, do: 59 },
  { etykieta: '60-79', od: 60, do: 79 },
  { etykieta: '80-100', od: 80, do: 100 },
];

function rozkladHealthScore(grupa: readonly ParticipantRecord[], prog: number): DashboardResult {
  const zWynikiem = grupa.filter((record) => record.healthScore !== undefined);

  // Osoby bez wyniku muszą być odjęte przed sprawdzeniem progu — inaczej
  // grupa 12-osobowa, w której wynik ma dwoje, przeszłaby kontrolę.
  if (zWynikiem.length < prog) {
    return { kind: 'za_malo_danych', powod: 'brak_danych_metryki', prog };
  }

  const wartosci = PRZEDZIALY_SCORE.map((przedzial) => ({
    etykieta: przedzial.etykieta,
    udzialProcent: roundShare(
      zWynikiem.filter(
        (record) => record.healthScore! >= przedzial.od && record.healthScore! <= przedzial.do,
      ).length,
      zWynikiem.length,
    ),
  }));

  return wynik('rozklad_health_score', zWynikiem, wartosci, prog);
}

function wyzwania(grupa: readonly ParticipantRecord[], prog: number): DashboardResult {
  const ukonczylo = grupa.filter((record) => record.challengesCompleted > 0).length;
  const suma = grupa.reduce((total, record) => total + record.challengesCompleted, 0);
  const srednia = Math.round((suma / grupa.length) * 10) / 10;

  return wynik(
    'wyzwania',
    grupa,
    [
      { etykieta: 'ukończyli co najmniej jedno', udzialProcent: roundShare(ukonczylo, grupa.length) },
      {
        etykieta: 'bez ukończonych',
        udzialProcent: roundShare(grupa.length - ukonczylo, grupa.length),
      },
    ],
    prog,
    `średnio ${srednia} ukończonych wyzwań na osobę`,
  );
}

function frekwencja(grupa: readonly ParticipantRecord[], prog: number): DashboardResult {
  const oferowane = grupa.reduce((total, record) => total + record.workshopsOffered, 0);
  const obecnosci = grupa.reduce((total, record) => total + record.workshopsAttended, 0);

  if (oferowane === 0) {
    return { kind: 'za_malo_danych', powod: 'brak_danych_metryki', prog };
  }

  const udzial = roundShare(obecnosci, oferowane);

  return wynik(
    'frekwencja_warsztatow',
    grupa,
    [
      { etykieta: 'obecni', udzialProcent: udzial },
      { etykieta: 'nieobecni', udzialProcent: 100 - udzial },
    ],
    prog,
    `frekwencja na poziomie ${udzial}%`,
  );
}
