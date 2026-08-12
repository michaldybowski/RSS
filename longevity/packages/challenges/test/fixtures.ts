import type { Assessment, RedFlag, RiskCategory } from '@longevity/core';

import type { Metryka, Pomiar, Wyzwanie, Zapis } from '../src/index.ts';

export function wyzwanie(overrides: Partial<Wyzwanie> = {}): Wyzwanie {
  return {
    id: 'w-kroki',
    nazwa: '10 tysięcy kroków',
    typ: 'indywidualne',
    metryka: 'kroki',
    cel: 10_000,
    czasTrwaniaDni: 30,
    punkty: 10,
    pakiety: ['light', 'pro', 'enterprise'],
    ...overrides,
  };
}

export const WYZWANIE_SNU = wyzwanie({
  id: 'w-sen',
  nazwa: 'Siedem godzin snu',
  metryka: 'sen',
  cel: 420,
  czasTrwaniaDni: 21,
  punkty: 8,
});

export const WYZWANIE_ZESPOLOWE = wyzwanie({
  id: 'w-zespol',
  nazwa: 'Zespołowe minuty ruchu',
  typ: 'zespolowe',
  metryka: 'trening',
  cel: 30,
  czasTrwaniaDni: 14,
  punkty: 12,
});

export function flaga(code: string, level: RedFlag['level'] = 'CZERWONA'): RedFlag {
  return { code, level, message: `Komunikat dla ${code}.`, rulesetVersion: '0.1.0-draft' };
}

export function ocena(flags: readonly RedFlag[] = [], kategoria?: RiskCategory): Assessment {
  const riskCategory =
    kategoria ??
    (flags.some((f) => f.level === 'CZERWONA')
      ? 'CZERWONA'
      : flags.some((f) => f.level === 'ŻÓŁTA')
        ? 'ŻÓŁTA'
        : 'ZIELONA');

  return {
    derived: { bmi: 24, bmr: 1600, tdee: 2200 },
    flags,
    riskCategory,
    healthScore: { overall: 70, components: [], scoringVersion: '1.0.0' },
    generatePlan: riskCategory !== 'CZERWONA',
    constraints: [],
    rulesetVersion: '0.1.0-draft',
    mode: 'synthetic',
  };
}

export const zapis = (overrides: Partial<Zapis> = {}): Zapis => ({
  wyzwanieId: 'w-kroki',
  subjectRef: 'psd-001',
  od: '2026-09-01',
  ...overrides,
});

export function pomiar(dzien: string, wartosc: number, wyzwanieId = 'w-kroki'): Pomiar {
  return { wyzwanieId, dzien, wartosc, zrodlo: 'wearable' };
}

/** Ciąg dni od podanej daty. Ułatwia budowanie serii pomiarów w testach. */
export function dni(od: string, ile: number): string[] {
  const wynik: string[] = [];
  for (let i = 0; i < ile; i += 1) {
    wynik.push(new Date(Date.parse(od) + i * 86_400_000).toISOString().slice(0, 10));
  }
  return wynik;
}

export const METRYKI: readonly Metryka[] = ['kroki', 'sen', 'trening', 'nawyk', 'woda'];
