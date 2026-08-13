/**
 * Czerwone flagi — zestaw reguł ze specyfikacji 7.3.
 *
 * STATUS: wersja robocza. Progi, poziomy i treści komunikatów wymagają
 * imiennej akceptacji lekarza (decyzja 8). Do tego czasu `RULESET_STATUS`
 * pozostaje `draft`, a dane rzeczywistego uczestnika są blokowane.
 *
 * Reguły są deterministyczne i jawne — model językowy nie bierze udziału
 * w ich wyznaczaniu i nie może ich zmienić (ADR-03).
 */

import type { DerivedMetrics, FlagLevel, ParticipantIntake, RedFlag } from './types.ts';
import { labsAgeInMonths } from './calculations.ts';
import { RULESET_VERSION } from './ruleset.ts';

export interface FlagContext {
  intake: ParticipantIntake;
  derived: DerivedMetrics;
  /** Data odniesienia dla reguł zależnych od czasu (np. wiek badań). */
  now: Date;
}

interface FlagRule {
  code: string;
  level: FlagLevel;
  message: string;
  applies: (ctx: FlagContext) => boolean;
}

/**
 * Kolejność ma znaczenie tylko dla prezentacji — flagi CZERWONE pierwsze,
 * żeby uczestnik zobaczył blokujące zanim dojdzie do informacyjnych.
 */
/**
 * Flagi, przy których wysiłek fizyczny jest przeciwwskazany do czasu oceny
 * lekarskiej.
 *
 * Lista mieszka tutaj, przy regułach, a nie w pakietach, które z niej korzystają
 * (@longevity/challenges — blokada wyzwań, @longevity/academy — ostrzeżenie przy
 * treściach o wysokiej intensywności). Dwie kopie tej samej listy medycznej
 * rozjeżdżają się przy pierwszej zmianie progów: lekarz dopisuje flagę w jednym
 * miejscu, a drugie dalej przepuszcza wysiłek.
 *
 * Zmiana tej listy wymaga akceptacji medycznej tak samo jak zmiana progów.
 */
export const FLAGI_PRZECIWWSKAZUJACE_WYSILEK: readonly string[] = [
  'FLAG_SYNCOPE',
  'FLAG_CHEST_PAIN',
  'FLAG_BMI_EXTREME',
  'FLAG_EATING_DISORDER',
];

export const FLAG_RULES: readonly FlagRule[] = [
  {
    code: 'FLAG_GLUCOSE_HIGH',
    level: 'CZERWONA',
    message:
      'Glukoza na czczo powyżej 126 mg/dl. Wynik wymaga oceny lekarskiej przed rozpoczęciem programu.',
    applies: ({ intake }) => (intake.labs?.glucoseMgDl ?? 0) > 126,
  },
  {
    code: 'FLAG_HBA1C_HIGH',
    level: 'CZERWONA',
    message: 'HbA1c powyżej 6,5%. Wynik wymaga oceny lekarskiej przed rozpoczęciem programu.',
    applies: ({ intake }) => (intake.labs?.hba1cPct ?? 0) > 6.5,
  },
  {
    code: 'FLAG_SYNCOPE',
    level: 'CZERWONA',
    message:
      'Zgłoszone omdlenia. Przed podjęciem wysiłku fizycznego konieczna jest konsultacja lekarska.',
    applies: ({ intake }) => intake.history.syncope,
  },
  {
    code: 'FLAG_CHEST_PAIN',
    level: 'CZERWONA',
    message:
      'Ból w klatce piersiowej przy wysiłku. Objaw wymaga pilnej oceny kardiologicznej przed startem.',
    applies: ({ intake }) => intake.history.exertionalChestPain,
  },
  {
    code: 'FLAG_EATING_DISORDER',
    level: 'CZERWONA',
    message:
      'Zgłoszone zaburzenia odżywiania. Program redukcji masy ciała wymaga prowadzenia specjalistycznego.',
    applies: ({ intake }) => intake.history.eatingDisorder,
  },
  {
    code: 'FLAG_BMI_EXTREME',
    level: 'CZERWONA',
    message:
      'BMI poza zakresem, w którym program może być prowadzony bez nadzoru lekarza (poniżej 17 lub powyżej 40).',
    applies: ({ derived }) => derived.bmi < 17 || derived.bmi > 40,
  },
  {
    code: 'FLAG_GLP1_ACTIVE',
    level: 'ŻÓŁTA',
    message:
      'Leczenie GLP-1/GIP. Plan wymaga modułu monitoringu glikemii i uzgodnienia dawki z lekarzem prowadzącym.',
    applies: ({ intake }) => intake.medications.glp1OrGip,
  },
  {
    code: 'FLAG_HYPERTENSION',
    level: 'ŻÓŁTA',
    message:
      'Leczone nadciśnienie. Plan treningowy wymaga modyfikacji i potwierdzenia braku przeciwwskazań.',
    applies: ({ intake }) => intake.medications.hypertensionTreated,
  },
  {
    code: 'FLAG_APNEA_SUSPECT',
    level: 'ŻÓŁTA',
    message:
      'Współwystępowanie chrapania, BMI powyżej 30 i zmęczenia dziennego. Wskazana diagnostyka w kierunku bezdechu sennego.',
    applies: ({ intake, derived }) =>
      intake.history.snoring && derived.bmi > 30 && intake.history.daytimeFatigue,
  },
  {
    code: 'FLAG_CRP_HIGH',
    level: 'ŻÓŁTA',
    message: 'CRP powyżej 3 mg/l. Wskazana ocena przyczyny stanu zapalnego.',
    applies: ({ intake }) => (intake.labs?.crpMgL ?? 0) > 3,
  },
  {
    code: 'FLAG_STRESS_HIGH',
    level: 'ŻÓŁTA',
    message:
      'Deklarowany poziom stresu 8 lub wyższy. Plan priorytetyzuje regenerację przed intensyfikacją treningu.',
    applies: ({ intake }) => intake.lifestyle.stressLevel >= 8,
  },
  {
    code: 'FLAG_PSYCH_MEDS',
    level: 'ŻÓŁTA',
    message:
      'Przyjmowane leki psychotropowe. Zmiany w diecie i aktywności wymagają uzgodnienia z lekarzem prowadzącym.',
    applies: ({ intake }) => intake.medications.psychotropics,
  },
  {
    code: 'FLAG_LABS_STALE',
    level: 'ŻÓŁTA',
    message:
      'Ostatnie badania starsze niż 12 miesięcy. Przed startem zalecany Panel Bazowy Longevity.',
    applies: ({ intake, now }) => {
      const months = labsAgeInMonths(intake.labs, now);
      return months === undefined || months > 12;
    },
  },
];

export function evaluateRedFlags(ctx: FlagContext): RedFlag[] {
  return FLAG_RULES.filter((rule) => rule.applies(ctx)).map((rule) => ({
    code: rule.code,
    level: rule.level,
    message: rule.message,
    rulesetVersion: RULESET_VERSION,
  }));
}
