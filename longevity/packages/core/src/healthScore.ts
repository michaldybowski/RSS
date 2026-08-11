/**
 * Health Score (specyfikacja 7.1).
 *
 * Wynik 0–100 składany z sześciu ocen cząstkowych. Każda liczona z jawnego
 * zestawu reguł — deterministycznie, bez udziału modelu językowego (ADR-03).
 *
 * Wagi i progi są konfiguracją wersjonowaną. Zmiana metodyki nie wymaga
 * deploymentu, ale podbija `SCORING_VERSION` i nie przelicza wyników
 * historycznych — te zostają przy wersji, w której powstały.
 */

import type { DerivedMetrics, ParticipantIntake } from './types.ts';
import { labsAgeInMonths } from './calculations.ts';

export const SCORING_VERSION = '0.1.0-draft';

export type ScoreComponent =
  | 'metaboliczna'
  | 'sprawnościowa'
  | 'sen'
  | 'odżywianie'
  | 'stres'
  | 'profilaktyka';

export const COMPONENT_WEIGHTS: Readonly<Record<ScoreComponent, number>> = {
  metaboliczna: 0.25,
  sprawnościowa: 0.2,
  sen: 0.2,
  odżywianie: 0.15,
  stres: 0.1,
  profilaktyka: 0.1,
};

export interface Contribution {
  factor: string;
  points: number;
}

export interface ComponentScore {
  component: ScoreComponent;
  score: number;
  contributions: readonly Contribution[];
}

export interface HealthScore {
  overall: number;
  components: readonly ComponentScore[];
  scoringVersion: string;
}

/** Akumulator kar: start ze 100 punktów, każda reguła odejmuje z uzasadnieniem. */
class Penalties {
  private readonly items: Contribution[] = [];

  deduct(factor: string, points: number): void {
    if (points > 0) this.items.push({ factor, points: -points });
  }

  resolve(component: ScoreComponent): ComponentScore {
    const total = this.items.reduce((sum, item) => sum + item.points, 0);
    return {
      component,
      score: clamp(100 + total),
      contributions: this.items,
    };
  }
}

function metabolic(intake: ParticipantIntake, derived: DerivedMetrics): ComponentScore {
  const p = new Penalties();
  const { labs } = intake;

  if (derived.bmi >= 35) p.deduct('BMI ≥ 35', 30);
  else if (derived.bmi >= 30) p.deduct('BMI 30–35', 20);
  else if (derived.bmi >= 25) p.deduct('BMI 25–30', 10);
  else if (derived.bmi < 18.5) p.deduct('BMI < 18,5', 15);

  if (derived.whrCategory === 'wysoki') p.deduct('WHR wysoki', 15);
  else if (derived.whrCategory === 'podwyższony') p.deduct('WHR podwyższony', 8);

  if (labs?.glucoseMgDl !== undefined) {
    if (labs.glucoseMgDl > 126) p.deduct('Glukoza > 126 mg/dl', 25);
    else if (labs.glucoseMgDl >= 100) p.deduct('Glukoza 100–126 mg/dl', 12);
  }

  if (labs?.hba1cPct !== undefined) {
    if (labs.hba1cPct > 6.5) p.deduct('HbA1c > 6,5%', 25);
    else if (labs.hba1cPct >= 5.7) p.deduct('HbA1c 5,7–6,5%', 12);
  }

  if (derived.homaIr !== undefined && derived.homaIr > 2.5) p.deduct('HOMA-IR > 2,5', 15);

  if (labs?.ldlMgDl !== undefined && labs.ldlMgDl > 130) p.deduct('LDL > 130 mg/dl', 10);
  if (labs?.triglyceridesMgDl !== undefined && labs.triglyceridesMgDl > 150)
    p.deduct('Trójglicerydy > 150 mg/dl', 8);

  return p.resolve('metaboliczna');
}

