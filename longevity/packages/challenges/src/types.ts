/**
 * Wyzwania i gamifikacja (specyfikacja 9).
 *
 * Wyzwania są treścią redagowaną w Notion — pakiet dostaje je już
 * znormalizowane przez @longevity/notion-sync i nie sięga po nie sam.
 *
 * Punkty nie są walutą. Typ nagrody nie ma wariantu pieniężnego ani zniżki
 * na świadczenie zdrowotne i nie jest to przeoczenie: program, w którym
 * zdrowie da się wymienić na rabat, przestaje mierzyć zdrowie, a zaczyna
 * mierzyć determinację w zdobywaniu rabatu.
 */

export type Metryka = 'kroki' | 'sen' | 'trening' | 'nawyk' | 'woda';

export type TypWyzwania = 'indywidualne' | 'zespolowe';

/** Jednostka celu dziennego. Bez niej „cel 7000" nic nie znaczy. */
export const JEDNOSTKI: Readonly<Record<Metryka, string>> = {
  kroki: 'kroków',
  sen: 'minut snu',
  trening: 'minut ruchu',
  nawyk: 'wykonany nawyk',
  woda: 'ml wody',
};

export interface Wyzwanie {
  id: string;
  nazwa: string;
  typ: TypWyzwania;
  metryka: Metryka;
  /** Cel **dzienny**, nie łączny — przekroczenie nie daje więcej punktów. */
  cel: number;
  czasTrwaniaDni: number;
  /** Punkty za dzień, w którym cel został osiągnięty. */
  punkty: number;
  pakiety: readonly string[];
  filar?: string;
}

export type ZrodloPomiaru = 'wearable' | 'reczne';

export interface Pomiar {
  wyzwanieId: string;
  /** Dzień pomiaru, ISO 8601 (YYYY-MM-DD). */
  dzien: string;
  wartosc: number;
  zrodlo: ZrodloPomiaru;
}

export interface Zapis {
  wyzwanieId: string;
  /** Pseudonim uczestnika — rankingi nie potrzebują tożsamości. */
  subjectRef: string;
  od: string;
  zespol?: string;
}

/**
 * Czym można nagrodzić. Lista jest zamknięta i celowo bezgotówkowa —
 * patrz komentarz na górze pliku.
 */
export type RodzajNagrody = 'odznaka' | 'poziom' | 'dostep_do_tresci';

export interface Odznaka {
  kod: string;
  nazwa: string;
  opis: string;
}
