import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSENT_DEFINITIONS,
  definitionOf,
  onboardingConsents,
  UnknownConsentError,
} from '../src/definitions.ts';
import { grant, historyOf, isActive, statusOf, withdraw } from '../src/ledger.ts';
import {
  assertOperation,
  checkOperation,
  ConsentRequiredError,
  OPERATION_REQUIREMENTS,
  operationsAffectedByWithdrawal,
  pendingOnboardingConsents,
  planGenerationMode,
} from '../src/gates.ts';
import type { ConsentCode, ConsentEvidence, ConsentLedger } from '../src/types.ts';

const EVIDENCE: ConsentEvidence = { ipHash: 'h1', userAgentHash: 'h2' };
const T0 = '2026-07-26T09:00:00Z';
const T1 = '2026-07-26T09:01:00Z';
const T2 = '2026-08-01T12:00:00Z';

function grantAll(codes: readonly ConsentCode[], at = T0): ConsentLedger {
  return codes.reduce<ConsentLedger>((ledger, code) => grant(ledger, code, at, EVIDENCE), []);
}

const PELNA_ZGODA = grantAll(['regulamin', 'dane_zdrowotne', 'przetwarzanie_ai']);

describe('katalog zgód', () => {
  test('kody są unikalne', () => {
    const codes = CONSENT_DEFINITIONS.map((definition) => definition.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  test('dane zdrowotne mają podstawę z art. 9', () => {
    assert.equal(definitionOf('dane_zdrowotne').legalBasis, 'art9_2a_zgoda_wyrazna');
    assert.equal(definitionOf('udostepnienie_lekarzowi').legalBasis, 'art9_2a_zgoda_wyrazna');
    assert.equal(definitionOf('wearables').legalBasis, 'art9_2a_zgoda_wyrazna');
  });

  test('każda zgoda opisuje skutek wycofania', () => {
    for (const definition of CONSENT_DEFINITIONS) {
      assert.ok(definition.withdrawalEffect.length > 20, definition.code);
    }
  });

  test('treść każdej zgody dotyczy jednego celu', () => {
    // Zgoda pakietowa jest nieważna. Heurystyka: treść nie może zapowiadać
    // przetwarzania „w celach marketingowych i analitycznych i…".
    for (const definition of CONSENT_DEFINITIONS) {
      assert.ok(definition.text.length > 80, `${definition.code}: treść zbyt uboga`);
      assert.ok(
        !/zgadzam się na wszystko/iu.test(definition.text),
        `${definition.code}: zgoda pakietowa`,
      );
    }
  });

  test('w kroku 0 zbierane są tylko zgody potrzebne do startu', () => {
    const codes = onboardingConsents().map((definition) => definition.code);
    assert.deepEqual(codes.sort(), ['dane_zdrowotne', 'przetwarzanie_ai', 'regulamin']);
    assert.ok(!codes.includes('wearables' as ConsentCode));
  });

  test('nieznana zgoda jest błędem, nie cichym pominięciem', () => {
    assert.throws(() => definitionOf('nieistniejaca' as ConsentCode), UnknownConsentError);
  });
});

describe('rejestr zdarzeń', () => {
  test('brak zdarzeń oznacza brak zgody', () => {
    const status = statusOf([], 'dane_zdrowotne');
    assert.equal(status.granted, false);
    assert.equal(status.requiresRenewal, false);
  });

  test('udzielenie zapisuje wersję i moment', () => {
    const status = statusOf(grantAll(['dane_zdrowotne']), 'dane_zdrowotne');
    assert.equal(status.granted, true);
    assert.equal(status.grantedVersion, '1.0.0');
    assert.equal(status.grantedAt, T0);
  });

  test('wycofanie odbiera zgodę', () => {
    const ledger = withdraw(grantAll(['wearables']), 'wearables', T1, EVIDENCE);
    const status = statusOf(ledger, 'wearables');
    assert.equal(status.granted, false);
    assert.equal(status.withdrawnAt, T1);
  });

  test('zgodę można udzielić ponownie po wycofaniu', () => {
    let ledger = grantAll(['wearables']);
    ledger = withdraw(ledger, 'wearables', T1, EVIDENCE);
    ledger = grant(ledger, 'wearables', T2, EVIDENCE);

    assert.equal(isActive(ledger, 'wearables'), true);
    assert.equal(statusOf(ledger, 'wearables').grantedAt, T2);
  });

  test('rejestr jest tylko do dopisywania — historia zostaje', () => {
    let ledger = grantAll(['wearables']);
    ledger = withdraw(ledger, 'wearables', T1, EVIDENCE);
    ledger = grant(ledger, 'wearables', T2, EVIDENCE);

    assert.equal(historyOf(ledger, 'wearables').length, 3);
    assert.equal(ledger.length, 3);
  });

  test('operacje na rejestrze nie mutują poprzedniego stanu', () => {
    const przed = grantAll(['wearables']);
    withdraw(przed, 'wearables', T1, EVIDENCE);
    assert.equal(isActive(przed, 'wearables'), true);
  });

  test('zgoda na starszą wersję treści wymaga ponowienia', () => {
    const przestarzala: ConsentLedger = [
      { kind: 'granted', code: 'dane_zdrowotne', version: '0.9.0', at: T0, evidence: EVIDENCE },
    ];
    const status = statusOf(przestarzala, 'dane_zdrowotne');

    assert.equal(status.granted, true);
    assert.equal(status.requiresRenewal, true);
    assert.equal(isActive(przestarzala, 'dane_zdrowotne'), false);
  });
});

describe('bramki operacji', () => {
  test('każda operacja ma jawnie zdefiniowane wymagania', () => {
    for (const [operation, codes] of Object.entries(OPERATION_REQUIREMENTS)) {
      assert.ok(codes.length > 0, operation);
      for (const code of codes) assert.doesNotThrow(() => definitionOf(code));
    }
  });

  test('bez zgód nie da się złożyć kwestionariusza', () => {
    const result = checkOperation([], 'intake_submit');
    assert.equal(result.allowed, false);
    assert.equal(result.missing.length, 2);
    assert.throws(() => assertOperation([], 'intake_submit'), ConsentRequiredError);
  });

  test('komplet zgód otwiera złożenie i generowanie planu', () => {
    assert.equal(checkOperation(PELNA_ZGODA, 'intake_submit').allowed, true);
    assert.equal(checkOperation(PELNA_ZGODA, 'plan_generate').allowed, true);
  });

  test('błąd mówi, czego brakuje i dlaczego', () => {
    const czesciowa = grantAll(['regulamin']);
    try {
      assertOperation(czesciowa, 'plan_generate');
      assert.fail('powinno rzucić');
    } catch (error) {
      assert.ok(error instanceof ConsentRequiredError);
      assert.equal(error.missing.length, 2);
      assert.match(error.message, /danych o zdrowiu/u);
    }
  });

  test('dostęp lekarza wymaga odrębnej zgody, nie wystarczy zgoda ogólna', () => {
    assert.equal(checkOperation(PELNA_ZGODA, 'clinician_view').allowed, false);

    const zUdostepnieniem = grant(PELNA_ZGODA, 'udostepnienie_lekarzowi', T1, EVIDENCE);
    assert.equal(checkOperation(zUdostepnieniem, 'clinician_view').allowed, true);
  });

  test('do rejestracji brakuje tylko zgód z kroku 0', () => {
    assert.deepEqual(pendingOnboardingConsents([]), ['regulamin', 'dane_zdrowotne']);
    assert.deepEqual(pendingOnboardingConsents(PELNA_ZGODA), []);
  });
});

describe('wycofanie bez konsekwencji dla reszty programu', () => {
  test('wycofanie zgody na wearables nie blokuje planu', () => {
    let ledger = grant(PELNA_ZGODA, 'wearables', T1, EVIDENCE);
    ledger = withdraw(ledger, 'wearables', T2, EVIDENCE);

    assert.equal(checkOperation(ledger, 'wearable_link').allowed, false);
    assert.equal(checkOperation(ledger, 'plan_generate').allowed, true);
    assert.equal(checkOperation(ledger, 'intake_submit').allowed, true);
  });

  test('wycofanie zgody marketingowej nie dotyka niczego innego', () => {
    let ledger = grant(PELNA_ZGODA, 'komunikacja_marketingowa', T1, EVIDENCE);
    ledger = withdraw(ledger, 'komunikacja_marketingowa', T2, EVIDENCE);

    assert.deepEqual(operationsAffectedByWithdrawal('komunikacja_marketingowa'), [
      'marketing_send',
    ]);
    assert.equal(checkOperation(ledger, 'plan_generate').allowed, true);
  });

  test('wycofanie zgody wymaganej jest dozwolone', () => {
    // Blokowanie wycofania „bo bez tego nic nie działa" unieważniłoby dobrowolność.
    const ledger = withdraw(PELNA_ZGODA, 'dane_zdrowotne', T2, EVIDENCE);
    assert.equal(isActive(ledger, 'dane_zdrowotne'), false);
  });

  test('lista skutków wycofania jest kompletna', () => {
    assert.deepEqual(operationsAffectedByWithdrawal('dane_zdrowotne'), [
      'intake_submit',
      'plan_generate',
      'clinician_view',
      'wearable_link',
    ]);
  });
});

describe('sprzeciw wobec zautomatyzowanego przetwarzania (art. 21/22)', () => {
  test('komplet zgód daje tryb automatyczny', () => {
    assert.equal(planGenerationMode(PELNA_ZGODA), 'automatyczna');
  });

  test('wycofanie zgody na AI przełącza na ścieżkę ręczną, nie odcina planu', () => {
    const ledger = withdraw(PELNA_ZGODA, 'przetwarzanie_ai', T2, EVIDENCE);
    assert.equal(planGenerationMode(ledger), 'reczna');
  });

  test('wycofanie zgody na dane zdrowotne blokuje plan całkowicie', () => {
    const ledger = withdraw(PELNA_ZGODA, 'dane_zdrowotne', T2, EVIDENCE);
    assert.equal(planGenerationMode(ledger), 'zablokowana');
  });

  test('sama akceptacja regulaminu nie wystarcza', () => {
    assert.equal(planGenerationMode(grantAll(['regulamin'])), 'zablokowana');
  });
});
