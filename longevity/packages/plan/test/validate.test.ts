import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validatePlanStructure } from '../src/validate.ts';
import { validPlan } from './fixtures.ts';

function issuesOf(raw: unknown): readonly string[] {
  const result = validatePlanStructure(raw);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

describe('walidacja strukturalna', () => {
  test('poprawny plan przechodzi', () => {
    const result = validatePlanStructure(validPlan());
    assert.equal(result.ok, true);
  });

  test('odpowiedź niebędąca obiektem jest odrzucana', () => {
    assert.ok(issuesOf('plan gotowy!').length > 0);
    assert.ok(issuesOf(null).length > 0);
    assert.ok(issuesOf([1, 2, 3]).length > 0);
  });

  test('zbyt krótkie podsumowanie jest odrzucane', () => {
    const issues = issuesOf(validPlan({ podsumowanie: 'Trenuj i śpij.' }));
    assert.ok(issues.some((issue) => issue.startsWith('$.podsumowanie')));
  });

  test('mikrocykl musi mieć dokładnie siedem dni', () => {
    const plan = validPlan();
    const skrocony = { ...plan, trening: { ...plan.trening, mikrocykl: plan.trening.mikrocykl.slice(0, 5) } };
    assert.ok(issuesOf(skrocony).some((issue) => issue.includes('mikrocykl')));
  });

  test('dni mikrocyklu muszą pokrywać tydzień dokładnie raz', () => {
    // Siedem pozycji, ale dzień 1 dwa razy i brak dnia 7 — kształt się zgadza,
    // treść nie. Sama długość listy tego nie wyłapie.
    const plan = validPlan();
    const zduplikowany = {
      ...plan,
      trening: {
        ...plan.trening,
        mikrocykl: plan.trening.mikrocykl.map((day, index) => (index === 6 ? { ...day, dzien: 1 } : day)),
      },
    };

    assert.ok(issuesOf(zduplikowany).some((issue) => issue.includes('dokładnie raz')));
  });

  test('dzień wolny nie może mieć czasu trwania', () => {
    const plan = validPlan();
    const niespojny = {
      ...plan,
      trening: {
        ...plan.trening,
        mikrocykl: plan.trening.mikrocykl.map((day) =>
          day.typ === 'wolne' ? { ...day, czasMin: 30 } : day,
        ),
      },
    };

    assert.ok(issuesOf(niespojny).some((issue) => issue.includes('dzień wolny')));
  });

  test('nieznany typ dnia treningowego jest odrzucany', () => {
    const plan = validPlan();
    const zly = {
      ...plan,
      trening: {
        ...plan.trening,
        mikrocykl: plan.trening.mikrocykl.map((day, index) =>
          index === 0 ? { ...day, typ: 'crossfit' } : day,
        ),
      },
    };

    assert.ok(issuesOf(zly).some((issue) => issue.includes('typ')));
  });

  test('brakująca sekcja jest zgłaszana ze ścieżką', () => {
    const { sen, ...bezSnu } = validPlan();
    void sen;
    assert.ok(issuesOf(bezSnu).some((issue) => issue.startsWith('$.sen')));
  });

  test('liczba pozycji harmonogramu jest ograniczona z obu stron', () => {
    const plan = validPlan();
    assert.ok(issuesOf({ ...plan, harmonogram: plan.harmonogram.slice(0, 2) }).length > 0);
    assert.ok(
      issuesOf({
        ...plan,
        harmonogram: Array.from({ length: 40 }, () => plan.harmonogram[0]),
      }).length > 0,
    );
  });

  test('walidacja zbiera wszystkie problemy, nie tylko pierwszy', () => {
    const plan = validPlan();
    const wadliwy = {
      ...plan,
      podsumowanie: 'krótko',
      sen: { protokol: [], celGodzin: '' },
    };

    assert.ok(issuesOf(wadliwy).length >= 3);
  });

  test('tekst jest przycinany przy odczycie', () => {
    const result = validatePlanStructure(
      validPlan({ sen: { protokol: ['  Stała pora snu  ', 'Ciemno', 'Chłodno'], celGodzin: ' 7-8 h ' } }),
    );

    assert.ok(result.ok);
    assert.equal(result.value.sen.celGodzin, '7-8 h');
    assert.equal(result.value.sen.protokol[0], 'Stała pora snu');
  });
});
