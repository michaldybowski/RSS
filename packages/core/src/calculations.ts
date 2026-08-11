/**
 * Wyliczenia automatyczne (specyfikacja 7.4).
 *
 * Wszystko liczone po stronie serwera. Front może pokazywać podgląd,
 * ale nie jest źródłem prawdy.
 */

import type {
  Anthropometry,
  DerivedMetrics,
  LabPanel,
  ParticipantIntake,
  Sex,
  WhrCategory,
} from './types.ts';

export function bmi({ weightKg, heightCm }: Anthropometry): number {
  const heightM = heightCm / 100;
  return round(weightKg / (heightM * heightM), 1);
}

export function whr({ waistCm, hipCm }: Anthropometry): number | undefined {
  if (waistCm === undefined || hipCm === undefined || hipCm === 0) return undefined;
  return round(waistCm / hipCm, 2);
}

/**
 * Progi WHR wg WHO. Dla płci nieokreślonej stosujemy próg ostrożniejszy
 * (kobiecy) — fałszywie podwyższona kategoria kieruje na konsultację,
 * fałszywie prawidłowa przepuszcza ryzyko dalej.
 */
export function whrCategory(value: number, sex: Sex): WhrCategory {
  const thresholds = sex === 'M' ? { raised: 0.9, high: 1.0 } : { raised: 0.8, high: 0.85 };
  if (value >= thresholds.high) return 'wysoki';
  if (value >= thresholds.raised) return 'podwyższony';
  return 'prawidłowy';
}

/** Mifflin-St Jeor. Dla płci nieokreślonej — średnia ze stałych męskiej i żeńskiej. */
export function bmr(anthropometry: Anthropometry, ageYears: number, sex: Sex): number {
  const { weightKg, heightCm } = anthropometry;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const sexOffset = sex === 'M' ? 5 : sex === 'K' ? -161 : -78;
  return Math.round(base + sexOffset);
}

/**
 * Współczynnik aktywności z liczby dni treningowych i kroków.
 * Kroki, gdy dostępne, podbijają współczynnik — praca fizyczna bez treningu
 * na siłowni jest aktywnością, której sama liczba treningów nie widzi.
 */
export function activityFactor(trainingDaysPerWeek: number, stepsPerDay?: number): number {
  const fromTraining =
    trainingDaysPerWeek <= 0 ? 1.2 : trainingDaysPerWeek <= 2 ? 1.375 : trainingDaysPerWeek <= 4 ? 1.55 : 1.725;

  if (stepsPerDay === undefined) return fromTraining;

  const fromSteps = stepsPerDay < 5000 ? 1.2 : stepsPerDay < 8000 ? 1.375 : stepsPerDay < 12000 ? 1.55 : 1.725;
  return Math.max(fromTraining, fromSteps);
}

export function tdee(bmrValue: number, factor: number): number {
  return Math.round(bmrValue * factor);
}

/** HOMA-IR = (glukoza [mg/dl] × insulina [µIU/ml]) / 405. */
export function homaIr(labs: LabPanel | undefined): number | undefined {
  if (!labs?.glucoseMgDl || !labs.insulinUIUmL) return undefined;
  return round((labs.glucoseMgDl * labs.insulinUIUmL) / 405, 2);
}

export function deriveMetrics(intake: ParticipantIntake): DerivedMetrics {
  const { anthropometry, ageYears, sex, lifestyle, labs } = intake;

  const bmrValue = bmr(anthropometry, ageYears, sex);
  const whrValue = whr(anthropometry);
  const homa = homaIr(labs);

  return {
    bmi: bmi(anthropometry),
    bmr: bmrValue,
    tdee: tdee(bmrValue, activityFactor(lifestyle.trainingDaysPerWeek, lifestyle.stepsPerDay)),
    ...(whrValue !== undefined ? { whr: whrValue, whrCategory: whrCategory(whrValue, sex) } : {}),
    ...(homa !== undefined ? { homaIr: homa } : {}),
  };
}

/** Wiek badań w miesiącach względem podanej daty odniesienia. */
export function labsAgeInMonths(labs: LabPanel | undefined, now: Date): number | undefined {
  if (!labs?.drawnAt) return undefined;
  const drawn = new Date(labs.drawnAt);
  if (Number.isNaN(drawn.getTime())) return undefined;
  const months =
    (now.getFullYear() - drawn.getFullYear()) * 12 + (now.getMonth() - drawn.getMonth());
  return months < 0 ? 0 : months;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
