/**
 * Sprawdziany wiedzy.
 *
 * Wynik quizu nie wpływa na Health Score, kategorię ryzyka ani na kwalifikację
 * do wyzwań. Ocena zdrowia powstaje wyłącznie z zestawu reguł na danych
 * z kwestionariusza i badań (ADR-03) — dopisanie do niej „bo źle odpowiedział
 * na pytanie o sen" zamieniłoby test wiedzy w ukryty wywiad medyczny.
 *
 * Podejść jest dowolnie wiele. Sprawdzian ma sprawdzić, czy materiał został
 * zrozumiany, a nie ustawić bramkę, na której ktoś odpada po jednej pomyłce.
 */

import type { Pytanie, Quiz } from './types.ts';

export const PROG_ZALICZENIA_PROCENT = 70;

export interface OcenaPytania {
  pytanieId: string;
  wybrana?: number;
  poprawna: number;
  trafiona: boolean;
  wyjasnienie: string;
}

export interface WynikQuizu {
  quizId: string;
  poprawnych: number;
  pytan: number;
  procent: number;
  zaliczony: boolean;
  /** Rozbicie po pytaniach — sprawdzian bez wyjaśnień niczego nie uczy. */
  pytania: readonly OcenaPytania[];
}

export class PustyQuizError extends Error {
  constructor(quizId: string) {
    super(`Sprawdzian ${quizId} nie ma pytań i nie może zostać oceniony.`);
    this.name = 'PustyQuizError';
  }
}

export function ocenQuiz(quiz: Quiz, odpowiedzi: Readonly<Record<string, number>>): WynikQuizu {
  if (quiz.pytania.length === 0) throw new PustyQuizError(quiz.id);

  const pytania = quiz.pytania.map((pytanie) => ocenPytanie(pytanie, odpowiedzi[pytanie.id]));
  const poprawnych = pytania.filter((pozycja) => pozycja.trafiona).length;
  const procent = Math.round((poprawnych / quiz.pytania.length) * 100);

  return {
    quizId: quiz.id,
    poprawnych,
    pytan: quiz.pytania.length,
    procent,
    zaliczony: procent >= PROG_ZALICZENIA_PROCENT,
    pytania,
  };
}

function ocenPytanie(pytanie: Pytanie, wybrana: number | undefined): OcenaPytania {
  return {
    pytanieId: pytanie.id,
    ...(wybrana !== undefined ? { wybrana } : {}),
    poprawna: pytanie.poprawna,
    // Brak odpowiedzi to odpowiedź błędna, a nie pytanie pominięte —
    // inaczej pominięcie trudnych pytań podnosiłoby wynik procentowy.
    trafiona: wybrana === pytanie.poprawna,
    wyjasnienie: pytanie.wyjasnienie,
  };
}

export function quizMaterialu(quizy: readonly Quiz[], materialId: string): Quiz | undefined {
  return quizy.find((quiz) => quiz.materialId === materialId);
}
