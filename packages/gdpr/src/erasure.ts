/**
 * Prawo do usunięcia (art. 17 RODO).
 *
 * Usunięcie nie jest jednym `DELETE`. Część danych musi zostać, bo trzyma je
 * inny obowiązek prawny — i to trzeba osobie powiedzieć wprost, a nie zostawić
 * w polityce prywatności.
 *
 * Trzy kategorie:
 *  1. **Usuwane** — dane zdrowotne, tożsamość, zgody po okresie przedawnienia.
 *  2. **Zachowywane z ograniczeniem** — dokumenty księgowe. Ustawa o rachunkowości
 *     wymaga zachowania dokumentu w całości, więc nota imienna zostaje razem
 *     z danymi, które zawiera. Trafia do zbioru o ograniczonym dostępie
 *     i znika po upływie własnego terminu.
 *  3. **Zachowywane bez przypisania** — audit log. Wpisy zostają, bo rozliczalność
 *     przetwarzania jest obowiązkiem, ale po skasowaniu tożsamości pseudonim
 *     nie prowadzi już do człowieka.
 */

import { rekordy } from './etykiety.ts';
import { terminRetencji } from './retention.ts';
import type { Rekord, ZbiorPodmiotu } from './types.ts';

export type LosRekordu = 'usuniety' | 'zachowany_z_ograniczeniem' | 'zachowany_bez_przypisania';

export interface PozycjaPotwierdzenia {
  rodzaj: string;
  liczba: number;
  los: LosRekordu;
  podstawa: string;
  /** Do kiedy rekordy zachowane pozostaną w systemie. */
  do?: string;
}

export interface PotwierdzenieUsuniecia {
  subjectRef: string;
  wniosekId: string;
  zrealizowano: string;
  pozycje: readonly PozycjaPotwierdzenia[];
  /** Czy pseudonim przestał prowadzić do osoby. */
  tozsamoscUsunieta: boolean;
  komunikat: string;
}

export interface WynikUsuniecia {
  zbior: ZbiorPodmiotu;
  potwierdzenie: PotwierdzenieUsuniecia;
}

/** Rodzaje, których nie kasujemy przy realizacji wniosku. */
const ZACHOWYWANE_Z_OGRANICZENIEM = new Set(['dokument_ksiegowy']);
const ZACHOWYWANE_BEZ_PRZYPISANIA = new Set(['audit_log']);

export function zaplanujUsuniecie(zbior: ZbiorPodmiotu, na: string): PozycjaPotwierdzenia[] {
  const wgRodzaju = new Map<string, Rekord[]>();

  for (const rekord of zbior.rekordy) {
    const lista = wgRodzaju.get(rekord.rodzaj) ?? [];
    lista.push(rekord);
    wgRodzaju.set(rekord.rodzaj, lista);
  }

  const pozycje: PozycjaPotwierdzenia[] = [];

  for (const [rodzaj, rekordy] of [...wgRodzaju.entries()].sort()) {
    if (ZACHOWYWANE_Z_OGRANICZENIEM.has(rodzaj)) {
      const terminy = rekordy
        .map((rekord) => terminRetencji(rekord, zbior.uczestnictwo)?.termin)
        .filter((termin): termin is string => termin !== undefined);

      pozycje.push({
        rodzaj,
        liczba: rekordy.length,
        los: 'zachowany_z_ograniczeniem',
        podstawa:
          'Ustawa o rachunkowości wymaga zachowania dokumentu w całości. ' +
          'Dokumenty trafiają do zbioru o ograniczonym dostępie.',
        ...(terminy.length > 0 ? { do: terminy.sort().at(-1)! } : {}),
      });
      continue;
    }

    if (ZACHOWYWANE_BEZ_PRZYPISANIA.has(rodzaj)) {
      const terminy = rekordy
        .map((rekord) => terminRetencji(rekord, zbior.uczestnictwo)?.termin)
        .filter((termin): termin is string => termin !== undefined);

      pozycje.push({
        rodzaj,
        liczba: rekordy.length,
        los: 'zachowany_bez_przypisania',
        podstawa:
          'Rozliczalność przetwarzania. Po usunięciu tożsamości wpisy nie prowadzą już do osoby.',
        ...(terminy.length > 0 ? { do: terminy.sort().at(-1)! } : {}),
      });
      continue;
    }

    pozycje.push({
      rodzaj,
      liczba: rekordy.length,
      los: 'usuniety',
      podstawa: 'Realizacja wniosku o usunięcie danych (art. 17 RODO).',
    });
  }

  if (zbior.tozsamosc !== undefined) {
    pozycje.push({
      rodzaj: 'tozsamosc',
      liczba: 1,
      los: 'usuniety',
      podstawa: 'Usunięcie powiązania pseudonimu z osobą.',
    });
  }

  void na;
  return pozycje;
}

export function wykonajUsuniecie(
  zbior: ZbiorPodmiotu,
  wniosekId: string,
  zrealizowano: string,
): WynikUsuniecia {
  const pozycje = zaplanujUsuniecie(zbior, zrealizowano);

  const zachowane = zbior.rekordy.filter(
    (rekord) =>
      ZACHOWYWANE_Z_OGRANICZENIEM.has(rekord.rodzaj) ||
      ZACHOWYWANE_BEZ_PRZYPISANIA.has(rekord.rodzaj),
  );

  const usuniete = pozycje
    .filter((pozycja) => pozycja.los === 'usuniety' && pozycja.rodzaj !== 'tozsamosc')
    .reduce((total, pozycja) => total + pozycja.liczba, 0);

  const zZachowaniem = pozycje.filter((pozycja) => pozycja.los !== 'usuniety');

  return {
    // Tożsamość znika — pseudonim zostaje, bo odwołują się do niego rekordy,
    // które muszą przetrwać. Sam pseudonim nie jest daną osobową bez mapowania.
    zbior: { subjectRef: zbior.subjectRef, uczestnictwo: zbior.uczestnictwo, rekordy: zachowane },
    potwierdzenie: {
      subjectRef: zbior.subjectRef,
      wniosekId,
      zrealizowano,
      pozycje,
      tozsamoscUsunieta: true,
      komunikat:
        `Usunięto ${rekordy(usuniete)} oraz dane identyfikacyjne. ` +
        (zZachowaniem.length > 0
          ? `Zachowano ${rekordy(zZachowaniem.reduce((t, p) => t + p.liczba, 0))}, ` +
            'których przechowywania wymaga odrębny przepis — szczegóły w zestawieniu poniżej.'
          : 'Nie zachowano żadnych danych.'),
    },
  };
}

/** Czy po usunięciu w zbiorze nie zostały dane pozwalające wskazać osobę. */
export function czyNieprzypisywalny(zbior: ZbiorPodmiotu): boolean {
  if (zbior.tozsamosc !== undefined) return false;
  return !zbior.rekordy.some((rekord) => rekord.rodzaj !== 'audit_log' && rekord.rodzaj !== 'dokument_ksiegowy');
}
