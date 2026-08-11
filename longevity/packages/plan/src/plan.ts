/**
 * Kształt planu — kontrakt między platformą a modelem językowym.
 *
 * Model dostaje ten schemat i ma go wypełnić. Nie ma miejsca na kategorię
 * ryzyka, flagi ani zalecenia lekowe — czego nie ma w schemacie, tego model
 * nie może dopisać (ADR-03).
 */

export interface MealGuideline {
  pora: string;
  opis: string;
  /** Przykładowe zestawy, nie sztywne menu — plan ma być do utrzymania. */
  przyklady: readonly string[];
}

export interface TrainingDay {
  dzien: number;
  typ: 'silowy' | 'wytrzymalosciowy' | 'mobilnosc' | 'regeneracja' | 'wolne';
  czasMin: number;
  bloki: readonly string[];
}

export interface ScheduleItem {
  dzien: number;
  pora: string;
  czynnosc: string;
  filar: string;
}

export interface Plan {
  podsumowanie: string;
  zywienie: {
    zasady: readonly string[];
    posilki: readonly MealGuideline[];
    uwagi: readonly string[];
  };
  trening: {
    mikrocykl: readonly TrainingDay[];
    progresja: readonly string[];
  };
  sen: {
    protokol: readonly string[];
    celGodzin: string;
  };
  harmonogram: readonly ScheduleItem[];
  monitoring: {
    wskazniki: readonly string[];
    punktyKontrolne: readonly string[];
  };
}

/**
 * Zastrzeżenie doklejane przez platformę, nie przez model. Gdyby zależało od
 * modelu, przy nieudanej generacji plan mógłby wyjść bez niego — a to jest
 * granica między materiałem edukacyjnym a wyrobem medycznym.
 */
export const DISCLAIMER =
  'Ten plan nie jest diagnozą medyczną ani zaleceniem leczenia. Przed wdrożeniem ' +
  'skonsultuj go z lekarzem, zwłaszcza jeśli przyjmujesz leki lub chorujesz przewlekle. ' +
  'Ocena ryzyka została wykonana automatycznie na podstawie podanych przez Ciebie informacji.';

/** Opis schematu przekazywany modelowi razem z ładunkiem. */
export const PLAN_SCHEMA_DESCRIPTION = {
  podsumowanie: 'string, 200-800 znaków',
  zywienie: {
    zasady: 'lista 3-8 zasad',
    posilki: 'lista 2-6 pozycji: { pora, opis, przyklady[] }',
    uwagi: 'lista 0-5 uwag',
  },
  trening: {
    mikrocykl: 'dokładnie 7 pozycji: { dzien 1-7, typ, czasMin, bloki[] }',
    progresja: 'lista 1-5 zasad progresji',
  },
  sen: { protokol: 'lista 3-8 kroków', celGodzin: 'string, np. "7-8 h"' },
  harmonogram: 'lista 5-30 pozycji: { dzien 1-7, pora, czynnosc, filar }',
  monitoring: {
    wskazniki: 'lista 2-8 wskaźników',
    punktyKontrolne: 'lista 2-6 momentów kontroli',
  },
} as const;
