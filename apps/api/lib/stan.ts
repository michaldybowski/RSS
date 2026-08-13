/**
 * Stan API — PROTOTYP, pamięć procesu.
 *
 * Wszystko poza rejestrem zgód i audit logiem jest tu odtwarzalne z danych
 * demonstracyjnych. Rejestr zgód i log są dopisywalne, bo to na nich opierają
 * się bramki i rozliczalność — i to one pokazują, że API naprawdę je egzekwuje.
 */

import { PamieciowyAuditLog } from '@longevity/gdpr';
import type { ConsentLedger } from '@longevity/consent';
import type { Pomiar, Zapis } from '@longevity/challenges';

import { poczatkowyRejestrZgod } from './dane.ts';

export const AUDIT = new PamieciowyAuditLog();

let zgody: ConsentLedger = poczatkowyRejestrZgod();
let zapisy: readonly Zapis[] = [];
let pomiary: readonly Pomiar[] = [];

export function rejestrZgod(): ConsentLedger {
  return zgody;
}

export function zapiszRejestrZgod(nowy: ConsentLedger): void {
  zgody = nowy;
}

export function zapisyWyzwan(): readonly Zapis[] {
  return zapisy;
}

export function dodajZapis(zapis: Zapis): void {
  zapisy = [...zapisy, zapis];
}

export function pomiaryWyzwan(): readonly Pomiar[] {
  return pomiary;
}

export function zapiszPomiary(nowe: readonly Pomiar[]): void {
  pomiary = nowe;
}
