/**
 * Nazwy rodzajów rekordów po polsku.
 *
 * Potwierdzenie usunięcia jest pismem do człowieka, a nie zrzutem tabeli.
 * „wearables_surowe" i „tozsamosc" to identyfikatory z bazy — osoba, która
 * pyta, co się stało z jej danymi, ma prawo dostać odpowiedź w swoim języku.
 */

import type { RodzajRekordu } from './types.ts';

export const OPIS_RODZAJU: Readonly<Record<RodzajRekordu, string>> = {
  kwestionariusz: 'odpowiedzi kwestionariusza',
  plan: 'plan',
  health_score: 'wskaźnik Health Score',
  wyniki_badan: 'wyniki badań laboratoryjnych',
  dziennik_objawow: 'dziennik objawów',
  wearables_surowe: 'surowe dane z urządzeń',
  wearables_dobowe: 'dobowe podsumowania z urządzeń',
  zgoda: 'zgody',
  audit_log: 'wpisy rejestru dostępu',
  dokument_ksiegowy: 'dokumenty księgowe',
  tozsamosc: 'dane identyfikacyjne',
};

/** Bezpieczne dla danych spoza wyliczenia — zwraca kod, gdy nie zna nazwy. */
export function opisRodzaju(rodzaj: string): string {
  return OPIS_RODZAJU[rodzaj as RodzajRekordu] ?? rodzaj;
}

/**
 * Liczebnik dla rzeczownika „rekord". Bez tego komunikat mówi
 * „Zachowano 2 rekordów", co brzmi jak błąd programu — a to jest pismo,
 * które osoba może pokazać prawnikowi.
 */
export function rekordy(ile: number): string {
  const reszta10 = ile % 10;
  const reszta100 = ile % 100;
  if (ile === 1) return '1 rekord';
  if (reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14)) return `${ile} rekordy`;
  return `${ile} rekordów`;
}
