/**
 * Odznaki — jedyna forma nagrody obok poziomu.
 *
 * Reguły są deterministyczne i policzalne z historii pomiarów. Odznaka,
 * której nie da się wyliczyć z danych, byłaby przyznawana ręcznie — czyli
 * uznaniowo, a to psuje jedyną rzecz, jaką odznaka wnosi: wiarygodność.
 */

import type { PodsumowanieUczestnika } from './postep.ts';
import type { Odznaka, Wyzwanie } from './types.ts';

export const ODZNAKI: readonly Odznaka[] = [
  {
    kod: 'pierwszy_dzien',
    nazwa: 'Pierwszy dzień',
    opis: 'Pierwszy dzień z osiągniętym celem.',
  },
  {
    kod: 'tydzien_passy',
    nazwa: 'Tydzień z rzędu',
    opis: 'Siedem dni passy w jednym wyzwaniu.',
  },
  {
    kod: 'wyzwanie_ukonczone',
    nazwa: 'Ukończone wyzwanie',
    opis: 'Pierwsze wyzwanie zaliczone na próg ukończenia.',
  },
  {
    kod: 'piec_wyzwan',
    nazwa: 'Pięć wyzwań',
    opis: 'Pięć ukończonych wyzwań.',
  },
  {
    kod: 'zespolowe',
    nazwa: 'Drużyna',
    opis: 'Ukończone wyzwanie zespołowe.',
  },
];

export function przyznaneOdznaki(
  podsumowanie: PodsumowanieUczestnika,
  wyzwania: readonly Wyzwanie[],
): readonly Odznaka[] {
  const wgId = new Map(wyzwania.map((wyzwanie) => [wyzwanie.id, wyzwanie]));
  const kody = new Set<string>();

  if (podsumowanie.postepy.some((postep) => postep.dniZaliczone > 0)) kody.add('pierwszy_dzien');
  if (podsumowanie.najdluzszaPassa >= 7) kody.add('tydzien_passy');
  if (podsumowanie.ukonczone >= 1) kody.add('wyzwanie_ukonczone');
  if (podsumowanie.ukonczone >= 5) kody.add('piec_wyzwan');

  if (
    podsumowanie.postepy.some(
      (postep) => postep.ukonczone && wgId.get(postep.wyzwanieId)?.typ === 'zespolowe',
    )
  ) {
    kody.add('zespolowe');
  }

  return ODZNAKI.filter((odznaka) => kody.has(odznaka.kod));
}
