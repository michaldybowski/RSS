/**
 * Dane demonstracyjne API — PROTOTYP.
 *
 * Tokeny są tu wpisane w kod, bo prototyp nie ma rejestru kont. W produkcji
 * wchodzi OIDC z krótkimi tokenami dostępowymi i osobnym tokenem odświeżania;
 * ten plik jest jednym z miejsc do wymiany w całości.
 *
 * Token jest **sekretem, nie identyfikatorem**. Nie pojawia się w żadnej
 * odpowiedzi, w logu ani w komunikacie błędu — a nieznany token dostaje tę samą
 * odpowiedź co token wygasły, żeby nie dało się po niej rozpoznać istniejących kont.
 */

import type { Actor } from '@longevity/access';
import type { Material, Quiz, Sciezka } from '@longevity/academy';
import type { Wyzwanie } from '@longevity/challenges';
import { grant, type ConsentLedger } from '@longevity/consent';
import { assess, syntheticIntake, type Assessment, type ParticipantIntake } from '@longevity/core';
import type { ParticipantRecord } from '@longevity/analytics';

export const TERAZ = new Date('2026-10-05T09:00:00.000Z');
export const DZISIAJ = TERAZ.toISOString().slice(0, 10);

export const ORGANIZACJA = 'org-alfa';

export interface Konto {
  token: string;
  userId: string;
  subjectRef: string;
  opis: string;
  actor: Actor;
}

export const KONTA: readonly Konto[] = [
  {
    token: 'tok-uczestnik-demo',
    userId: 'u-101',
    subjectRef: 'psd-8fa2',
    opis: 'Uczestnik programu',
    actor: { userId: 'u-101', grants: [] },
  },
  {
    token: 'tok-hr-demo',
    userId: 'hr-alfa',
    subjectRef: 'psd-hr',
    opis: 'HR — Firma Alfa',
    actor: { userId: 'hr-alfa', grants: [{ role: 'hr', organizationId: ORGANIZACJA }] },
  },
  {
    token: 'tok-lekarz-demo',
    userId: 'lek-1',
    subjectRef: 'psd-lek',
    opis: 'Lekarz konsultujący',
    actor: { userId: 'lek-1', grants: [{ role: 'lekarz', organizationId: ORGANIZACJA }] },
  },
  {
    token: 'tok-admin-demo',
    userId: 'adm-1',
    subjectRef: 'psd-adm',
    opis: 'Administrator platformy',
    actor: { userId: 'adm-1', grants: [{ role: 'admin' }] },
  },
];

export function kontoPoTokenie(token: string): Konto | undefined {
  return KONTA.find((konto) => konto.token === token);
}

export const INTAKE: ParticipantIntake = syntheticIntake({ ageYears: 44, sex: 'K' });

export const OCENA: Assessment = assess(INTAKE, { mode: 'synthetic', now: TERAZ });

/** Zgody uczestnika na starcie: komplet z onboardingu, bez zgody dla lekarza. */
export function poczatkowyRejestrZgod(): ConsentLedger {
  let ledger: ConsentLedger = [];
  const dowod = { ipHash: 'prototyp', userAgentHash: 'prototyp' };

  for (const kod of ['regulamin', 'dane_zdrowotne', 'przetwarzanie_ai'] as const) {
    ledger = grant(ledger, kod, '2026-09-01T08:00:00.000Z', dowod);
  }

  return ledger;
}

export const WYZWANIA: readonly Wyzwanie[] = [
  {
    id: 'w-kroki',
    nazwa: '10 tysięcy kroków',
    typ: 'indywidualne',
    metryka: 'kroki',
    cel: 10_000,
    czasTrwaniaDni: 30,
    punkty: 10,
    pakiety: ['light', 'pro', 'enterprise'],
    filar: 'Ruch',
  },
  {
    id: 'w-sen',
    nazwa: 'Siedem godzin snu',
    typ: 'indywidualne',
    metryka: 'sen',
    cel: 420,
    czasTrwaniaDni: 21,
    punkty: 8,
    pakiety: ['light', 'pro', 'enterprise'],
    filar: 'Sen',
  },
  {
    id: 'w-prime',
    nazwa: 'Protokół regeneracji PRIME',
    typ: 'indywidualne',
    metryka: 'trening',
    cel: 45,
    czasTrwaniaDni: 28,
    punkty: 15,
    pakiety: ['prime'],
    filar: 'Regeneracja',
  },
];

export const PAKIET_UCZESTNIKA = 'pro';

export const MATERIALY: readonly Material[] = [
  {
    id: 'm-sen-01',
    tytul: 'Higiena snu w pięć minut',
    typ: 'lekcja',
    opis: 'Rytm dobowy, światło wieczorem i temperatura sypialni.',
    czasTrwaniaMin: 12,
    filary: ['Sen'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
  },
  {
    id: 'm-ruch-02',
    tytul: 'Trening interwałowy — wprowadzenie',
    typ: 'webinar',
    opis: 'Zasady pracy na wysokim tętnie.',
    czasTrwaniaMin: 42,
    filary: ['Ruch'],
    pakiety: ['pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'wysoka',
  },
  {
    id: 'm-prime-01',
    tytul: 'Protokół regeneracji PRIME',
    typ: 'zeszyt',
    opis: 'Rozszerzony moduł regeneracji.',
    czasTrwaniaMin: 30,
    filary: ['Regeneracja'],
    pakiety: ['prime'],
    opublikowana: true,
  },
  {
    id: 'm-stary',
    tytul: 'Materiał wycofany',
    typ: 'artykul',
    opis: 'Do aktualizacji.',
    czasTrwaniaMin: 10,
    filary: ['Żywienie'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    wycofany: true,
  },
];

export const QUIZY: readonly Quiz[] = [];
export const SCIEZKI: readonly Sciezka[] = [];

/**
 * Kohorta do dashboardu HR. Dwanaście osób, żeby próg k-anonimowości
 * przepuszczał wynik dla całej organizacji i wstrzymywał go dla wąskich filtrów.
 */
export const KOHORTA: readonly ParticipantRecord[] = Array.from({ length: 14 }, (_, i) => ({
  participantId: `p-${i}`,
  organizationId: ORGANIZACJA,
  unitId: i < 11 ? 'produkcja' : 'biuro',
  ageBand: i % 2 === 0 ? '40-49' : '50-59',
  sex: i % 3 === 0 ? 'K' : 'M',
  active: true,
  healthScore: 55 + i * 2,
  riskCategory: i % 5 === 0 ? 'ŻÓŁTA' : 'ZIELONA',
  challengesCompleted: i % 3,
  workshopsAttended: i % 2,
  workshopsOffered: 2,
}));
