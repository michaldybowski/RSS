/**
 * Rejestrowanie pomiarów.
 *
 * Dwie reguły, obie o wiarygodności danych:
 *
 * 1. **Okno wsteczne.** Wpis ręczny można dodać za dziś albo wczoraj.
 *    Uzupełnianie miesiąca wstecz nie jest pomiarem, tylko deklaracją —
 *    a wyzwanie wygrane deklaracją nie mówi nic o zdrowiu. Dane z urządzenia
 *    mają okno szersze, bo synchronizacja potrafi się spóźnić o kilka dni.
 *
 * 2. **Zakres wartości.** Wartość spoza fizjologicznego zakresu jest
 *    odrzucana, a nie przycinana po cichu. Przycięcie zapisałoby liczbę,
 *    której nikt nie zmierzył, i zrobiłoby z tego rekord.
 */

import type { Metryka, Pomiar, Wyzwanie, ZrodloPomiaru } from './types.ts';

export const OKNO_WSTECZNE_DNI: Readonly<Record<ZrodloPomiaru, number>> = {
  reczne: 1,
  wearable: 7,
};

/** Górne granice dobowe. Powyżej — pomyłka w jednostce albo w palcach. */
export const MAKSIMA_DOBOWE: Readonly<Record<Metryka, number>> = {
  kroki: 60_000,
  sen: 16 * 60,
  trening: 480,
  nawyk: 1,
  woda: 8_000,
};

export class PomiarPozaOknemError extends Error {
  constructor(dzien: string, zrodlo: ZrodloPomiaru) {
    super(
      `Pomiar za ${dzien} jest poza oknem ${OKNO_WSTECZNE_DNI[zrodlo]} dni dla źródła "${zrodlo}". ` +
        'Uzupełnianie odległych dni nie jest pomiarem.',
    );
    this.name = 'PomiarPozaOknemError';
  }
}

export class PomiarPozaZakresemError extends Error {
  constructor(metryka: Metryka, wartosc: number) {
    super(
      `Wartość ${wartosc} przekracza dobowe maksimum dla metryki "${metryka}" ` +
        `(${MAKSIMA_DOBOWE[metryka]}). Pomiar odrzucony — poprawka należy do źródła danych.`,
    );
    this.name = 'PomiarPozaZakresemError';
  }
}

export class PomiarPrzedStartemError extends Error {
  constructor(dzien: string, od: string) {
    super(`Pomiar za ${dzien} jest sprzed startu wyzwania (${od}).`);
    this.name = 'PomiarPrzedStartemError';
  }
}

function roznicaDni(od: string, do_: string): number {
  return Math.round((Date.parse(do_) - Date.parse(od)) / 86_400_000);
}

export interface KontekstPomiaru {
  wyzwanie: Wyzwanie;
  /** Data startu z zapisu uczestnika. */
  od: string;
  /** Dzisiejsza data — wstrzykiwana, żeby wynik był powtarzalny. */
  dzisiaj: string;
}

/**
 * Dopisuje pomiar, zastępując wcześniejszy z tego samego dnia.
 *
 * Nadpisanie jest zamierzone: dzień ma jedną wartość, a nie sumę prób.
 * Dodawanie pomiarów tego samego dnia pozwalałoby zbierać cel w ratach
 * i zgłaszać go wielokrotnie.
 */
export function zapiszPomiar(
  pomiary: readonly Pomiar[],
  nowy: Pomiar,
  kontekst: KontekstPomiaru,
): readonly Pomiar[] {
  const { wyzwanie, od, dzisiaj } = kontekst;

  if (nowy.wartosc < 0 || nowy.wartosc > MAKSIMA_DOBOWE[wyzwanie.metryka]) {
    throw new PomiarPozaZakresemError(wyzwanie.metryka, nowy.wartosc);
  }
  if (nowy.dzien < od) throw new PomiarPrzedStartemError(nowy.dzien, od);

  const wstecz = roznicaDni(nowy.dzien, dzisiaj);
  if (wstecz < 0 || wstecz > OKNO_WSTECZNE_DNI[nowy.zrodlo]) {
    throw new PomiarPozaOknemError(nowy.dzien, nowy.zrodlo);
  }

  return [
    ...pomiary.filter(
      (pomiar) => !(pomiar.wyzwanieId === nowy.wyzwanieId && pomiar.dzien === nowy.dzien),
    ),
    nowy,
  ].sort((a, b) => (a.dzien < b.dzien ? -1 : a.dzien > b.dzien ? 1 : 0));
}

export function pomiaryWyzwania(
  pomiary: readonly Pomiar[],
  wyzwanieId: string,
): readonly Pomiar[] {
  return pomiary.filter((pomiar) => pomiar.wyzwanieId === wyzwanieId);
}

export function celOsiagniety(wyzwanie: Wyzwanie, wartosc: number): boolean {
  return wartosc >= wyzwanie.cel;
}

/** Dni kalendarzowe wyzwania, od startu do dziś włącznie — nie więcej niż czas trwania. */
export function dniTrwania(wyzwanie: Wyzwanie, od: string, dzisiaj: string): number {
  const uplynelo = roznicaDni(od, dzisiaj) + 1;
  return Math.max(0, Math.min(uplynelo, wyzwanie.czasTrwaniaDni));
}

export { roznicaDni };
