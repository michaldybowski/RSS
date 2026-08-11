/**
 * Wersjonowanie i status zestawu reguł medycznych.
 *
 * Decyzja 8 ze specyfikacji: progi czerwonych flag są propozycją roboczą do
 * czasu imiennej akceptacji lekarza. Blokada jest techniczna, nie proceduralna —
 * `assertRulesetApprovedForRealData` przerywa każdą ścieżkę, która próbowałaby
 * policzyć ryzyko dla danych rzeczywistego uczestnika na regułach w statusie draft.
 */

export const RULESET_VERSION = '0.1.0-draft';

export type RulesetStatus = 'draft' | 'approved';

export const RULESET_STATUS: RulesetStatus = 'draft';

/**
 * Wypełniane przy przejściu do statusu `approved`. Akceptacja jest wersją
 * zestawu reguł z datą i osobą, nie e-mailem (specyfikacja 7.3).
 */
export interface RulesetApproval {
  approvedBy: string;
  approvedAt: string;
  /** Zakres akceptacji: progi, poziomy flag, treści komunikatów, reguła STOP. */
  scope: readonly string[];
}

export const RULESET_APPROVAL: RulesetApproval | null = null;

export class RulesetNotApprovedError extends Error {
  constructor() {
    super(
      `Zestaw reguł ${RULESET_VERSION} ma status "${RULESET_STATUS}". ` +
        'Przetwarzanie danych rzeczywistego uczestnika jest zablokowane do czasu ' +
        'imiennej akceptacji lekarza (decyzja 8, specyfikacja 7.3).',
    );
    this.name = 'RulesetNotApprovedError';
  }
}

/**
 * Wywoływane na wejściu do pipeline'u dla danych produkcyjnych.
 * Ścieżka syntetyczna (prototyp, testy, demo) świadomie tego nie wywołuje —
 * dlatego blokada nie hamuje Fazy A.
 */
export function assertRulesetApprovedForRealData(): void {
  if (RULESET_STATUS !== 'approved' || RULESET_APPROVAL === null) {
    throw new RulesetNotApprovedError();
  }
}

export function isRulesetApproved(): boolean {
  return RULESET_STATUS === 'approved' && RULESET_APPROVAL !== null;
}
