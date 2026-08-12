/**
 * Stan zapisów i obecności — PROTOTYP.
 *
 * Pamięć procesu. W produkcji: Postgres. Lista obecności jest jedyną imienną
 * listą w systemie, więc docelowo trafia do klasy K2 z audit logiem przy
 * każdym odczycie.
 */

import { zapisz, type Obecnosc, type StanZapisow } from '@longevity/workshops';

import { warsztatPoId, ZAPISY_POCZATKOWE } from './dane.ts';

function stanPoczatkowy(): StanZapisow {
  let stan: StanZapisow = { zapisy: [] };

  ZAPISY_POCZATKOWE.forEach((wpis, index) => {
    const warsztat = warsztatPoId(wpis.warsztatId);
    if (warsztat === undefined) return;

    // Zgłoszenia rozłożone w czasie — kolejność rozstrzyga o liście rezerwowej.
    const zgloszony = `2026-09-0${(index % 9) + 1}T08:${String(index % 60).padStart(2, '0')}:00.000Z`;
    stan = zapisz(stan, warsztat, wpis.participantId, zgloszony).stan;
  });

  return stan;
}

let stanZapisow: StanZapisow = stanPoczatkowy();
let obecnosci: readonly Obecnosc[] = [];

/** Ślad poprawek — w produkcji trafia do audit logu. */
export interface WpisPoprawki {
  warsztatId: string;
  participantId: string;
  trenerId: string;
  at: string;
}

const poprawki: WpisPoprawki[] = [];

export function pobierzZapisy(): StanZapisow {
  return stanZapisow;
}

export function pobierzObecnosci(): readonly Obecnosc[] {
  return obecnosci;
}

export function zapiszObecnosci(nowe: readonly Obecnosc[], slad: readonly WpisPoprawki[]): void {
  obecnosci = nowe;
  poprawki.push(...slad);
}

export function pobierzPoprawki(warsztatId: string): readonly WpisPoprawki[] {
  return poprawki.filter((wpis) => wpis.warsztatId === warsztatId);
}

export function ustawZapisy(stan: StanZapisow): void {
  stanZapisow = stan;
}
