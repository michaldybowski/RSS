/**
 * Katalog wyzwań i dane demonstracyjne — PROTOTYP.
 *
 * W produkcji katalog pochodzi z cache zasilanego z Notion (@longevity/notion-sync,
 * źródło „wyzwania"), a historia pomiarów z bazy uczestnika. Tutaj jedno i drugie
 * jest wpisane w kod, żeby panel dało się obejrzeć bez Notion i bez opaski.
 *
 * Historia jest zasiana celowo: ekran gamifikacji z samymi zerami nie pokazuje
 * niczego, co warto ocenić — ani passy, ani limitu, ani progu ukończenia.
 */

import type { Pomiar, PunktyUczestnika, Wyzwanie, Zapis } from '@longevity/challenges';

import { NOW } from './config.ts';

export const DZISIAJ = NOW.toISOString().slice(0, 10);

/** Pseudonim uczestnika prototypu. Rankingi nie potrzebują tożsamości. */
export const SUBJECT_REF = 'psd-demo';

export const PAKIET_UCZESTNIKA = 'pro';

export const ZESPOL_UCZESTNIKA = 'Produkcja';

export const KATALOG: readonly Wyzwanie[] = [
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
    id: 'w-woda',
    nazwa: 'Dwa litry wody',
    typ: 'indywidualne',
    metryka: 'woda',
    cel: 2_000,
    czasTrwaniaDni: 14,
    punkty: 5,
    pakiety: ['light', 'pro', 'enterprise'],
    filar: 'Żywienie',
  },
  {
    id: 'w-nawyk',
    nazwa: 'Pięć minut oddechu',
    typ: 'indywidualne',
    metryka: 'nawyk',
    cel: 1,
    czasTrwaniaDni: 21,
    punkty: 6,
    pakiety: ['light', 'pro', 'enterprise'],
    filar: 'Stres',
  },
  {
    id: 'w-zespol',
    nazwa: 'Zespołowe minuty ruchu',
    typ: 'zespolowe',
    metryka: 'trening',
    cel: 30,
    czasTrwaniaDni: 14,
    punkty: 12,
    pakiety: ['pro', 'enterprise'],
    filar: 'Ruch',
  },
  {
    // Wyzwanie spoza pakietu uczestnika — po to, żeby ekran pokazywał także
    // pozycję niedostępną wraz z powodem, a nie tylko to, co wolno.
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

export function wyzwaniePoId(id: string): Wyzwanie | undefined {
  return KATALOG.find((wyzwanie) => wyzwanie.id === id);
}

const START_DEMO = '2026-07-15';

function dzien(od: string, przesuniecie: number): string {
  return new Date(Date.parse(od) + przesuniecie * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Dwanaście dni historii: dziewięć dni z celem, jeden słabszy, dwa dobre.
 * Pojedyncza przerwa jest tu zamierzona — pokazuje, że passa jej nie kasuje.
 */
const KROKI_DEMO = [11_400, 10_800, 12_200, 9_100, 10_500, 11_900, 12_600, 10_200, 10_050, 6_400, 11_100, 10_900];

export function historiaDemo(): { zapisy: Zapis[]; pomiary: Pomiar[] } {
  const zapisy: Zapis[] = [
    { wyzwanieId: 'w-kroki', subjectRef: SUBJECT_REF, od: START_DEMO },
    { wyzwanieId: 'w-sen', subjectRef: SUBJECT_REF, od: dzien(START_DEMO, 4) },
  ];

  const pomiary: Pomiar[] = KROKI_DEMO.map((wartosc, index) => ({
    wyzwanieId: 'w-kroki',
    dzien: dzien(START_DEMO, index),
    wartosc,
    zrodlo: 'wearable',
  }));

  for (let index = 0; index < 8; index += 1) {
    pomiary.push({
      wyzwanieId: 'w-sen',
      dzien: dzien(START_DEMO, index + 4),
      wartosc: index === 3 ? 360 : 435,
      zrodlo: 'wearable',
    });
  }

  return { zapisy, pomiary };
}

/**
 * Punkty pozostałych uczestników — wyłącznie pseudonimy i przydział do zespołu.
 * Zespół „Serwis" ma poniżej dziesięciu osób i dlatego nie pojawi się
 * w rankingu; to nie jest brak danych, tylko działający próg.
 */
export const KOHORTA: readonly PunktyUczestnika[] = [
  ...Array.from({ length: 14 }, (_, i) => ({
    subjectRef: `psd-prod-${i}`,
    zespol: ZESPOL_UCZESTNIKA,
    punkty: 60 + i * 17,
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    subjectRef: `psd-biuro-${i}`,
    zespol: 'Biuro',
    punkty: 90 + i * 21,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    subjectRef: `psd-serwis-${i}`,
    zespol: 'Serwis',
    punkty: 300 + i * 30,
  })),
];
