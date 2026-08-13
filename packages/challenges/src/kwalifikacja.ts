/**
 * Kto może wziąć udział w wyzwaniu.
 *
 * To jest najważniejszy plik w tym pakiecie. Gamifikacja z definicji popycha
 * do powtarzania zachowania — więc wyzwanie zaproponowane osobie, której
 * ocena ryzyka właśnie odradza wysiłek, nie jest zachętą, tylko szkodą
 * wyrządzoną punktami.
 *
 * Reguły są deterministyczne i pochodzą z tej samej oceny co plan (ADR-03).
 * Model językowy nie bierze udziału w kwalifikacji i nie może jej zmienić.
 *
 * Zasada odwrotna też obowiązuje: kategoria CZERWONA nie odcina uczestnika
 * od całej gamifikacji. Sen, nawodnienie i nawyki zostają dostępne, bo nie
 * wymagają wysiłku, a są dokładnie tym, co takiej osobie pomaga.
 */

import { FLAGI_PRZECIWWSKAZUJACE_WYSILEK, type Assessment, type RiskCategory } from '@longevity/core';

import type { Metryka, Wyzwanie } from './types.ts';

/** Metryki wymagające wysiłku fizycznego. */
export const METRYKI_WYSILKOWE: readonly Metryka[] = ['kroki', 'trening'];

/**
 * Flagi blokujące metrykę.
 *
 * Sama lista flag pochodzi z @longevity/core — jest medyczna i wymaga
 * akceptacji lekarza. Tutaj zapada wyłącznie decyzja produktowa: które metryki
 * są wysiłkiem. Wyzwanie krokowe u osoby z zaburzeniami odżywiania bywa
 * napędem do kompulsywnego ruchu; punkty za każdy kolejny krok są tu ryzykiem,
 * nie motywacją — dlatego kroki są na tej samej liście co trening.
 */
export const PRZECIWWSKAZANIA: Readonly<Record<string, readonly Metryka[]>> =
  Object.fromEntries(
    FLAGI_PRZECIWWSKAZUJACE_WYSILEK.map((kod) => [kod, METRYKI_WYSILKOWE]),
  );

export type Kwalifikacja =
  | { dozwolone: true }
  | { dozwolone: false; kod: string; powod: string };

const DOZWOLONE: Kwalifikacja = { dozwolone: true };

function blokada(kod: string, powod: string): Kwalifikacja {
  return { dozwolone: false, kod, powod };
}

export interface KontekstKwalifikacji {
  ocena: Assessment;
  /** Pakiet uczestnika. Brak oznacza pominięcie sprawdzenia pakietu. */
  pakiet?: string;
}

export function oceniaKwalifikacje(
  wyzwanie: Wyzwanie,
  kontekst: KontekstKwalifikacji,
): Kwalifikacja {
  const { ocena, pakiet } = kontekst;

  if (pakiet !== undefined && !wyzwanie.pakiety.includes(pakiet)) {
    return blokada(
      'poza_pakietem',
      `Wyzwanie jest dostępne w pakietach: ${wyzwanie.pakiety.join(', ')}.`,
    );
  }

  for (const flaga of ocena.flags) {
    const zablokowane = PRZECIWWSKAZANIA[flaga.code];
    if (zablokowane !== undefined && zablokowane.includes(wyzwanie.metryka)) {
      return blokada(
        'przeciwwskazanie',
        `To wyzwanie wymaga wysiłku fizycznego, a ocena wskazała: ${flaga.message}`,
      );
    }
  }

  if (wymagaZgodyLekarza(ocena.riskCategory) && METRYKI_WYSILKOWE.includes(wyzwanie.metryka)) {
    return blokada(
      'kategoria_ryzyka',
      'Kategoria ryzyka CZERWONA zatrzymuje program wysiłkowy do czasu konsultacji ' +
        'lekarskiej. Wyzwania dotyczące snu, nawodnienia i nawyków pozostają dostępne.',
    );
  }

  return DOZWOLONE;
}

function wymagaZgodyLekarza(kategoria: RiskCategory): boolean {
  return kategoria === 'CZERWONA';
}

export interface PozycjaKatalogu {
  wyzwanie: Wyzwanie;
  kwalifikacja: Kwalifikacja;
}

/**
 * Cały katalog z decyzją przy każdej pozycji.
 *
 * Wyzwania niedostępne są zwracane razem z powodem, a nie ukrywane. Uczestnik,
 * który widzi „to wyzwanie jest wstrzymane, bo…", rozumie własną ocenę ryzyka;
 * uczestnik, przed którym coś zniknęło bez słowa, po prostu szuka obejścia.
 */
export function przegladKatalogu(
  katalog: readonly Wyzwanie[],
  kontekst: KontekstKwalifikacji,
): readonly PozycjaKatalogu[] {
  return katalog.map((wyzwanie) => ({
    wyzwanie,
    kwalifikacja: oceniaKwalifikacje(wyzwanie, kontekst),
  }));
}

export function dostepneWyzwania(
  katalog: readonly Wyzwanie[],
  kontekst: KontekstKwalifikacji,
): readonly Wyzwanie[] {
  return przegladKatalogu(katalog, kontekst)
    .filter((pozycja) => pozycja.kwalifikacja.dozwolone)
    .map((pozycja) => pozycja.wyzwanie);
}

export class WyzwanieNiedozwoloneError extends Error {
  constructor(
    readonly wyzwanieId: string,
    readonly kod: string,
    powod: string,
  ) {
    super(`Nie można dołączyć do wyzwania ${wyzwanieId}: ${powod}`);
    this.name = 'WyzwanieNiedozwoloneError';
  }
}

/**
 * Zapis do wyzwania. Sprawdzenie jest tutaj, a nie w warstwie widoku —
 * przycisk da się ominąć, funkcja nie.
 */
export function dolacz(
  wyzwanie: Wyzwanie,
  kontekst: KontekstKwalifikacji,
  subjectRef: string,
  od: string,
  zespol?: string,
): { wyzwanieId: string; subjectRef: string; od: string; zespol?: string } {
  const kwalifikacja = oceniaKwalifikacje(wyzwanie, kontekst);
  if (!kwalifikacja.dozwolone) {
    throw new WyzwanieNiedozwoloneError(wyzwanie.id, kwalifikacja.kod, kwalifikacja.powod);
  }

  return {
    wyzwanieId: wyzwanie.id,
    subjectRef,
    od,
    ...(zespol !== undefined ? { zespol } : {}),
  };
}
