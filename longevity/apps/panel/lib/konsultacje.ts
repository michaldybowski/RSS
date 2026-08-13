/**
 * Terminarz konsultacji — dane demonstracyjne, PROTOTYP.
 *
 * Czas lokalny bez strefy, zgodnie z konwencją @longevity/clinical: godzina
 * na ekranie uczestnika ma być godziną na jego zegarze.
 */

import type { Termin } from '@longevity/clinical';

import { NOW } from './config.ts';

export const TERAZ = `${NOW.toISOString().slice(0, 10)}T09:00`;

export const ORGANIZACJA = 'org-alfa';

export const TERMINY: readonly Termin[] = [
  {
    id: 't-1',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-07-28T10:00',
    minut: 30,
    rodzaj: 'planowy',
  },
  {
    id: 't-2',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-07-29T14:30',
    minut: 30,
    rodzaj: 'planowy',
  },
  {
    // Pula pilna — otwarta wyłącznie dla czerwonej kategorii ryzyka.
    id: 't-pilny',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-2',
    start: '2026-07-27T08:00',
    minut: 30,
    rodzaj: 'pilny',
  },
  {
    id: 't-miniony',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-07-20T10:00',
    minut: 30,
    rodzaj: 'planowy',
  },
];

export function terminPoId(id: string): Termin | undefined {
  return TERMINY.find((termin) => termin.id === id);
}

export const LEKARZE: Readonly<Record<string, string>> = {
  'lek-1': 'dr Anna Wilk',
  'lek-2': 'dr Marek Sowa',
};

export function dzienIGodzina(start: string): string {
  return `${start.slice(0, 10)}, godz. ${start.slice(11, 16)}`;
}
