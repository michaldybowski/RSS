import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deriveMetrics } from '../src/calculations.ts';
import { computeHealthScore, COMPONENT_WEIGHTS } from '../src/healthScore.ts';
import { syntheticIntake, SYNTHETIC_NOW } from '../src/synthetic.ts';
import type { ParticipantIntake } from '../src/types.ts';

function score(intake: ParticipantIntake) {
  return computeHealthScore(intake, deriveMetrics(intake), SYNTHETIC_NOW);
}

describe('konfiguracja scoringu', () => {
  test('wagi składowych sumują się do 1', () => {
    const sum = Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `suma wag = ${sum}`);
  });

  test('wynik niesie wersję algorytmu', () => {
    assert.match(score(syntheticIntake()).scoringVersion, /^\d+\.\d+\.\d+/u);
  });
});

describe('wynik ogólny', () => {
  test('uczestnik odniesienia wypada wysoko', () => {
    assert.ok(score(syntheticIntake()).overall >= 80);
  });

  test('profil obciążony wypada nisko', () => {
    const obciazony = syntheticIntake({
      anthropometry: { weightKg: 115, heightCm: 175, waistCm: 122, hipCm: 118 },
      labs: { glucoseMgDl: 138, hba1cPct: 7.2, insulinUIUmL: 22, ldlMgDl: 165, crpMgL: 6 },
      lifestyle: {
        sleepHoursWeekday: 5,
        sleepQuality: 2,
        nightWakeups: 2,
        trainingDaysPerWeek: 0,
        stepsPerDay: 3000,
        stressLevel: 9,
        mealsPerDay: 2,
        waterIntake: '<1l',
        vegetableServingsPerDay: 1,
        alcohol: 'codziennie',
        nicotine: 'codziennie',
        preventiveScreeningsUpToDate: false,
      },
    });

    assert.ok(score(obciazony).overall < 35);
  });

  test('wynik mieści się w zakresie 0-100 nawet przy skrajnych danych', () => {
    const skrajny = syntheticIntake({
      anthropometry: { weightKg: 200, heightCm: 160 },
      lifestyle: {
        sleepHoursWeekday: 2,
        sleepQuality: 1,
        nightWakeups: 3,
        trainingDaysPerWeek: 0,
        stepsPerDay: 500,
        stressLevel: 10,
        mealsPerDay: 1,
        waterIntake: '<1l',
        vegetableServingsPerDay: 0,
        alcohol: 'codziennie',
        nicotine: 'codziennie',
        preventiveScreeningsUpToDate: false,
      },
    });

    const result = score(skrajny);
    assert.ok(result.overall >= 0 && result.overall <= 100);
    for (const component of result.components) {
      assert.ok(component.score >= 0 && component.score <= 100, component.component);
    }
  });
});

describe('składowe', () => {
  test('każda składowa raportuje, co obniżyło wynik', () => {
    const result = score(syntheticIntake({ lifestyle: { stressLevel: 9 } }));
    const stres = result.components.find((c) => c.component === 'stres');

    assert.ok(stres);
    assert.ok(stres.score < 30);
    assert.ok(stres.contributions.length > 0);
    assert.ok(stres.contributions.every((c) => c.points < 0));
  });

  test('zła składowa nie psuje pozostałych', () => {
    const result = score(syntheticIntake({ lifestyle: { nicotine: 'codziennie' } }));
    const profilaktyka = result.components.find((c) => c.component === 'profilaktyka');
    const sen = result.components.find((c) => c.component === 'sen');

    assert.ok(profilaktyka && profilaktyka.score <= 60);
    assert.ok(sen && sen.score >= 80);
  });

  test('scoring jest deterministyczny', () => {
    const intake = syntheticIntake({ lifestyle: { stressLevel: 6 } });
    assert.deepEqual(score(intake), score(intake));
  });
});
