/**
 * Bramki zgód — które operacje wymagają czego.
 *
 * Mapa jest zamknięta: nowa operacja dotykająca danych osobowych musi tu trafić
 * świadomie. Domyślnie „brak wpisu" oznacza brak bramki, więc wpis jest decyzją,
 * a nie efektem ubocznym.
 */

import { definitionOf } from './definitions.ts';
import { isActive, statusOf } from './ledger.ts';
import type { ConsentCode, ConsentLedger, ConsentStatus, GatedOperation } from './types.ts';

export const OPERATION_REQUIREMENTS: Readonly<Record<GatedOperation, readonly ConsentCode[]>> = {
  intake_submit: ['regulamin', 'dane_zdrowotne'],
  plan_generate: ['regulamin', 'dane_zdrowotne', 'przetwarzanie_ai'],
  clinician_view: ['dane_zdrowotne', 'udostepnienie_lekarzowi'],
  wearable_link: ['dane_zdrowotne', 'wearables'],
  marketing_send: ['komunikacja_marketingowa'],
};

export interface GateResult {
  allowed: boolean;
  missing: readonly ConsentStatus[];
}

export function checkOperation(ledger: ConsentLedger, operation: GatedOperation): GateResult {
  const missing = OPERATION_REQUIREMENTS[operation]
    .filter((code) => !isActive(ledger, code))
    .map((code) => statusOf(ledger, code));

  return { allowed: missing.length === 0, missing };
}

export class ConsentRequiredError extends Error {
  constructor(
    readonly operation: GatedOperation,
    readonly missing: readonly ConsentStatus[],
  ) {
    const details = missing
      .map((status) => {
        const title = definitionOf(status.code).title;
        return status.requiresRenewal ? `${title} (treść uległa zmianie)` : title;
      })
      .join(', ');
    super(`Operacja "${operation}" wymaga zgody: ${details}.`);
    this.name = 'ConsentRequiredError';
  }
}

export function assertOperation(ledger: ConsentLedger, operation: GatedOperation): void {
  const result = checkOperation(ledger, operation);
  if (!result.allowed) throw new ConsentRequiredError(operation, result.missing);
}

export type PlanGenerationMode = 'automatyczna' | 'reczna' | 'zablokowana';

/**
 * Sprzeciw wobec zautomatyzowanego przetwarzania (art. 21/22) realizujemy jako
 * wycofanie zgody na AI: ocena ryzyka pozostaje — jest deterministyczna i nie
 * korzysta z modelu — a plan przygotowuje specjalista.
 *
 * To jest różnica między „nie zgadzam się na AI" a „rezygnuję z programu",
 * i system musi ją widzieć.
 */
export function planGenerationMode(ledger: ConsentLedger): PlanGenerationMode {
  const podstawa = isActive(ledger, 'regulamin') && isActive(ledger, 'dane_zdrowotne');
  if (!podstawa) return 'zablokowana';
  return isActive(ledger, 'przetwarzanie_ai') ? 'automatyczna' : 'reczna';
}

/**
 * Zgody, których brakuje do zakończenia rejestracji. Pozostałe zbierane są
 * dopiero w momencie użycia funkcji, której dotyczą — pytanie o wearables
 * na powitanie jest pytaniem o zgodę, której nikt jeszcze nie potrzebuje.
 */
export function pendingOnboardingConsents(ledger: ConsentLedger): readonly ConsentCode[] {
  return OPERATION_REQUIREMENTS.intake_submit.filter((code) => !isActive(ledger, code));
}

/**
 * Operacje, które przestaną działać po wycofaniu danej zgody. Pokazywane
 * uczestnikowi przed potwierdzeniem — wycofanie ma być świadome, a nie zaskakujące.
 */
export function operationsAffectedByWithdrawal(code: ConsentCode): readonly GatedOperation[] {
  return (Object.keys(OPERATION_REQUIREMENTS) as GatedOperation[]).filter((operation) =>
    OPERATION_REQUIREMENTS[operation].includes(code),
  );
}
