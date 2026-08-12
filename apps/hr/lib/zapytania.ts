/**
 * Jedyne wejście do danych w panelu HR.
 *
 * Autoryzacja i zapis w audit logu są tutaj, a nie w komponentach. Strona,
 * która chciałaby sięgnąć po dane z pominięciem tych funkcji, musiałaby
 * zaimportować pakiet analityczny bezpośrednio — a to widać w przeglądzie kodu.
 */

import { assertCan, type Actor } from '@longevity/access';
import { auditDashboardAccess, buildDashboard, type DashboardQuery, type DashboardResult } from '@longevity/analytics';
import { podsumujPrzebieg, rozlicz, type WynikRozliczenia } from '@longevity/billing';
import { PamieciowyAuditLog } from '@longevity/gdpr';

import {
  KATALOG,
  OBCIAZENIA,
  OKRES,
  PROGI_ZFSS,
  UCZESTNICY_ANALITYKA,
  UCZESTNICY_ROZLICZENIA,
} from './dane.ts';

/** W produkcji: tabela w Postgresie. Tutaj pamięć procesu. */
export const AUDIT = new PamieciowyAuditLog();

export interface DziennikWejscia {
  metric: string;
  filtry: string;
  wynik: string;
  at: string;
}

const dziennik: DziennikWejscia[] = [];

export function pobierzDashboard(
  actor: Actor,
  query: DashboardQuery,
  at: string,
): DashboardResult {
  assertCan(actor, 'odczyt_dashboardu', {
    kind: 'organizacja',
    organizationId: query.organizationId,
  });

  const wynik = buildDashboard(UCZESTNICY_ANALITYKA, query);
  const wpis = auditDashboardAccess(actor.userId, query, wynik, at);

  AUDIT.dopisz({
    actorRef: actor.userId,
    akcja: 'odczyt_dashboardu',
    zasob: `organizacja/${query.organizationId}`,
    kontekst: { metric: wpis.metric, ...wpis.filters, outcome: wpis.outcome },
    at,
  });

  const opisFiltrow = Object.entries(wpis.filters)
    .map(([klucz, wartosc]) => `${klucz}=${wartosc}`)
    .join(', ');

  dziennik.unshift({
    metric: wpis.metric,
    filtry: opisFiltrow === '' ? 'bez filtrów' : opisFiltrow,
    wynik: wpis.outcome === 'wynik' ? 'pokazano' : `wstrzymano (${wpis.suppressionReason ?? ''})`,
    at,
  });

  return wynik;
}

export function pobierzDziennik(limit = 20): readonly DziennikWejscia[] {
  return dziennik.slice(0, limit);
}

export function pobierzRozliczenia(actor: Actor, organizationId: string): WynikRozliczenia {
  assertCan(actor, 'odczyt_rozliczen', { kind: 'organizacja', organizationId });

  const pelne = rozlicz({
    okres: OKRES,
    obciazenia: OBCIAZENIA.filter((obciazenie) => obciazenie.organizationId === organizationId),
    katalog: KATALOG,
    uczestnicy: UCZESTNICY_ROZLICZENIA,
    progiZfss: PROGI_ZFSS,
  });

  return pelne;
}

export { podsumujPrzebieg };
