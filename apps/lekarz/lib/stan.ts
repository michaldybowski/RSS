/**
 * Stan panelu lekarza — PROTOTYP, pamięć procesu.
 *
 * Audit log jest tu prawdziwy: każde otwarcie Karty Pacjenta zostawia wpis,
 * także wtedy, gdy skończyło się odmową. To ten sam log, który uczestnik
 * czyta w API pod `/api/v1/me/access-log`.
 */

import type { Konsultacja, Notatka, ZlecenieBadan } from '@longevity/clinical';
import { PamieciowyAuditLog } from '@longevity/gdpr';

import { KONSULTACJE } from './dane.ts';

export const AUDIT = new PamieciowyAuditLog();

let konsultacje: readonly Konsultacja[] = KONSULTACJE;
let notatki: readonly Notatka[] = [];
let zlecenia: readonly ZlecenieBadan[] = [];

export function pobierzKonsultacje(): readonly Konsultacja[] {
  return konsultacje;
}

export function pobierzKonsultacje1(id: string): Konsultacja | undefined {
  return konsultacje.find((konsultacja) => konsultacja.id === id);
}

export function zapiszKonsultacje(zmieniona: Konsultacja): void {
  konsultacje = konsultacje.map((konsultacja) =>
    konsultacja.id === zmieniona.id ? zmieniona : konsultacja,
  );
}

export function pobierzNotatke(konsultacjaId: string): Notatka | undefined {
  return notatki.find((notatka) => notatka.konsultacjaId === konsultacjaId);
}

export function zapiszNotatkeWStanie(notatka: Notatka): void {
  notatki = [...notatki.filter((pozycja) => pozycja.konsultacjaId !== notatka.konsultacjaId), notatka];
}

export function pobierzZlecenie(konsultacjaId: string): ZlecenieBadan | undefined {
  return zlecenia.find((zlecenie) => zlecenie.konsultacjaId === konsultacjaId);
}

export function zapiszZlecenie(zlecenie: ZlecenieBadan): void {
  zlecenia = [...zlecenia.filter((pozycja) => pozycja.id !== zlecenie.id), zlecenie];
}
