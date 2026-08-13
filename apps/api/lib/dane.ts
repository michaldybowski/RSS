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
import type { Termin } from '@longevity/clinical';
import { grant, type ConsentLedger } from '@longevity/consent';
import { assess, syntheticIntake, type Assessment, type ParticipantIntake } from '@longevity/core';
import type { Oferta, Partner } from '@longevity/marketplace';
import type { ParticipantRecord } from '@longevity/analytics';

export const TERAZ = new Date('2026-10-05T09:00:00.000Z');
export const DZISIAJ = TERAZ.toISOString().slice(0, 10);

/**
 * Ten sam moment co `TERAZ`, ale w konwencji czasu lokalnego bez strefy
 * (`YYYY-MM-DDTHH:mm`) — tej, której wymaga @longevity/clinical i kalendarz ICS.
 *
 * Dwa zapisy tego samego momentu wyglądają na duplikat, dopóki nie zobaczy się,
 * co robi ich pomieszanie: terminarz porównuje `start` z „teraz" jako łańcuchy,
 * więc znacznik z `Z` na końcu wypycha wszystkie terminy dnia poza widok.
 */
export const TERAZ_LOKALNY = '2026-10-05T09:00';

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

/**
 * Leczone nadciśnienie jest tu celowo. Daje flagę ŻÓŁTĄ, która nie blokuje
 * wyzwań wysiłkowych, a jednocześnie odpowiada przeciwwskazaniu jednej z ofert
 * marketplace — dzięki temu ścieżka ostrzeżenia przy zakupie jest w przebiegu
 * kontraktowym sprawdzana naprawdę, a nie tylko jako pusta tablica.
 */
export const INTAKE: ParticipantIntake = syntheticIntake({
  ageYears: 44,
  sex: 'K',
  medications: { hypertensionTreated: true },
});

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
    quizId: 'q-sen',
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

export const QUIZY: readonly Quiz[] = [
  {
    id: 'q-sen',
    materialId: 'm-sen-01',
    pytania: [
      {
        id: 'p-1',
        tresc: 'Co najsilniej przesuwa rytm dobowy?',
        odpowiedzi: ['Światło', 'Pora kolacji', 'Temperatura sypialni'],
        poprawna: 0,
        wyjasnienie: 'Światło jest głównym synchronizatorem rytmu dobowego.',
      },
      {
        id: 'p-2',
        tresc: 'Jaka temperatura sypialni sprzyja zasypianiu?',
        odpowiedzi: ['Powyżej 22°C', 'Około 18–19°C', 'Nie ma znaczenia'],
        poprawna: 1,
        wyjasnienie: 'Spadek temperatury ciała ułatwia zaśnięcie.',
      },
    ],
  },
];

export const SCIEZKI: readonly Sciezka[] = [
  {
    id: 's-podstawy',
    nazwa: 'Podstawy longevity',
    opis: 'Trzy moduły otwierające program.',
    // Trzeci moduł wskazuje materiał wycofany — w postępie ma wypaść
    // z mianownika, a nie zablokować ścieżkę na zawsze.
    moduly: [
      { materialId: 'm-sen-01', obowiazkowy: true },
      { materialId: 'm-ruch-02', obowiazkowy: true },
      { materialId: 'm-stary', obowiazkowy: true },
    ],
    pakiety: ['light', 'pro', 'enterprise'],
  },
  {
    id: 's-prime',
    nazwa: 'Ścieżka PRIME',
    opis: 'Rozszerzony program regeneracji.',
    moduly: [{ materialId: 'm-prime-01', obowiazkowy: true }],
    pakiety: ['prime'],
  },
];

/**
 * Terminy konsultacji w konwencji czasu lokalnego (patrz `TERAZ_LOKALNY`).
 *
 * `t-0` jest przeszły i ma zostać odfiltrowany; `t-2` jest pilny, a uczestnik
 * demonstracyjny ma kategorię ŻÓŁTĄ — pula pilna musi mu odmówić z powodem.
 */
export const TERMINY: readonly Termin[] = [
  {
    id: 't-0',
    organizationId: ORGANIZACJA,
    clinicianId: 'lek-1',
    start: '2026-10-02T10:00',
    minut: 30,
    rodzaj: 'planowy',
  },
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
    clinicianId: 'lek-1',
    start: '2026-10-09T09:30',
    minut: 30,
    rodzaj: 'planowy',
  },
];

export function terminPoId(id: string): Termin | undefined {
  return TERMINY.find((termin) => termin.id === id);
}

/** Partner w negocjacjach jest tu po to, żeby widać było, że go nie widać. */
export const PARTNERZY: readonly Partner[] = [
  {
    id: 'p-lab',
    nazwa: 'Laboratorium Alfa',
    kategoria: 'diagnostyka',
    opis: 'Sieć punktów pobrań.',
    prowizjaPct: 10,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-spa',
    nazwa: 'Strefa Regeneracji',
    kategoria: 'regeneracja',
    opis: 'Sauna, masaż, krioterapia.',
    prowizjaPct: 12,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-suple',
    nazwa: 'Suplementy Gamma',
    kategoria: 'suplementy',
    opis: 'Umowa w negocjacjach.',
    prowizjaPct: 25,
    statusUmowy: 'negocjacje',
  },
];

export const OFERTY: readonly Oferta[] = [
  {
    id: 'o-panel',
    partnerId: 'p-lab',
    nazwa: 'Panel Bazowy Longevity',
    opis: 'Pakiet badań zgodny z Panelem Bazowym programu.',
    cenaNettoGr: 39_000,
    stawkaVat: 'zw',
    pakiety: ['light', 'pro', 'enterprise'],
  },
  {
    id: 'o-sauna',
    partnerId: 'p-spa',
    nazwa: 'Karnet na saunę',
    opis: 'Dziesięć wejść, sauna fińska i parowa.',
    cenaNettoGr: 24_000,
    stawkaVat: '23',
    pakiety: ['pro', 'enterprise'],
    przeciwwskazania: ['FLAG_HYPERTENSION', 'FLAG_APNEA_SUSPECT'],
  },
  {
    id: 'o-prime',
    partnerId: 'p-spa',
    nazwa: 'Krioterapia — pakiet PRIME',
    opis: 'Oferta poza pakietem uczestnika demonstracyjnego.',
    cenaNettoGr: 48_000,
    stawkaVat: '23',
    pakiety: ['prime'],
  },
  {
    id: 'o-suple',
    partnerId: 'p-suple',
    nazwa: 'Zestaw witamin',
    opis: 'Oferta partnera w negocjacjach.',
    cenaNettoGr: 12_000,
    stawkaVat: '23',
    pakiety: ['light', 'pro', 'enterprise'],
  },
];

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
