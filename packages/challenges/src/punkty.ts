/**
 * Punktacja, passa i poziomy.
 *
 * Trzy decyzje, które trzymają gamifikację po stronie zdrowia:
 *
 * 1. **Przekroczenie celu nie daje więcej punktów.** Cel dzienny jest progiem,
 *    nie licznikiem. Punktowanie każdego kolejnego kroku nagradzałoby
 *    przetrenowanie i robiłoby z odpoczynku stratę.
 *
 * 2. **Dobowy limit punktów.** Zapis do ośmiu wyzwań naraz nie zamienia dnia
 *    w kopalnię punktów. Limit jest wspólny dla wszystkich wyzwań.
 *
 * 3. **Passy nie przerywa jeden dzień przerwy.** Passa, którą kasuje pojedynczy
 *    dzień choroby, uczy ćwiczyć na chorobie. Dopiero dwa dni z rzędu bez
 *    osiągniętego celu kończą serię.
 */

import { celOsiagniety } from './pomiary.ts';
import type { Pomiar, Wyzwanie } from './types.ts';

export const LIMIT_PUNKTOW_DZIENNIE = 100;

/** Mnożnik jednorazowej premii za ukończenie wyzwania. */
export const MNOZNIK_UKONCZENIA = 5;

/** Ile dni z rzędu bez celu wolno mieć, zanim passa się kończy. */
export const DNI_TOLERANCJI_PASSY = 1;

export interface PozycjaDnia {
  wyzwanie: Wyzwanie;
  wartosc: number;
}

export interface PunktyDnia {
  punkty: number;
  /** Czy limit dobowy obciął wynik — uczestnik ma to widzieć, a nie zgadywać. */
  ograniczone: boolean;
}

export function punktyDnia(pozycje: readonly PozycjaDnia[]): PunktyDnia {
  const surowe = pozycje
    .filter((pozycja) => celOsiagniety(pozycja.wyzwanie, pozycja.wartosc))
    .reduce((suma, pozycja) => suma + pozycja.wyzwanie.punkty, 0);

  return {
    punkty: Math.min(surowe, LIMIT_PUNKTOW_DZIENNIE),
    ograniczone: surowe > LIMIT_PUNKTOW_DZIENNIE,
  };
}

/**
 * Punkty za cały okres. Grupuje po dniach, bo limit dobowy trzeba nałożyć
 * na dzień, a nie na sumę — inaczej limit nie ograniczałby niczego.
 */
export function punktyOkresu(
  wyzwania: readonly Wyzwanie[],
  pomiary: readonly Pomiar[],
): number {
  const wgId = new Map(wyzwania.map((wyzwanie) => [wyzwanie.id, wyzwanie]));
  const wgDnia = new Map<string, PozycjaDnia[]>();

  for (const pomiar of pomiary) {
    const wyzwanie = wgId.get(pomiar.wyzwanieId);
    if (wyzwanie === undefined) continue;

    const lista = wgDnia.get(pomiar.dzien) ?? [];
    lista.push({ wyzwanie, wartosc: pomiar.wartosc });
    wgDnia.set(pomiar.dzien, lista);
  }

  let suma = 0;
  for (const pozycje of wgDnia.values()) suma += punktyDnia(pozycje).punkty;
  return suma;
}

export function premiaZaUkonczenie(wyzwanie: Wyzwanie): number {
  return wyzwanie.punkty * MNOZNIK_UKONCZENIA;
}

/**
 * Passa liczona wstecz od podanego dnia.
 *
 * Zwraca liczbę dni z osiągniętym celem w nieprzerwanej serii. Dzień bez
 * celu (albo bez pomiaru) jest tolerowany, dopóki nie zdarzy się drugi
 * z rzędu.
 */
export function passa(
  wyzwanie: Wyzwanie,
  pomiary: readonly Pomiar[],
  na: string,
  od: string,
): number {
  const wgDnia = new Map(
    pomiary
      .filter((pomiar) => pomiar.wyzwanieId === wyzwanie.id)
      .map((pomiar) => [pomiar.dzien, pomiar.wartosc]),
  );

  let dni = 0;
  let przerwy = 0;
  let dzien = na;

  while (dzien >= od) {
    const wartosc = wgDnia.get(dzien);

    if (wartosc !== undefined && celOsiagniety(wyzwanie, wartosc)) {
      dni += 1;
      przerwy = 0;
    } else {
      przerwy += 1;
      if (przerwy > DNI_TOLERANCJI_PASSY) break;
    }

    dzien = poprzedniDzien(dzien);
  }

  return dni;
}

function poprzedniDzien(dzien: string): string {
  return new Date(Date.parse(dzien) - 86_400_000).toISOString().slice(0, 10);
}

function nastepnyDzien(dzien: string): string {
  return new Date(Date.parse(dzien) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Najdłuższa passa w całej historii wyzwania.
 *
 * Potrzebna osobno od {@link passa}, bo odznaki muszą być trwałe. Odznaka
 * „tydzień z rzędu", która znika w dniu przerwania serii, nie jest odznaką —
 * jest licznikiem, i to takim, który karze za odpoczynek dwa razy.
 */
export function najdluzszaPassa(
  wyzwanie: Wyzwanie,
  pomiary: readonly Pomiar[],
  od: string,
  doDnia: string,
): number {
  const wgDnia = new Map(
    pomiary
      .filter((pomiar) => pomiar.wyzwanieId === wyzwanie.id)
      .map((pomiar) => [pomiar.dzien, pomiar.wartosc]),
  );

  let najlepsza = 0;
  let biezaca = 0;
  let przerwy = 0;

  for (let dzien = od; dzien <= doDnia; dzien = nastepnyDzien(dzien)) {
    const wartosc = wgDnia.get(dzien);

    if (wartosc !== undefined && celOsiagniety(wyzwanie, wartosc)) {
      biezaca += 1;
      przerwy = 0;
      najlepsza = Math.max(najlepsza, biezaca);
      continue;
    }

    przerwy += 1;
    if (przerwy > DNI_TOLERANCJI_PASSY) {
      biezaca = 0;
      przerwy = 0;
    }
  }

  return najlepsza;
}

export interface Poziom {
  kod: string;
  nazwa: string;
  od: number;
}

export const POZIOMY: readonly Poziom[] = [
  { kod: 'start', nazwa: 'Start', od: 0 },
  { kod: 'regularny', nazwa: 'Regularny', od: 300 },
  { kod: 'wytrwaly', nazwa: 'Wytrwały', od: 900 },
  { kod: 'mistrz', nazwa: 'Mistrz', od: 2000 },
];

export function poziom(punkty: number): Poziom {
  // Od najwyższego, żeby pierwszy pasujący był właściwy.
  return [...POZIOMY].reverse().find((pozycja) => punkty >= pozycja.od) ?? POZIOMY[0]!;
}

export interface PostepPoziomu {
  biezacy: Poziom;
  nastepny?: Poziom;
  brakuje?: number;
}

export function postepPoziomu(punkty: number): PostepPoziomu {
  const biezacy = poziom(punkty);
  const nastepny = POZIOMY.find((pozycja) => pozycja.od > punkty);

  return {
    biezacy,
    ...(nastepny !== undefined ? { nastepny, brakuje: nastepny.od - punkty } : {}),
  };
}
