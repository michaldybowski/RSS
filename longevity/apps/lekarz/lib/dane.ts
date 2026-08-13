/**
 * Dane demonstracyjne panelu lekarza — PROTOTYP.
 *
 * Dwóch lekarzy, żeby dało się zobaczyć odmowę: konsultacja należy do jednego
 * z nich i drugi otwiera ją w trybie odczytu, a nie jako pustą stronę.
 *
 * Dwóch uczestników: jeden udzielił zgody na udostępnienie Karty Pacjenta,
 * drugi nie. Bez tej pary bramka zgody byłaby kodem, którego nikt nie widzi.
 */

import type { Actor } from '@longevity/access';
import type { Konsultacja, Termin } from '@longevity/clinical';
import { assess, syntheticIntake, type Assessment, type ParticipantIntake } from '@longevity/core';

/**
 * Czas lokalny bez strefy — konwencja pakietu @longevity/clinical.
 * Godzina na ekranie lekarza ma być godziną na zegarze pacjenta.
 */
export const TERAZ = '2026-10-08T10:35';
export const DZIS = TERAZ.slice(0, 10);
export const ORGANIZACJA = 'org-alfa';

export interface Lekarz {
  id: string;
  imie: string;
  actor: Actor;
}

export const LEKARZE: readonly Lekarz[] = [
  {
    id: 'lek-1',
    imie: 'dr Anna Wilk',
    actor: { userId: 'lek-1', grants: [{ role: 'lekarz', organizationId: ORGANIZACJA }] },
  },
  {
    id: 'lek-2',
    imie: 'dr Marek Sowa',
    actor: { userId: 'lek-2', grants: [{ role: 'lekarz', organizationId: ORGANIZACJA }] },
  },
];

export function lekarzPoId(id: string): Lekarz | undefined {
  return LEKARZE.find((lekarz) => lekarz.id === id);
}

export interface Uczestnik {
  id: string;
  subjectRef: string;
  intake: ParticipantIntake;
  ocena: Assessment;
  /** Aktywna zgoda na udostępnienie Karty Pacjenta lekarzowi. */
  zgodaNaKarte: boolean;
}

function uczestnik(
  id: string,
  subjectRef: string,
  intake: ParticipantIntake,
  zgodaNaKarte: boolean,
): Uczestnik {
  return {
    id,
    subjectRef,
    intake,
    ocena: assess(intake, { mode: 'synthetic', now: new Date(TERAZ) }),
    zgodaNaKarte,
  };
}

export const UCZESTNICY: readonly Uczestnik[] = [
  uczestnik(
    'u-101',
    'psd-8fa2',
    syntheticIntake({ ageYears: 44, sex: 'K' }),
    true,
  ),
  uczestnik(
    'u-102',
    'psd-31c7',
    syntheticIntake({
      ageYears: 51,
      sex: 'M',
      history: { exertionalChestPain: true },
    }),
    false,
  ),
];

export function uczestnikPoId(id: string): Uczestnik | undefined {
  return UCZESTNICY.find((osoba) => osoba.id === id);
}

export const TERMINY: readonly Termin[] = [
  {
    id: 't-1',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-10-08T10:00',
    minut: 30,
    rodzaj: 'planowy',
  },
  {
    id: 't-2',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-10-08T12:00',
    minut: 30,
    rodzaj: 'pilny',
  },
  {
    id: 't-3',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-2',
    start: '2026-10-08T11:00',
    minut: 30,
    rodzaj: 'planowy',
  },
];

export function terminPoId(id: string): Termin | undefined {
  return TERMINY.find((termin) => termin.id === id);
}

export const KONSULTACJE: readonly Konsultacja[] = [
  {
    id: 'kons-t-1',
    terminId: 't-1',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    participantId: 'u-101',
    subjectRef: 'psd-8fa2',
    status: 'zarezerwowana',
    zarezerwowana: '2026-10-01T09:00',
    powod: 'Omówienie wyników i planu',
  },
  {
    id: 'kons-t-2',
    terminId: 't-2',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    participantId: 'u-102',
    subjectRef: 'psd-31c7',
    status: 'zarezerwowana',
    zarezerwowana: '2026-10-06T14:00',
    powod: 'Skierowanie z oceny ryzyka',
  },
  {
    id: 'kons-t-3',
    terminId: 't-3',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-2',
    participantId: 'u-101',
    subjectRef: 'psd-8fa2',
    status: 'zarezerwowana',
    zarezerwowana: '2026-10-02T09:00',
  },
];

export const OPIS_STATUSU: Readonly<Record<string, string>> = {
  zarezerwowana: 'zarezerwowana',
  odbyta: 'odbyta',
  odwolana: 'odwołana',
  niestawiennictwo: 'niestawiennictwo',
};

export function godzina(start: string): string {
  return start.slice(11, 16);
}
