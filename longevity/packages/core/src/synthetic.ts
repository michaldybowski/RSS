/**
 * Generator danych syntetycznych.
 *
 * Prototyp Fazy A działa wyłącznie na danych syntetycznych — dane rzeczywistych
 * osób nie trafiają do systemu przed zamknięciem bramki z sekcji 12.6
 * specyfikacji. Ten moduł jest jedynym źródłem uczestników w demie i testach.
 */

import type { ParticipantIntake } from './types.ts';

type DeepPartial<T> = {
  [K in keyof T]?:
    | (T[K] extends readonly unknown[]
        ? T[K]
        : T[K] extends object
          ? DeepPartial<T[K]>
          : T[K])
    | undefined;
};

const BASE: ParticipantIntake = {
  ageYears: 42,
  sex: 'M',
  anthropometry: { weightKg: 84, heightCm: 180, waistCm: 92, hipCm: 102 },
  labs: {
    drawnAt: '2026-05-10',
    glucoseMgDl: 92,
    hba1cPct: 5.3,
    insulinUIUmL: 7,
    ldlMgDl: 110,
    hdlMgDl: 52,
    triglyceridesMgDl: 120,
    vitaminDNgMl: 34,
    ferritinNgMl: 90,
    tshMIUL: 1.8,
    crpMgL: 1.1,
  },
  medications: {
    glp1OrGip: false,
    hypertensionTreated: false,
    psychotropics: false,
    thyroidHormones: false,
  },
  history: {
    syncope: false,
    exertionalChestPain: false,
    eatingDisorder: false,
    snoring: false,
    daytimeFatigue: false,
    chronicConditions: [],
    familyHistory: [],
  },
  lifestyle: {
    sleepHoursWeekday: 7.5,
    sleepQuality: 4,
    nightWakeups: 0,
    trainingDaysPerWeek: 3,
    stepsPerDay: 9000,
    stressLevel: 4,
    mealsPerDay: 4,
    waterIntake: '2-3l',
    vegetableServingsPerDay: 5,
    alcohol: 'okazjonalnie',
    nicotine: 'nie',
    preventiveScreeningsUpToDate: true,
  },
};

/**
 * Uczestnik odniesienia: zdrowy, bez flag. Nadpisania pozwalają zbudować
 * dowolny przypadek brzegowy bez powtarzania całej struktury.
 */
export function syntheticIntake(overrides: DeepPartial<ParticipantIntake> = {}): ParticipantIntake {
  return {
    ...BASE,
    ...overrides,
    anthropometry: { ...BASE.anthropometry, ...overrides.anthropometry },
    // `'labs' in overrides` zamiast sprawdzenia na undefined — jawne
    // `labs: undefined` musi umieć wyzerować panel, a nie odziedziczyć bazowy.
    labs: !('labs' in overrides)
      ? BASE.labs
      : overrides.labs === undefined
        ? undefined
        : { ...BASE.labs, ...overrides.labs },
    medications: { ...BASE.medications, ...overrides.medications },
    history: { ...BASE.history, ...overrides.history },
    lifestyle: { ...BASE.lifestyle, ...overrides.lifestyle },
  } as ParticipantIntake;
}

/** Data odniesienia dla testów i demo — stała, żeby wyniki były powtarzalne. */
export const SYNTHETIC_NOW = new Date('2026-07-26T00:00:00Z');
