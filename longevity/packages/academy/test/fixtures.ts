import type { Assessment, RedFlag, RiskCategory, ScoreComponent } from '@longevity/core';

import type { Material, Quiz, Sciezka } from '../src/index.ts';

export function material(overrides: Partial<Material> = {}): Material {
  return {
    id: 'm-sen',
    tytul: 'Higiena snu w pięć minut',
    typ: 'lekcja',
    opis: 'Rytm dobowy, światło i temperatura sypialni.',
    czasTrwaniaMin: 12,
    filary: ['Sen'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    ...overrides,
  };
}

export const KATALOG: readonly Material[] = [
  material(),
  material({
    id: 'm-ruch',
    tytul: 'Rozgrzewka przy biurku',
    typ: 'lekcja',
    opis: 'Krótka sekwencja bez sprzętu.',
    czasTrwaniaMin: 8,
    filary: ['Ruch'],
  }),
  material({
    id: 'm-hiit',
    tytul: 'Trening interwałowy — wprowadzenie',
    typ: 'webinar',
    opis: 'Zasady pracy na wysokim tętnie.',
    czasTrwaniaMin: 40,
    filary: ['Ruch'],
    intensywnosc: 'wysoka',
  }),
  material({
    id: 'm-zywienie',
    tytul: 'Talerz zdrowego żywienia',
    typ: 'artykul',
    opis: 'Proporcje makroskładników w praktyce.',
    czasTrwaniaMin: 15,
    filary: ['Żywienie'],
    quizId: 'q-zywienie',
  }),
  material({
    id: 'm-prime',
    tytul: 'Protokół regeneracji PRIME',
    typ: 'zeszyt',
    czasTrwaniaMin: 30,
    filary: ['Regeneracja'],
    pakiety: ['prime'],
  }),
  material({
    id: 'm-szkic',
    tytul: 'Szkic redakcyjny',
    czasTrwaniaMin: 5,
    filary: ['Sen'],
    opublikowana: false,
  }),
  material({
    id: 'm-wycofany',
    tytul: 'Materiał wycofany',
    czasTrwaniaMin: 10,
    filary: ['Stres'],
    wycofany: true,
  }),
];

export const QUIZ: Quiz = {
  id: 'q-zywienie',
  materialId: 'm-zywienie',
  pytania: [
    {
      id: 'p1',
      tresc: 'Jaką część talerza zajmują warzywa i owoce?',
      odpowiedzi: ['jedną czwartą', 'połowę', 'trzy czwarte'],
      poprawna: 1,
      wyjasnienie: 'Połowa talerza to warzywa i owoce, z przewagą warzyw.',
    },
    {
      id: 'p2',
      tresc: 'Który tłuszcz jest zalecany do sałatek?',
      odpowiedzi: ['olej rzepakowy', 'smalec', 'margaryna twarda'],
      poprawna: 0,
      wyjasnienie: 'Oleje roślinne zawierają korzystne kwasy nienasycone.',
    },
    {
      id: 'p3',
      tresc: 'Ile posiłków dziennie zaleca się w typowym planie?',
      odpowiedzi: ['jeden', 'trzy do pięciu', 'osiem'],
      poprawna: 1,
      wyjasnienie: 'Trzy do pięciu posiłków ułatwia utrzymanie stałej podaży energii.',
    },
  ],
};

export const SCIEZKA: Sciezka = {
  id: 's-podstawy',
  nazwa: 'Podstawy długowieczności',
  opis: 'Cztery moduły wprowadzające.',
  pakiety: ['light', 'pro', 'enterprise'],
  moduly: [
    { materialId: 'm-sen', obowiazkowy: true },
    { materialId: 'm-ruch', obowiazkowy: true },
    { materialId: 'm-zywienie', obowiazkowy: true },
    { materialId: 'm-hiit', obowiazkowy: false },
  ],
};

export function flaga(code: string, level: RedFlag['level'] = 'CZERWONA'): RedFlag {
  return { code, level, message: `Komunikat dla ${code}.`, rulesetVersion: '0.1.0-draft' };
}

const SKLADOWE: readonly ScoreComponent[] = [
  'metaboliczna',
  'sprawnościowa',
  'sen',
  'odżywianie',
  'stres',
  'profilaktyka',
];

export function ocena(
  flags: readonly RedFlag[] = [],
  kategoria?: RiskCategory,
  wyniki: Partial<Record<ScoreComponent, number>> = {},
): Assessment {
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
    healthScore: {
      overall: 70,
      components: SKLADOWE.map((component) => ({
        component,
        score: wyniki[component] ?? 80,
        contributions: [],
      })),
      scoringVersion: '1.0.0',
    },
    generatePlan: riskCategory !== 'CZERWONA',
    constraints: [],
    rulesetVersion: '0.1.0-draft',
    mode: 'synthetic',
  };
}
