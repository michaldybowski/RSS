/**
 * Stan sesji uczestnika — WYŁĄCZNIE PROTOTYP.
 *
 * Trzymanie odpowiedzi kwestionariusza w pamięci procesu jest dopuszczalne
 * tylko dlatego, że prototyp działa na danych syntetycznych. W produkcji
 * te dane należą do klasy K1 (art. 9 RODO) i mieszkają w Postgresie w UE,
 * z szyfrowaniem kolumnowym i audit logiem — patrz specyfikacja 3.2 i 4.2.
 *
 * Ten plik jest miejscem, które przy przejściu na produkcję trzeba wymienić
 * w całości. Nie ma tu ścieżki „dopiszemy trwałość później".
 */

import { cookies } from 'next/headers';

import { COOKIE_NAME } from './cookie.ts';
import { historiaDemo } from './wyzwania.ts';

import type { Assessment, ParticipantIntake, PlanPreferences } from '@longevity/core';
import type { ConsentLedger } from '@longevity/consent';
import type { Pomiar, Zapis } from '@longevity/challenges';
import type { AnswerValue, ValidationIssue } from '@longevity/questionnaire';
import type { PipelineResult } from '@longevity/plan';

export { COOKIE_NAME };

export interface PanelSession {
  id: string;
  ledger: ConsentLedger;
  answers: Record<string, AnswerValue>;
  /**
   * Błędy walidacji trzymamy w sesji, a nie w adresie strony.
   *
   * Bez JavaScriptu formularz robi natywny POST, a Next renderuje odpowiedź
   * pod tym samym adresem — parametr w rodzaju `?blad=1` nigdy by się nie
   * pojawił i uczestnik zobaczyłby formularz bez informacji, co poprawić.
   */
  stepIssues: Record<number, readonly ValidationIssue[]>;
  /** Czy uczestnik próbował już przejść dalej bez kompletu zgód. */
  consentAttempted: boolean;
  intake?: ParticipantIntake;
  preferences?: PlanPreferences;
  assessment?: Assessment;
  result?: PipelineResult;
  /** Zapisy do wyzwań i pomiary. W produkcji: tabele uczestnika w Postgresie. */
  zapisy: Zapis[];
  pomiary: Pomiar[];
  /** Powód odrzucenia ostatniego wpisu — pokazywany przy formularzu. */
  bladPomiaru?: string | undefined;
}

const sessions = new Map<string, PanelSession>();

function create(id: string): PanelSession {
  // Historia wyzwań jest zasiana danymi demonstracyjnymi — ekran gamifikacji
  // z samymi zerami nie pokazuje ani passy, ani limitu, ani progu ukończenia.
  const { zapisy, pomiary } = historiaDemo();

  return { id, ledger: [], answers: {}, stepIssues: {}, consentAttempted: false, zapisy, pomiary };
}

/** Zwraca sesję dla bieżącego ciasteczka; tworzy nową, jeśli nie ma. */
export async function getSession(): Promise<PanelSession> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;

  if (id !== undefined) {
    const existing = sessions.get(id);
    if (existing !== undefined) return existing;
  }

  // Ciasteczko wskazuje na sesję, której już nie ma (restart procesu) —
  // zaczynamy od nowa zamiast udawać, że stan istnieje.
  const fresh = create(id ?? globalThis.crypto.randomUUID());
  sessions.set(fresh.id, fresh);
  return fresh;
}

/** Ustawienie ciasteczka wymaga kontekstu akcji serwerowej, nie renderowania. */
export async function ensureSessionCookie(session: PanelSession): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export function saveSession(session: PanelSession): void {
  sessions.set(session.id, session);
}

export async function resetSession(): Promise<void> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;
  if (id !== undefined) sessions.delete(id);
  store.delete(COOKIE_NAME);
}
