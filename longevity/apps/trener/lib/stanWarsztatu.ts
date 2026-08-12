import type { Warsztat } from '@longevity/workshops';

export type KodStanu = 'przed' | 'trwa' | 'po' | 'odwolany';

function koniec(warsztat: Warsztat): string {
  return new Date(
    new Date(warsztat.start).getTime() + warsztat.czasTrwaniaMin * 60_000,
  ).toISOString();
}

/**
 * Stan warsztatu względem chwili odniesienia. Osobny moduł, bo korzystają
 * z niego dwie strony, a Next nie pozwala eksportować pomocników z pliku strony.
 */
export function stanWarsztatu(warsztat: Warsztat, teraz: string): { kod: KodStanu; opis: string } {
  if (warsztat.status === 'odwolany') return { kod: 'odwolany', opis: 'odwołany' };
  if (teraz < warsztat.start) return { kod: 'przed', opis: 'przed rozpoczęciem' };
  if (teraz <= koniec(warsztat)) return { kod: 'trwa', opis: 'w trakcie' };
  return { kod: 'po', opis: 'zakończony' };
}
