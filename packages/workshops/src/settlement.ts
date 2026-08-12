/**
 * Rozliczenie trenera.
 *
 * Trener jest kosztem po stronie FDP, nie pozycją w liniach przychodowych
 * A–M — dlatego to osobne wyliczenie, a nie kolejny typ dokumentu
 * w @longevity/billing.
 *
 * Liczymy przeprowadzone warsztaty, nie zapisane. Warsztat odwołany albo taki,
 * na który nikt nie dotarł, to inna sytuacja niż przeprowadzone zajęcia
 * i rozliczenie musi je rozróżniać.
 */

import { formatPln, type Grosze } from '@longevity/billing';

import { frekwencja } from './attendance.ts';
import type { Obecnosc, Warsztat, Zapis } from './types.ts';

export interface StawkiTrenera {
  /** Ryczałt za przeprowadzony warsztat. */
  zaWarsztatGr: Grosze;
  /** Dopłata za każdego obecnego uczestnika, jeśli umowa ją przewiduje. */
  zaUczestnikaGr?: Grosze;
  /** Rekompensata za warsztat odwołany zbyt późno przez zamawiającego. */
  zaOdwolanyGr?: Grosze;
  /** Ile godzin przed startem odwołanie przestaje być bezkosztowe. */
  progOdwolaniaGodz?: number;
}

export interface PozycjaRozliczenia {
  warsztatId: string;
  temat: string;
  start: string;
  status: 'przeprowadzony' | 'odwolany_platny' | 'odwolany_bezplatny' | 'bez_obecnosci';
  obecnych: number;
  kwotaGr: Grosze;
  uwaga?: string;
}

export interface RozliczenieTrenera {
  trenerId: string;
  okres: string;
  pozycje: readonly PozycjaRozliczenia[];
  sumaGr: Grosze;
  sumaOpis: string;
  przeprowadzonych: number;
}

function godzinPrzed(start: string, odwolanieAt: string): number {
  return (new Date(start).getTime() - new Date(odwolanieAt).getTime()) / 3_600_000;
}

export interface WarsztatDoRozliczenia {
  warsztat: Warsztat;
  /** Kiedy zgłoszono odwołanie — potrzebne do oceny, czy było w terminie. */
  odwolanyAt?: string;
}

export function rozliczTrenera(
  trenerId: string,
  okres: string,
  pozycjeWejsciowe: readonly WarsztatDoRozliczenia[],
  zapisy: readonly Zapis[],
  obecnosci: readonly Obecnosc[],
  stawki: StawkiTrenera,
): RozliczenieTrenera {
  const prog = stawki.progOdwolaniaGodz ?? 24;
  const pozycje: PozycjaRozliczenia[] = [];

  for (const { warsztat, odwolanyAt } of pozycjeWejsciowe) {
    if (warsztat.trenerId !== trenerId) continue;
    if (!warsztat.start.startsWith(okres)) continue;

    if (warsztat.status === 'odwolany') {
      const poznoOdwolany =
        odwolanyAt !== undefined && godzinPrzed(warsztat.start, odwolanyAt) < prog;

      pozycje.push({
        warsztatId: warsztat.id,
        temat: warsztat.temat,
        start: warsztat.start,
        status: poznoOdwolany ? 'odwolany_platny' : 'odwolany_bezplatny',
        obecnych: 0,
        kwotaGr: poznoOdwolany ? (stawki.zaOdwolanyGr ?? 0) : 0,
        ...(poznoOdwolany
          ? { uwaga: `Odwołany mniej niż ${prog} h przed terminem.` }
          : {}),
      });
      continue;
    }

    const wynik = frekwencja(warsztat, zapisy, obecnosci);
    const odnotowano = wynik.obecnych + wynik.nieobecnych > 0;

    if (!odnotowano) {
      // Brak odnotowanej obecności nie oznacza, że warsztat się nie odbył —
      // oznacza, że nie mamy tego potwierdzonego. Rozliczenie czeka.
      pozycje.push({
        warsztatId: warsztat.id,
        temat: warsztat.temat,
        start: warsztat.start,
        status: 'bez_obecnosci',
        obecnych: 0,
        kwotaGr: 0,
        uwaga: 'Brak odnotowanej listy obecności — pozycja wstrzymana.',
      });
      continue;
    }

    const zaUczestnikow = (stawki.zaUczestnikaGr ?? 0) * wynik.obecnych;

    pozycje.push({
      warsztatId: warsztat.id,
      temat: warsztat.temat,
      start: warsztat.start,
      status: 'przeprowadzony',
      obecnych: wynik.obecnych,
      kwotaGr: stawki.zaWarsztatGr + zaUczestnikow,
    });
  }

  pozycje.sort((a, b) => (a.start < b.start ? -1 : 1));

  const sumaGr = pozycje.reduce((total, pozycja) => total + pozycja.kwotaGr, 0);

  return {
    trenerId,
    okres,
    pozycje,
    sumaGr,
    sumaOpis: formatPln(sumaGr),
    przeprowadzonych: pozycje.filter((pozycja) => pozycja.status === 'przeprowadzony').length,
  };
}
