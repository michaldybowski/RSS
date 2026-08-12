/**
 * Stan audytów — PROTOTYP, pamięć procesu.
 *
 * Dowody są tu udawane: zaznaczenie „dowód załączony" ustawia klucz
 * w magazynie, którego nie ma. Prawdziwe załączniki dochodzą razem z decyzją
 * o hostingu, bo wymagają prywatnego magazynu z podpisanymi odnośnikami.
 */

import type { Audyt, Certyfikat, Ustalenie } from '@longevity/audit';

import { AUDYTY } from './dane.ts';

let audyty: readonly Audyt[] = AUDYTY;
let ustalenia: readonly Ustalenie[] = [];
let certyfikaty: readonly Certyfikat[] = [];

export function pobierzAudyt(id: string): Audyt | undefined {
  return audyty.find((audyt) => audyt.id === id);
}

export function pobierzAudyty(): readonly Audyt[] {
  return audyty;
}

export function zapiszAudyt(zmieniony: Audyt): void {
  audyty = audyty.map((audyt) => (audyt.id === zmieniony.id ? zmieniony : audyt));
}

export function pobierzUstalenia(): readonly Ustalenie[] {
  return ustalenia;
}

export function zapiszUstaleniaWStanie(nowe: readonly Ustalenie[]): void {
  ustalenia = nowe;
}

export function pobierzCertyfikaty(): readonly Certyfikat[] {
  return certyfikaty;
}

export function dodajCertyfikat(certyfikat: Certyfikat): void {
  certyfikaty = [...certyfikaty, certyfikat];
}

export function kolejnyNumer(): number {
  return certyfikaty.length + 1;
}
