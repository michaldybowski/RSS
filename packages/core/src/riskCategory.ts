/**
 * Klasyfikacja ryzyka i reguła zatrzymania pipeline'u (specyfikacja 7.2).
 */

import type { RedFlag, RiskCategory } from './types.ts';

export function classifyRisk(flags: readonly RedFlag[]): RiskCategory {
  if (flags.some((flag) => flag.level === 'CZERWONA')) return 'CZERWONA';
  if (flags.some((flag) => flag.level === 'ŻÓŁTA')) return 'ŻÓŁTA';
  return 'ZIELONA';
}

/**
 * Przy kategorii CZERWONEJ pipeline zatrzymuje się przed warstwą narracyjną:
 * generowany jest wyłącznie raport ryzyk i skierowania. Reguła pochodzi
 * wprost z dokumentu kwietniowego (Etap 2) i jest nienegocjowalna dla modelu.
 */
export function shouldGeneratePlan(category: RiskCategory): boolean {
  return category !== 'CZERWONA';
}

export function planConstraints(category: RiskCategory): readonly string[] {
  switch (category) {
    case 'ZIELONA':
      return [];
    case 'ŻÓŁTA':
      return [
        'pakiet_konsultacyjny_wymagany',
        'intensywnosc_treningu_ograniczona',
        'monitoring_rozszerzony',
      ];
    case 'CZERWONA':
      return ['plan_niegenerowany', 'raport_ryzyk_i_skierowania'];
  }
}
