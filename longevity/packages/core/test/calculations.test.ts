import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  activityFactor,
  bmi,
  bmr,
  deriveMetrics,
  homaIr,
  labsAgeInMonths,
  whr,
  whrCategory,
} from '../src/calculations.ts';
import { syntheticIntake, SYNTHETIC_NOW } from '../src/synthetic.ts';

describe('wyliczenia antropometryczne', () => {
  test('BMI liczone z wagi i wzrostu', () => {
    assert.equal(bmi({ weightKg: 81, heightCm: 180 }), 25);
  });

  test('WHR wymaga obu obwodów', () => {
    assert.equal(whr({ weightKg: 80, heightCm: 180, waistCm: 90, hipCm: 100 }), 0.9);
    assert.equal(whr({ weightKg: 80, heightCm: 180, waistCm: 90 }), undefined);
  });

  test('progi WHR różnią się dla kobiet i mężczyzn', () => {
    assert.equal(whrCategory(0.85, 'M'), 'prawidłowy');
    assert.equal(whrCategory(0.85, 'K'), 'wysoki');
  });

  test('płeć nieokreślona dostaje próg ostrożniejszy', () => {
    assert.equal(whrCategory(0.85, 'X'), 'wysoki');
  });
});

describe('przemiana materii', () => {
  test('Mifflin-St Jeor dla mężczyzny', () => {
    // 10*80 + 6.25*180 - 5*40 + 5 = 1730
    assert.equal(bmr({ weightKg: 80, heightCm: 180 }, 40, 'M'), 1730);
  });

  test('kobieta dostaje niższą stałą', () => {
    const male = bmr({ weightKg: 80, heightCm: 180 }, 40, 'M');
    const female = bmr({ weightKg: 80, heightCm: 180 }, 40, 'K');
    assert.equal(male - female, 166);
  });

  test('kroki podbijają współczynnik aktywności ponad liczbę treningów', () => {
    assert.equal(activityFactor(0), 1.2);
    assert.equal(activityFactor(0, 13000), 1.725);
  });
});

describe('HOMA-IR', () => {
  test('liczony tylko przy komplecie glukoza + insulina', () => {
    assert.equal(homaIr({ glucoseMgDl: 100, insulinUIUmL: 10 }), 2.47);
    assert.equal(homaIr({ glucoseMgDl: 100 }), undefined);
    assert.equal(homaIr(undefined), undefined);
  });
});

describe('wiek badań', () => {
  test('liczony w pełnych miesiącach', () => {
    assert.equal(labsAgeInMonths({ drawnAt: '2026-01-26' }, SYNTHETIC_NOW), 6);
  });

  test('brak daty daje undefined, nie zero', () => {
    assert.equal(labsAgeInMonths({}, SYNTHETIC_NOW), undefined);
  });

  test('data z przyszłości nie daje wartości ujemnej', () => {
    assert.equal(labsAgeInMonths({ drawnAt: '2026-12-01' }, SYNTHETIC_NOW), 0);
  });
});

describe('deriveMetrics', () => {
  test('zwraca komplet dla pełnych danych', () => {
    const derived = deriveMetrics(syntheticIntake());
    assert.equal(derived.bmi, 25.9);
    assert.equal(derived.whrCategory, 'podwyższony');
    assert.ok(derived.tdee > derived.bmr);
    assert.ok(derived.homaIr !== undefined);
  });

  test('pomija WHR i HOMA-IR, gdy brak danych źródłowych', () => {
    const derived = deriveMetrics(
      syntheticIntake({ anthropometry: { waistCm: undefined, hipCm: undefined }, labs: undefined }),
    );
    assert.equal(derived.whr, undefined);
    assert.equal(derived.homaIr, undefined);
  });
});
