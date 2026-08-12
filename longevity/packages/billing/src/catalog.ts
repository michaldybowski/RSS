/**
 * Cennik z datami obowiązywania.
 *
 * Pozycja katalogu może mieć kilka wersji — podwyżka od września nie może
 * zmieniać dokumentów wystawionych w sierpniu. Wybieramy wersję obowiązującą
 * w dniu wystawienia i utrwalamy jej stawkę na dokumencie.
 */

import type { PozycjaKatalogu } from './types.ts';

export function obowiazujacaPozycja(
  katalog: readonly PozycjaKatalogu[],
  kod: string,
  na: string,
): PozycjaKatalogu | undefined {
  const wersje = katalog
    .filter((pozycja) => pozycja.kod === kod && pozycja.obowiazujeOd <= na)
    .slice()
    .sort((a, b) => (a.obowiazujeOd < b.obowiazujeOd ? -1 : 1));

  return wersje[wersje.length - 1];
}

/** Ostatni dzień okresu rozliczeniowego — dokumenty wystawiamy na jego koniec. */
export function koniecOkresu(okres: string): string {
  const [rok, miesiac] = okres.split('-').map(Number);
  if (rok === undefined || miesiac === undefined || miesiac < 1 || miesiac > 12) {
    throw new Error(`Niepoprawny okres rozliczeniowy: "${okres}". Oczekiwano formatu RRRR-MM.`);
  }
  const dzien = new Date(Date.UTC(rok, miesiac, 0)).getUTCDate();
  return `${okres}-${String(dzien).padStart(2, '0')}`;
}
