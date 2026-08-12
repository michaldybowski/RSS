/**
 * Rejestr wejść na dashboard (specyfikacja 10 pkt 5).
 *
 * Zapisujemy nie tylko fakt otwarcia, ale i zastosowane filtry. Próba
 * deanonimizacji polega właśnie na serii zapytań o coraz węższe grupy —
 * bez zapisu filtrów w logu nie da się jej później odtworzyć.
 */

import type { DashboardQuery, DashboardResult } from './types.ts';

export interface DashboardAuditEntry {
  actorUserId: string;
  organizationId: string;
  metric: DashboardQuery['metric'];
  filters: Readonly<Record<string, string>>;
  /** Czy wynik został wstrzymany i dlaczego. */
  outcome: 'wynik' | 'za_malo_danych';
  suppressionReason?: string;
  at: string;
}

export function auditDashboardAccess(
  actorUserId: string,
  query: DashboardQuery,
  result: DashboardResult,
  at: string,
): DashboardAuditEntry {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value !== undefined) filters[key] = String(value);
  }

  return {
    actorUserId,
    organizationId: query.organizationId,
    metric: query.metric,
    filters,
    outcome: result.kind === 'wynik' ? 'wynik' : 'za_malo_danych',
    ...(result.kind === 'za_malo_danych' ? { suppressionReason: result.powod } : {}),
    at,
  };
}

/**
 * Wykrywanie prób zawężania. Seria zapytań o tę samą metrykę z rosnącą liczbą
 * filtrów to typowy wzorzec sondowania — sam w sobie nie jest naruszeniem,
 * ale powinien podnieść alert (specyfikacja 14).
 */
export function detectProbing(
  entries: readonly DashboardAuditEntry[],
  minimum = 4,
): boolean {
  if (entries.length < minimum) return false;

  const odrzucone = entries.filter((entry) => entry.outcome === 'za_malo_danych').length;
  const liczbyFiltrow = entries.map((entry) => Object.keys(entry.filters).length);
  const rosnaco = liczbyFiltrow.every((count, index) => index === 0 || count >= liczbyFiltrow[index - 1]!);

  return rosnaco && odrzucone >= Math.ceil(entries.length / 2);
}
