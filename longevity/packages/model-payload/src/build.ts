/**
 * Budowa ładunku dla modelu językowego — wyłącznie warstwa narracyjna planu.
 *
 * Zasada: model dostaje to, co zmienia treść planu, i nic poza tym.
 * Wyniki badań idą jako interpretacje, nie liczby; BMI, WHR i TDEE jako
 * przedziały; leki jako kategorie. Kategorii ryzyka i flag model nie może
 * zmienić — dostaje je jako fakt, nie jako pytanie (ADR-03).
 */

import type { Assessment, ParticipantIntake, PlanPreferences } from '@longevity/core';
import { assertNoForbiddenFields } from './forbidden.ts';

export type { PlanPreferences };

export interface ModelPayload {
  /** Identyfikator zapytania, nie użytkownika — do korelacji logów i ponowień. */
  requestId: string;
  demographics: {
    ageYears: number;
    sex: 'K' | 'M' | 'X';
  };
  anthropometryBands: {
    bmiBand: string;
    whrCategory?: string;
    tdeeBand: string;
  };
  clinical: {
    riskCategory: string;
    flagCodes: readonly string[];
    labInterpretations: readonly string[];
    medicationCategories: readonly string[];
    constraints: readonly string[];
  };
  lifestyle: {
    sleepHoursBand: string;
    sleepQuality: number;
    trainingDaysPerWeek: number;
    stepsBand?: string;
    stressLevel: number;
    mealsPerDay: number;
    waterIntake: string;
  };
  preferences: PlanPreferences;
  scoring: {
    overall: number;
    weakestComponents: readonly string[];
  };
}

export function bmiBand(bmi: number): string {
  if (bmi < 18.5) return 'niedowaga';
  if (bmi < 25) return 'prawidłowa';
  if (bmi < 30) return 'nadwaga';
  if (bmi < 35) return 'otyłość I';
  if (bmi < 40) return 'otyłość II';
  return 'otyłość III';
}

export function tdeeBand(tdee: number): string {
  const lower = Math.floor(tdee / 250) * 250;
  return `${lower}-${lower + 250} kcal`;
}

export function sleepHoursBand(hours: number): string {
  if (hours < 5) return '<5h';
  if (hours < 6) return '5-6h';
  if (hours < 7) return '6-7h';
  if (hours <= 9) return '7-9h';
  return '>9h';
}

export function stepsBand(steps: number): string {
  if (steps < 4000) return '<4000';
  if (steps < 7000) return '4000-7000';
  if (steps < 10000) return '7000-10000';
  return '>10000';
}

/**
 * Wyniki badań zamieniane na interpretacje. Model nie potrzebuje wiedzieć,
 * że HOMA-IR wynosi 4,2 — potrzebuje wiedzieć, że insulinooporność jest
 * potwierdzona, bo to zmienia dietę i rozkład węglowodanów.
 */
export function interpretLabs(intake: ParticipantIntake, homaIr: number | undefined): string[] {
  const out: string[] = [];
  const labs = intake.labs;
  if (!labs) return out;

  if (labs.glucoseMgDl !== undefined) {
    if (labs.glucoseMgDl > 126) out.push('glikemia_na_czczo_nieprawidlowa');
    else if (labs.glucoseMgDl >= 100) out.push('glikemia_na_czczo_graniczna');
  }
  if (labs.hba1cPct !== undefined) {
    if (labs.hba1cPct > 6.5) out.push('hba1c_podwyzszone');
    else if (labs.hba1cPct >= 5.7) out.push('hba1c_graniczne');
  }
  if (homaIr !== undefined && homaIr > 2.5) out.push('insulinoopornosc_potwierdzona');
  if (labs.ldlMgDl !== undefined && labs.ldlMgDl > 130) out.push('ldl_podwyzszony');
  if (labs.triglyceridesMgDl !== undefined && labs.triglyceridesMgDl > 150)
    out.push('trojglicerydy_podwyzszone');
  if (labs.hdlMgDl !== undefined && labs.hdlMgDl < 40) out.push('hdl_niski');
  if (labs.vitaminDNgMl !== undefined && labs.vitaminDNgMl < 30) out.push('witamina_d_niedobor');
  if (labs.ferritinNgMl !== undefined && labs.ferritinNgMl < 30) out.push('ferrytyna_niska');
  if (labs.tshMIUL !== undefined && (labs.tshMIUL < 0.4 || labs.tshMIUL > 4.0))
    out.push('tsh_poza_zakresem');
  if (labs.crpMgL !== undefined && labs.crpMgL > 3) out.push('stan_zapalny_podwyzszony');

  return out;
}

function medicationCategories(intake: ParticipantIntake): string[] {
  const out: string[] = [];
  if (intake.medications.glp1OrGip) out.push('glp1_gip_aktywny');
  if (intake.medications.hypertensionTreated) out.push('nadcisnienie_leczone');
  if (intake.medications.psychotropics) out.push('psychotropowe');
  if (intake.medications.thyroidHormones) out.push('hormony_tarczycy');
  return out;
}

export interface BuildPayloadInput {
  requestId: string;
  intake: ParticipantIntake;
  assessment: Assessment;
  preferences: PlanPreferences;
}

export function buildModelPayload(input: BuildPayloadInput): ModelPayload {
  const { requestId, intake, assessment, preferences } = input;
  const { derived, healthScore } = assessment;

  const weakest = [...healthScore.components]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((component) => component.component);

  const payload: ModelPayload = {
    requestId,
    demographics: {
      ageYears: intake.ageYears,
      sex: intake.sex,
    },
    anthropometryBands: {
      bmiBand: bmiBand(derived.bmi),
      tdeeBand: tdeeBand(derived.tdee),
      ...(derived.whrCategory !== undefined ? { whrCategory: derived.whrCategory } : {}),
    },
    clinical: {
      riskCategory: assessment.riskCategory,
      flagCodes: assessment.flags.map((flag) => flag.code),
      labInterpretations: interpretLabs(intake, derived.homaIr),
      medicationCategories: medicationCategories(intake),
      constraints: assessment.constraints,
    },
    lifestyle: {
      sleepHoursBand: sleepHoursBand(intake.lifestyle.sleepHoursWeekday),
      sleepQuality: intake.lifestyle.sleepQuality,
      trainingDaysPerWeek: intake.lifestyle.trainingDaysPerWeek,
      stressLevel: intake.lifestyle.stressLevel,
      mealsPerDay: intake.lifestyle.mealsPerDay,
      waterIntake: intake.lifestyle.waterIntake,
      ...(intake.lifestyle.stepsPerDay !== undefined
        ? { stepsBand: stepsBand(intake.lifestyle.stepsPerDay) }
        : {}),
    },
    preferences,
    scoring: {
      overall: healthScore.overall,
      weakestComponents: weakest,
    },
  };

  // Kontrola po konstrukcji — biała lista mogła zostać rozszerzona nieuważnie.
  assertNoForbiddenFields(payload);

  return payload;
}
