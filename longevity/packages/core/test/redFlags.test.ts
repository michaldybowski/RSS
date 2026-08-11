import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deriveMetrics } from '../src/calculations.ts';
import { evaluateRedFlags, FLAG_RULES } from '../src/redFlags.ts';
import { classifyRisk, planConstraints, shouldGeneratePlan } from '../src/riskCategory.ts';
import { syntheticIntake, SYNTHETIC_NOW } from '../src/synthetic.ts';
import type { ParticipantIntake } from '../src/types.ts';

function flagCodes(intake: ParticipantIntake): string[] {
  return evaluateRedFlags({
    intake,
    derived: deriveMetrics(intake),
    now: SYNTHETIC_NOW,
  }).map((flag) => flag.code);
}

describe('zestaw reguł', () => {
  test('zawiera 13 flag ze specyfikacji 7.3', () => {
    assert.equal(FLAG_RULES.length, 13);
  });

  test('kody flag są unikalne', () => {
    const codes = FLAG_RULES.map((rule) => rule.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  test('każda flaga ma komunikat dla uczestnika', () => {
    for (const rule of FLAG_RULES) {
      assert.ok(rule.message.length > 20, `${rule.code} bez komunikatu`);
    }
  });
});

describe('uczestnik odniesienia', () => {
  test('zdrowy profil nie podnosi żadnej flagi', () => {
    assert.deepEqual(flagCodes(syntheticIntake()), []);
  });

  test('zdrowy profil daje kategorię ZIELONĄ i plan jest generowany', () => {
    const category = classifyRisk([]);
    assert.equal(category, 'ZIELONA');
    assert.equal(shouldGeneratePlan(category), true);
    assert.deepEqual(planConstraints(category), []);
  });
});

describe('flagi czerwone', () => {
  test('glukoza powyżej 126 mg/dl', () => {
    assert.ok(flagCodes(syntheticIntake({ labs: { glucoseMgDl: 140 } })).includes('FLAG_GLUCOSE_HIGH'));
  });

  test('próg glukozy jest ostry — 126 mg/dl nie podnosi flagi', () => {
    assert.ok(
      !flagCodes(syntheticIntake({ labs: { glucoseMgDl: 126 } })).includes('FLAG_GLUCOSE_HIGH'),
    );
  });

  test('HbA1c powyżej 6,5%', () => {
    assert.ok(flagCodes(syntheticIntake({ labs: { hba1cPct: 7.1 } })).includes('FLAG_HBA1C_HIGH'));
  });

  test('omdlenia', () => {
    assert.ok(flagCodes(syntheticIntake({ history: { syncope: true } })).includes('FLAG_SYNCOPE'));
  });

  test('ból w klatce przy wysiłku', () => {
    assert.ok(
      flagCodes(syntheticIntake({ history: { exertionalChestPain: true } })).includes(
        'FLAG_CHEST_PAIN',
      ),
    );
  });

  test('zaburzenia odżywiania', () => {
    assert.ok(
      flagCodes(syntheticIntake({ history: { eatingDisorder: true } })).includes(
        'FLAG_EATING_DISORDER',
      ),
    );
  });

  test('BMI skrajne w obu kierunkach', () => {
    const otylosc = syntheticIntake({ anthropometry: { weightKg: 135, heightCm: 180 } });
    const niedowaga = syntheticIntake({ anthropometry: { weightKg: 52, heightCm: 180 } });
    assert.ok(flagCodes(otylosc).includes('FLAG_BMI_EXTREME'));
    assert.ok(flagCodes(niedowaga).includes('FLAG_BMI_EXTREME'));
  });

  test('flaga czerwona zatrzymuje pipeline przed warstwą narracyjną', () => {
    const intake = syntheticIntake({ history: { syncope: true } });
    const flags = evaluateRedFlags({ intake, derived: deriveMetrics(intake), now: SYNTHETIC_NOW });
    const category = classifyRisk(flags);

    assert.equal(category, 'CZERWONA');
    assert.equal(shouldGeneratePlan(category), false);
    assert.deepEqual(planConstraints(category), ['plan_niegenerowany', 'raport_ryzyk_i_skierowania']);
  });
});

describe('flagi żółte', () => {
  test('GLP-1 aktywuje moduł monitoringu glikemii', () => {
    assert.ok(
      flagCodes(syntheticIntake({ medications: { glp1OrGip: true } })).includes('FLAG_GLP1_ACTIVE'),
    );
  });

  test('podejrzenie bezdechu wymaga wszystkich trzech warunków', () => {
    const wszystkie = syntheticIntake({
      anthropometry: { weightKg: 105, heightCm: 180 },
      history: { snoring: true, daytimeFatigue: true },
    });
    const bezZmeczenia = syntheticIntake({
      anthropometry: { weightKg: 105, heightCm: 180 },
      history: { snoring: true },
    });

    assert.ok(flagCodes(wszystkie).includes('FLAG_APNEA_SUSPECT'));
    assert.ok(!flagCodes(bezZmeczenia).includes('FLAG_APNEA_SUSPECT'));
  });

  test('stres 8 podnosi flagę, 7 nie', () => {
    assert.ok(flagCodes(syntheticIntake({ lifestyle: { stressLevel: 8 } })).includes('FLAG_STRESS_HIGH'));
    assert.ok(!flagCodes(syntheticIntake({ lifestyle: { stressLevel: 7 } })).includes('FLAG_STRESS_HIGH'));
  });

  test('brak badań traktowany jak badania nieaktualne', () => {
    assert.ok(flagCodes(syntheticIntake({ labs: undefined })).includes('FLAG_LABS_STALE'));
  });

  test('badania sprzed 13 miesięcy są nieaktualne', () => {
    assert.ok(
      flagCodes(syntheticIntake({ labs: { drawnAt: '2025-06-01' } })).includes('FLAG_LABS_STALE'),
    );
  });

  test('sama flaga żółta daje kategorię ŻÓŁTĄ i plan z ograniczeniami', () => {
    const intake = syntheticIntake({ lifestyle: { stressLevel: 9 } });
    const flags = evaluateRedFlags({ intake, derived: deriveMetrics(intake), now: SYNTHETIC_NOW });
    const category = classifyRisk(flags);

    assert.equal(category, 'ŻÓŁTA');
    assert.equal(shouldGeneratePlan(category), true);
    assert.ok(planConstraints(category).includes('pakiet_konsultacyjny_wymagany'));
  });

  test('czerwona ma pierwszeństwo nad żółtą', () => {
    const intake = syntheticIntake({
      history: { syncope: true },
      lifestyle: { stressLevel: 9 },
    });
    const flags = evaluateRedFlags({ intake, derived: deriveMetrics(intake), now: SYNTHETIC_NOW });
    assert.equal(classifyRisk(flags), 'CZERWONA');
  });
});
