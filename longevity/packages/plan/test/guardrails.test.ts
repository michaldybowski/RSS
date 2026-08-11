import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, syntheticIntake, SYNTHETIC_NOW, type Assessment } from '@longevity/core';

import { checkGuardrails } from '../src/guardrails.ts';
import type { Plan } from '../src/plan.ts';
import { PREFERENCES, validPlan } from './fixtures.ts';

function ocena(overrides: Parameters<typeof syntheticIntake>[0] = {}): Assessment {
  return assess(syntheticIntake(overrides), { mode: 'synthetic', now: SYNTHETIC_NOW });
}

function rules(plan: Plan, assessment = ocena(), preferences = PREFERENCES): readonly string[] {
  return checkGuardrails(plan, assessment, preferences).map((violation) => violation.rule);
}

describe('plan zgodny z zasadami', () => {
  test('poprawny plan nie narusza żadnej bariery', () => {
    assert.deepEqual(rules(validPlan()), []);
  });
});

describe('granice kompetencji modelu', () => {
  test('diagnoza jest zatrzymywana', () => {
    const plan = validPlan();
    const zdiagnoza = {
      ...plan,
      zywienie: { ...plan.zywienie, uwagi: ['Twoja diagnoza to insulinooporność'] },
    };
    assert.ok(rules(zdiagnoza).includes('brak_diagnozy'));
  });

  test('odniesienie do dawki leku jest zatrzymywane', () => {
    const plan = validPlan();
    const zdawka = {
      ...plan,
      zywienie: { ...plan.zywienie, uwagi: ['Rozważ zwiększenie dawki po konsultacji'] },
    };
    assert.ok(rules(zdawka).includes('brak_zalecen_lekowych'));
  });

  test('nazwa leku jest zatrzymywana', () => {
    const plan = validPlan();
    const zlekiem = {
      ...plan,
      zywienie: { ...plan.zywienie, uwagi: ['Metformina najlepiej działa z posiłkiem'] },
    };
    assert.ok(rules(zlekiem).includes('brak_nazw_lekow'));
  });

  test('obietnica efektu jest zatrzymywana', () => {
    const plan = validPlan({
      podsumowanie:
        'Ten plan gwarantuje spadek masy ciała i poprawę wyników, jeśli tylko będziesz go trzymać. ' +
        'Zaczynamy od uporządkowania snu, potem dokładamy trening siłowy w trzech jednostkach ' +
        'tygodniowo. Kolejne tygodnie rozbudowują objętość. Punkty kontrolne co miesiąc pokażą postęp ' +
        'i pozwolą skorygować założenia, gdyby tempo okazało się zbyt wolne albo zbyt szybkie dla Ciebie.',
    });
    assert.ok(rules(plan).includes('brak_obietnic'));
  });
});

describe('zgodność z deklaracjami uczestnika', () => {
  test('więcej dni treningowych niż zadeklarowano', () => {
    const plan = validPlan();
    const przeladowany = {
      ...plan,
      trening: {
        ...plan.trening,
        mikrocykl: plan.trening.mikrocykl.map((day) =>
          day.typ === 'wolne' ? { ...day, typ: 'silowy' as const, czasMin: 45, bloki: ['Rozgrzewka'] } : day,
        ),
      },
    };

    assert.ok(rules(przeladowany).includes('limit_dni_treningowych'));
  });

  test('sesja dłuższa niż zadeklarowany czas', () => {
    const plan = validPlan();
    const zadluga = {
      ...plan,
      trening: {
        ...plan.trening,
        mikrocykl: plan.trening.mikrocykl.map((day, index) =>
          index === 0 ? { ...day, czasMin: 90 } : day,
        ),
      },
    };

    assert.ok(rules(zadluga).includes('limit_czasu_sesji'));
  });

  test('pominięte ograniczenia ruchowe', () => {
    const preferencje = { ...PREFERENCES, movementLimitations: ['kolana'] };
    assert.ok(rules(validPlan(), ocena(), preferencje).includes('ograniczenia_ruchowe'));
  });

  test('uwzględnione ograniczenia ruchowe nie naruszają bariery', () => {
    const preferencje = { ...PREFERENCES, movementLimitations: ['kolana'] };
    const plan = validPlan();
    const uwzgledniony = {
      ...plan,
      zywienie: plan.zywienie,
      trening: {
        ...plan.trening,
        progresja: ['Bez obciążania kolan w pierwszych czterech tygodniach'],
      },
    };

    assert.ok(!rules(uwzgledniony, ocena(), preferencje).includes('ograniczenia_ruchowe'));
  });
});

describe('ograniczenia z kategorii ryzyka', () => {
  test('kategoria ŻÓŁTA nie dopuszcza akcentów maksymalnej intensywności', () => {
    const zolta = ocena({ lifestyle: { stressLevel: 9 } });
    assert.equal(zolta.riskCategory, 'ŻÓŁTA');

    const plan = validPlan();
    const intensywny = {
      ...plan,
      trening: { ...plan.trening, progresja: ['Co czwarty tydzień test 1RM w przysiadzie'] },
    };

    assert.ok(rules(intensywny, zolta).includes('ograniczenie_intensywnosci'));
  });

  test('ten sam plan przy kategorii ZIELONEJ nie narusza bariery intensywności', () => {
    const plan = validPlan();
    const intensywny = {
      ...plan,
      trening: { ...plan.trening, progresja: ['Co czwarty tydzień test 1RM w przysiadzie'] },
    };

    assert.ok(!rules(intensywny).includes('ograniczenie_intensywnosci'));
  });

  test('GLP-1 wymusza monitoring glikemii', () => {
    const zGlp1 = ocena({ medications: { glp1OrGip: true } });
    assert.ok(rules(validPlan(), zGlp1).includes('monitoring_glikemii'));
  });

  test('monitoring glikemii spełnia wymóg', () => {
    const zGlp1 = ocena({ medications: { glp1OrGip: true } });
    const plan = validPlan();
    const zMonitoringiem = {
      ...plan,
      monitoring: {
        ...plan.monitoring,
        wskazniki: [...plan.monitoring.wskazniki, 'Pomiar glikemii glukometrem trzy razy w tygodniu'],
      },
    };

    assert.ok(!rules(zMonitoringiem, zGlp1).includes('monitoring_glikemii'));
  });

  test('podejrzenie bezdechu wymaga odniesienia w protokole snu', () => {
    const zBezdechem = ocena({
      anthropometry: { weightKg: 105, heightCm: 180 },
      history: { snoring: true, daytimeFatigue: true },
    });

    assert.ok(rules(validPlan(), zBezdechem).includes('diagnostyka_bezdechu'));
  });
});

describe('spójność wewnętrzna planu', () => {
  test('dzień z treningiem bez wpisu w harmonogramie', () => {
    const plan = validPlan();
    const niespojny = { ...plan, harmonogram: plan.harmonogram.filter((item) => item.dzien !== 3) };

    assert.ok(rules(niespojny).includes('spojnosc_harmonogramu'));
  });
});

describe('informacja zwrotna dla modelu', () => {
  test('każde naruszenie niesie instrukcję do ponowienia', () => {
    const plan = validPlan();
    const zdiagnoza = {
      ...plan,
      zywienie: { ...plan.zywienie, uwagi: ['Twoja diagnoza to insulinooporność'] },
    };

    const violations = checkGuardrails(zdiagnoza, ocena(), PREFERENCES);
    assert.ok(violations.length > 0);
    for (const violation of violations) {
      assert.ok(violation.feedback.length > 20, violation.rule);
      assert.notEqual(violation.feedback, violation.message);
    }
  });
});
