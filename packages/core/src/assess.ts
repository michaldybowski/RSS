/**
 * Etapy B–F pipeline'u (specyfikacja 8): normalizacja → wyliczenia →
 * reguły → kategoria ryzyka. Wszystko przed wywołaniem modelu językowego.
 *
 * `mode` rozstrzyga, czy wolno przetwarzać dane rzeczywistej osoby.
 * Dopóki zestaw reguł ma status `draft`, tryb `real` rzuca wyjątkiem.
 */

import type { DerivedMetrics, ParticipantIntake, RedFlag, RiskCategory } from './types.ts';
import { deriveMetrics } from './calculations.ts';
import { evaluateRedFlags } from './redFlags.ts';
import { classifyRisk, planConstraints, shouldGeneratePlan } from './riskCategory.ts';
import { computeHealthScore, type HealthScore } from './healthScore.ts';
import { assertRulesetApprovedForRealData, RULESET_VERSION } from './ruleset.ts';

export type AssessmentMode = 'synthetic' | 'real';

export interface Assessment {
  derived: DerivedMetrics;
  flags: readonly RedFlag[];
  riskCategory: RiskCategory;
  healthScore: HealthScore;
  generatePlan: boolean;
  constraints: readonly string[];
  rulesetVersion: string;
  mode: AssessmentMode;
}

export interface AssessOptions {
  mode: AssessmentMode;
  /** Data odniesienia dla reguł zależnych od czasu. Wstrzykiwana, żeby wynik był powtarzalny. */
  now: Date;
}

export function assess(intake: ParticipantIntake, options: AssessOptions): Assessment {
  if (options.mode === 'real') {
    assertRulesetApprovedForRealData();
  }

  const derived = deriveMetrics(intake);
  const flags = evaluateRedFlags({ intake, derived, now: options.now });
  const riskCategory = classifyRisk(flags);

  return {
    derived,
    flags,
    riskCategory,
    healthScore: computeHealthScore(intake, derived, options.now),
    generatePlan: shouldGeneratePlan(riskCategory),
    constraints: planConstraints(riskCategory),
    rulesetVersion: RULESET_VERSION,
    mode: options.mode,
  };
}
