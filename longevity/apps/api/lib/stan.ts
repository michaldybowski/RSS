/**
 * Stan API — PROTOTYP, pamięć procesu.
 *
 * Wszystko poza rejestrem zgód i audit logiem jest tu odtwarzalne z danych
 * demonstracyjnych. Rejestr zgód i log są dopisywalne, bo to na nich opierają
 * się bramki i rozliczalność — i to one pokazują, że API naprawdę je egzekwuje.
 */

import { PamieciowyAuditLog } from '@longevity/gdpr';
import type { Zaliczenie } from '@longevity/academy';
import type { ConsentLedger } from '@longevity/consent';
import type { Pomiar, Zapis } from '@longevity/challenges';
import type { Konsultacja } from '@longevity/clinical';
import type { Zamowienie } from '@longevity/marketplace';

import { poczatkowyRejestrZgod } from './dane.ts';

export const AUDIT = new PamieciowyAuditLog();

let zgody: ConsentLedger = poczatkowyRejestrZgod();
let zapisy: readonly Zapis[] = [];
let pomiary: readonly Pomiar[] = [];
let konsultacje: readonly Konsultacja[] = [];
let zamowienia: readonly Zamowienie[] = [];
let zaliczenia: readonly Zaliczenie[] = [];

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

export function konsultacjeUczestnika(): readonly Konsultacja[] {
  return konsultacje;
}

export function dodajKonsultacje(konsultacja: Konsultacja): void {
  konsultacje = [...konsultacje, konsultacja];
}

/**
 * Podmiana konsultacji po identyfikatorze.
 *
 * Odwołanie zwraca nowy obiekt zamiast mutować stary (pakiet jest
 * bezstanowy), więc stan musi tę wersję podstawić. Dopisanie jej obok
 * dawałoby dwie konsultacje o tym samym `id` i terminarz uznałby termin
 * za wciąż zajęty.
 */
export function zastapKonsultacje(zmieniona: Konsultacja): void {
  konsultacje = konsultacje.map((pozycja) =>
    pozycja.id === zmieniona.id ? zmieniona : pozycja,
  );
}

export function zamowieniaUczestnika(): readonly Zamowienie[] {
  return zamowienia;
}

export function dodajZamowienie(zamowienie: Zamowienie): void {
  zamowienia = [...zamowienia, zamowienie];
}

export function zaliczeniaUczestnika(): readonly Zaliczenie[] {
  return zaliczenia;
}

export function zapiszZaliczenia(nowe: readonly Zaliczenie[]): void {
  zaliczenia = nowe;
}