function fitness(intake: ParticipantIntake): ComponentScore {
  const p = new Penalties();
  const { trainingDaysPerWeek, stepsPerDay } = intake.lifestyle;

  if (trainingDaysPerWeek <= 0) p.deduct('Brak regularnego treningu', 35);
  else if (trainingDaysPerWeek === 1) p.deduct('Trening 1× w tygodniu', 20);
  else if (trainingDaysPerWeek === 2) p.deduct('Trening 2× w tygodniu', 10);

  if (stepsPerDay !== undefined) {
    if (stepsPerDay < 4000) p.deduct('Poniżej 4 000 kroków dziennie', 25);
    else if (stepsPerDay < 7000) p.deduct('4 000–7 000 kroków dziennie', 12);
  }

  return p.resolve('sprawnościowa');
}

function sleep(intake: ParticipantIntake): ComponentScore {
  const p = new Penalties();
  const { sleepHoursWeekday, sleepQuality, nightWakeups } = intake.lifestyle;

  if (sleepHoursWeekday < 5) p.deduct('Poniżej 5 godzin snu', 35);
  else if (sleepHoursWeekday < 6) p.deduct('5–6 godzin snu', 25);
  else if (sleepHoursWeekday < 7) p.deduct('6–7 godzin snu', 12);
  else if (sleepHoursWeekday > 9) p.deduct('Powyżej 9 godzin snu', 8);

  p.deduct('Subiektywna jakość snu', (5 - sleepQuality) * 8);
  p.deduct('Wybudzenia nocne', nightWakeups * 7);

  return p.resolve('sen');
}

function nutrition(intake: ParticipantIntake): ComponentScore {
  const p = new Penalties();
  const { mealsPerDay, waterIntake, vegetableServingsPerDay, alcohol } = intake.lifestyle;

  if (mealsPerDay <= 1) p.deduct('Jeden posiłek dziennie lub mniej', 20);
  else if (mealsPerDay === 2) p.deduct('Dwa posiłki dziennie', 8);

  if (waterIntake === '<1l') p.deduct('Poniżej 1 l wody dziennie', 20);
  else if (waterIntake === '1-2l') p.deduct('1–2 l wody dziennie', 8);

  if (vegetableServingsPerDay !== undefined) {
    if (vegetableServingsPerDay < 2) p.deduct('Mniej niż 2 porcje warzyw dziennie', 20);
    else if (vegetableServingsPerDay < 4) p.deduct('2–4 porcje warzyw dziennie', 8);
  }

  if (alcohol === 'codziennie') p.deduct('Alkohol codziennie', 30);
  else if (alcohol === 'tygodniowo') p.deduct('Alkohol tygodniowo', 12);

  return p.resolve('odżywianie');
}

function stress(intake: ParticipantIntake): ComponentScore {
  const p = new Penalties();
  const level = clampRange(intake.lifestyle.stressLevel, 1, 10);
  p.deduct('Deklarowany poziom stresu', (level - 1) * 10);
  return p.resolve('stres');
}

function prevention(intake: ParticipantIntake, now: Date): ComponentScore {
  const p = new Penalties();

  if (!intake.lifestyle.preventiveScreeningsUpToDate)
    p.deduct('Badania profilaktyczne nieaktualne', 30);

  if (intake.lifestyle.nicotine === 'codziennie') p.deduct('Nikotyna codziennie', 40);
  else if (intake.lifestyle.nicotine === 'okazjonalnie') p.deduct('Nikotyna okazjonalnie', 15);

  const months = labsAgeInMonths(intake.labs, now);
  if (months === undefined) p.deduct('Brak wyników badań', 20);
  else if (months > 12) p.deduct('Badania starsze niż 12 miesięcy', 12);

  return p.resolve('profilaktyka');
}

export function computeHealthScore(
  intake: ParticipantIntake,
  derived: DerivedMetrics,
  now: Date,
): HealthScore {
  const components: readonly ComponentScore[] = [
    metabolic(intake, derived),
    fitness(intake),
    sleep(intake),
    nutrition(intake),
    stress(intake),
    prevention(intake, now),
  ];

  const overall = components.reduce(
    (sum, component) => sum + component.score * COMPONENT_WEIGHTS[component.component],
    0,
  );

  return {
    overall: Math.round(overall),
    components,
    scoringVersion: SCORING_VERSION,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
