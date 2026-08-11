import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess } from '../src/assess.ts';
import { isRulesetApproved, RulesetNotApprovedError, RULESET_STATUS } from '../src/ruleset.ts';
import { syntheticIntake, SYNTHETIC_NOW } from '../src/synthetic.ts';

describe('blokada danych rzeczywistych (decyzja 8)', () => {
  test('zestaw reguł jest w statusie draft', () => {
    assert.equal(RULESET_STATUS, 'draft');
    assert.equal(isRulesetApproved(), false);
  });

  test('tryb real jest zablokowany, dopóki reguły nie są zatwierdzone', () => {
    assert.throws(
      () => assess(syntheticIntake(), { mode: 'real', now: SYNTHETIC_NOW }),
      RulesetNotApprovedError,
    );
  });

  test('tryb synthetic działa — prototyp nie jest zablokowany', () => {
    const result = assess(syntheticIntake(), { mode: 'synthetic', now: SYNTHETIC_NOW });
    assert.equal(result.mode, 'synthetic');
    assert.equal(result.riskCategory, 'ZIELONA');
  });
});

describe('pełna ocena', () => {
  test('zwraca komplet: metryki, flagi, kategorię, wynik i ograniczenia', () => {
    const result = assess(syntheticIntake(), { mode: 'synthetic', now: SYNTHETIC_NOW });

    assert.ok(result.derived.bmi > 0);
    assert.ok(Array.isArray(result.flags));
    assert.ok(result.healthScore.overall > 0);
    assert.equal(result.generatePlan, true);
    assert.match(result.rulesetVersion, /draft/u);
  });

  test('flagi niosą wersję zestawu reguł', () => {
    const result = assess(syntheticIntake({ lifestyle: { stressLevel: 9 } }), {
      mode: 'synthetic',
      now: SYNTHETIC_NOW,
    });

    assert.ok(result.flags.length > 0);
    for (const flag of result.flags) {
      assert.equal(flag.rulesetVersion, result.rulesetVersion);
    }
  });

  test('kategoria CZERWONA wyłącza generowanie planu', () => {
    const result = assess(syntheticIntake({ history: { exertionalChestPain: true } }), {
      mode: 'synthetic',
      now: SYNTHETIC_NOW,
    });

    assert.equal(result.riskCategory, 'CZERWONA');
    assert.equal(result.generatePlan, false);
  });

  test('wynik nie zależy od zegara systemowego', () => {
    const intake = syntheticIntake();
    const a = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });
    const b = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });
    assert.deepEqual(a, b);
  });
});
