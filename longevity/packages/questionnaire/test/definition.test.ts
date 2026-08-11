import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { allQuestions, findQuestion } from '../src/conditions.ts';
import { QUESTIONNAIRE_V1 } from '../src/definition.ts';

const questions = allQuestions(QUESTIONNAIRE_V1);

describe('spójność definicji', () => {
  test('obejmuje dziesięć domen', () => {
    const domains = QUESTIONNAIRE_V1.steps.map((step) => step.domain);
    assert.deepEqual(domains, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('kody pytań są unikalne', () => {
    const codes = questions.map((question) => question.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    assert.deepEqual(duplicates, []);
  });

  test('kod pytania zgadza się z numerem domeny', () => {
    for (const step of QUESTIONNAIRE_V1.steps) {
      for (const question of step.questions) {
        assert.ok(
          question.code.startsWith(`d${step.domain}_`),
          `${question.code} w domenie ${step.domain}`,
        );
      }
    }
  });

  test('pytania wyboru mają opcje, pozostałe ich nie mają', () => {
    for (const question of questions) {
      if (question.type === 'single' || question.type === 'multi') {
        assert.ok(question.options && question.options.length > 1, question.code);
      } else {
        assert.equal(question.options, undefined, question.code);
      }
    }
  });

  test('wartości opcji są unikalne w obrębie pytania', () => {
    for (const question of questions) {
      if (!question.options) continue;
      const values = question.options.map((option) => option.value);
      assert.equal(new Set(values).size, values.length, question.code);
    }
  });

  test('pytania zasilające reguły dają jawne "brak"', () => {
    // Pusta lista jest nieodróżnialna od pominięcia pytania. Tam, gdzie brak
    // wskazań jest informacją kliniczną, uczestnik musi móc to zadeklarować.
    const wymagajaceJawnegoBraku = [
      'd1_choroby_przewlekle',
      'd1_historia_rodzinna',
      'd2_leki_metaboliczne',
      'd4_problemy_gi',
      'd5_ograniczenia_ruchowe',
    ];

    for (const code of wymagajaceJawnegoBraku) {
      const question = findQuestion(QUESTIONNAIRE_V1, code);
      assert.ok(question, code);
      assert.ok(
        question.options?.some((option) => option.value === 'brak'),
        `${code} bez opcji "brak"`,
      );
    }
  });

  test('warunki widoczności wskazują na istniejące pytania', () => {
    for (const question of questions) {
      if (!question.showIf) continue;
      const referenced = referencedQuestions(question.showIf);
      for (const code of referenced) {
        assert.ok(findQuestion(QUESTIONNAIRE_V1, code), `${question.code} → ${code}`);
      }
    }
  });

  test('pytanie warunkowe nie może być wymagane', () => {
    // Wymagane + ukryte to pułapka: uczestnik nie ma jak przejść dalej.
    for (const question of questions) {
      if (question.showIf !== undefined) {
        assert.notEqual(question.required, true, question.code);
      }
    }
  });

  test('pytania numeryczne mają zakres', () => {
    for (const question of questions) {
      if (question.type !== 'number') continue;
      assert.ok(question.validation?.min !== undefined, `${question.code} bez min`);
      assert.ok(question.validation?.max !== undefined, `${question.code} bez max`);
    }
  });

  test('pola tekstowe mają limit długości', () => {
    for (const question of questions) {
      if (question.type !== 'text') continue;
      assert.ok(question.validation?.maxLength !== undefined, question.code);
    }
  });
});

function referencedQuestions(condition: NonNullable<(typeof questions)[number]['showIf']>): string[] {
  switch (condition.kind) {
    case 'all':
    case 'any':
      return condition.conditions.flatMap(referencedQuestions);
    case 'not':
      return referencedQuestions(condition.condition);
    default:
      return [condition.question];
  }
}
