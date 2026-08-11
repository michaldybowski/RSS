/**
 * Rejestr zgód — lista zdarzeń tylko do dopisywania.
 *
 * Nie przechowujemy stanu „zgoda tak/nie", tylko historię udzieleń i wycofań.
 * Stan bieżący jest z niej wyliczany. Dzięki temu na pytanie „na co i kiedy
 * ta osoba się zgodziła" odpowiadamy zawsze, także po wielu zmianach.
 */

import { definitionOf } from './definitions.ts';
import type {
  ConsentCode,
  ConsentEvidence,
  ConsentLedger,
  ConsentStatus,
} from './types.ts';

export function grant(
  ledger: ConsentLedger,
  code: ConsentCode,
  at: string,
  evidence: ConsentEvidence,
): ConsentLedger {
  const definition = definitionOf(code);
  return [
    ...ledger,
    { kind: 'granted', code, version: definition.version, at, evidence },
  ];
}

/**
 * Wycofanie jest zawsze dozwolone — także dla zgód wymaganych do działania
 * programu. Blokowanie wycofania „bo bez tego nic nie zadziała" unieważniłoby
 * dobrowolność zgody. Skutek opisuje `withdrawalEffect` definicji.
 */
export function withdraw(
  ledger: ConsentLedger,
  code: ConsentCode,
  at: string,
  evidence: ConsentEvidence,
): ConsentLedger {
  definitionOf(code);
  return [...ledger, { kind: 'withdrawn', code, at, evidence }];
}

export function statusOf(ledger: ConsentLedger, code: ConsentCode): ConsentStatus {
  const definition = definitionOf(code);
  const events = ledger.filter((event) => event.code === code);
  const last = events.at(-1);

  if (last === undefined) {
    return { code, granted: false, requiresRenewal: false };
  }

  if (last.kind === 'withdrawn') {
    return { code, granted: false, requiresRenewal: false, withdrawnAt: last.at };
  }

  return {
    code,
    granted: true,
    grantedVersion: last.version,
    grantedAt: last.at,
    // Zgoda na starszą treść nie przenosi się na nową. Zmiana treści to nowa
    // zgoda, nie aktualizacja istniejącej — inaczej „zgodziłem się" znaczyłoby
    // coś innego niż to, co osoba faktycznie przeczytała.
    requiresRenewal: last.version !== definition.version,
  };
}

export function statuses(ledger: ConsentLedger, codes: readonly ConsentCode[]): ConsentStatus[] {
  return codes.map((code) => statusOf(ledger, code));
}

/** Zgody aktywne: udzielone na bieżącą wersję treści i niewycofane. */
export function isActive(ledger: ConsentLedger, code: ConsentCode): boolean {
  const status = statusOf(ledger, code);
  return status.granted && !status.requiresRenewal;
}

/** Pełna historia zdarzeń dla jednej zgody — do eksportu z art. 15. */
export function historyOf(ledger: ConsentLedger, code: ConsentCode): ConsentLedger {
  return ledger.filter((event) => event.code === code);
}
