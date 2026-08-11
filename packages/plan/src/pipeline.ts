/**
 * Pipeline generowania planu — etapy G–J ze specyfikacji 8.
 *
 * Wejście: ocena z silnika reguł (już policzona) i tryb wynikający ze zgód.
 * Wyjście: plan, raport ryzyk albo zadanie w kolejce ręcznej. Trzeci wynik
 * jest równoprawny — pipeline, który po trzech nieudanych próbach oddaje
 * cokolwiek, jest gorszy od takiego, który mówi „to wymaga człowieka".
 */

import type { Assessment, ParticipantIntake, PlanPreferences } from '@longevity/core';
import { buildModelPayload, type ModelPayload } from '@longevity/model-payload';

import { checkGuardrails, type GuardrailViolation } from './guardrails.ts';
import { DISCLAIMER, PLAN_SCHEMA_DESCRIPTION, type Plan } from './plan.ts';
import { buildReferrals, type Referrals } from './referrals.ts';
import { validatePlanStructure, type StructureIssue } from './validate.ts';

export interface ModelRequest {
  payload: ModelPayload;
  schema: typeof PLAN_SCHEMA_DESCRIPTION;
  /** Uwagi z poprzedniej próby. Pusta lista przy pierwszym podejściu. */
  feedback: readonly string[];
}

export interface ModelClient {
  generatePlan: (request: ModelRequest) => Promise<unknown>;
}

/** Tryb wynikający ze stanu zgód — patrz @longevity/consent. */
export type GenerationMode = 'automatyczna' | 'reczna' | 'zablokowana';

export interface PipelineInput {
  requestId: string;
  intake: ParticipantIntake;
  assessment: Assessment;
  preferences: PlanPreferences;
  mode: GenerationMode;
  client: ModelClient;
  maxAttempts?: number;
}

export interface RiskReport {
  riskCategory: Assessment['riskCategory'];
  flags: Assessment['flags'];
  referrals: Referrals;
  disclaimer: string;
}

export interface Attempt {
  number: number;
  structureIssues: readonly StructureIssue[];
  guardrailViolations: readonly GuardrailViolation[];
  error?: string;
}

export type PipelineResult =
  | { kind: 'plan'; plan: Plan; referrals: Referrals; disclaimer: string; attempts: readonly Attempt[] }
  | { kind: 'raport_ryzyk'; report: RiskReport; reason: 'kategoria_czerwona' }
  | {
      kind: 'kolejka_reczna';
      reason: 'sciezka_reczna' | 'model_nie_spelnil_wymagan';
      referrals: Referrals;
      attempts: readonly Attempt[];
    }
  | { kind: 'zablokowane'; reason: 'brak_zgody' };

export async function generatePlan(input: PipelineInput): Promise<PipelineResult> {
  const { intake, assessment, preferences, mode } = input;

  if (mode === 'zablokowana') {
    return { kind: 'zablokowane', reason: 'brak_zgody' };
  }

  const referrals = buildReferrals(intake, assessment);

  // Kategoria CZERWONA zatrzymuje pipeline przed modelem. Nie „generuj plan
  // ostrożniej" — nie generuj wcale (specyfikacja 7.2).
  if (!assessment.generatePlan) {
    return {
      kind: 'raport_ryzyk',
      reason: 'kategoria_czerwona',
      report: {
        riskCategory: assessment.riskCategory,
        flags: assessment.flags,
        referrals,
        disclaimer: DISCLAIMER,
      },
    };
  }

  // Sprzeciw wobec przetwarzania przez AI (art. 21/22) — ocena ryzyka i
  // skierowania powstają tak samo, plan pisze specjalista.
  if (mode === 'reczna') {
    return { kind: 'kolejka_reczna', reason: 'sciezka_reczna', referrals, attempts: [] };
  }

  const payload = buildModelPayload({
    requestId: input.requestId,
    intake,
    assessment,
    preferences,
  });

  const maxAttempts = input.maxAttempts ?? 3;
  const attempts: Attempt[] = [];
  let feedback: readonly string[] = [];

  for (let number = 1; number <= maxAttempts; number += 1) {
    let raw: unknown;

    try {
      raw = await input.client.generatePlan({ payload, schema: PLAN_SCHEMA_DESCRIPTION, feedback });
    } catch (error) {
      attempts.push({
        number,
        structureIssues: [],
        guardrailViolations: [],
        error: error instanceof Error ? error.message : String(error),
      });
      feedback = ['Poprzednia próba zakończyła się błędem. Zwróć poprawny obiekt JSON.'];
      continue;
    }

    const structure = validatePlanStructure(raw);

    if (!structure.ok) {
      attempts.push({ number, structureIssues: structure.issues, guardrailViolations: [] });
      feedback = structure.issues.map((issue) => `${issue.path}: ${issue.message}`);
      continue;
    }

    const violations = checkGuardrails(structure.value, assessment, preferences);

    if (violations.length > 0) {
      attempts.push({ number, structureIssues: [], guardrailViolations: violations });
      feedback = violations.map((violation) => violation.feedback);
      continue;
    }

    attempts.push({ number, structureIssues: [], guardrailViolations: [] });
    return { kind: 'plan', plan: structure.value, referrals, disclaimer: DISCLAIMER, attempts };
  }

  return {
    kind: 'kolejka_reczna',
    reason: 'model_nie_spelnil_wymagan',
    referrals,
    attempts,
  };
}

/** Skrót dla panelu admina: dlaczego zadanie trafiło do kolejki ręcznej. */
export function summarizeFailure(attempts: readonly Attempt[]): readonly string[] {
  return attempts.flatMap((attempt) => [
    ...(attempt.error !== undefined ? [`Próba ${attempt.number}: ${attempt.error}`] : []),
    ...attempt.structureIssues.map((issue) => `Próba ${attempt.number}: ${issue.path} — ${issue.message}`),
    ...attempt.guardrailViolations.map((violation) => `Próba ${attempt.number}: ${violation.message}`),
  ]);
}
