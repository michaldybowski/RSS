import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isVisible, progress, visibleQuestions } from '../src/conditions.ts';
import { QUESTIONNAIRE_V1 } from '../src/definition.ts';
import { findQuestion } from '../src/conditions.ts';
import { syntheticAnswers } from '../src/syntheticAnswers.ts';
import { isComplete, validateAnswers } from '../src/validate.ts';

const kontuzjeOpis = findQuestion(QUESTIONNAIRE_V1, 'd1_kontuzje_opis')!;
const chorobyInne = findQuestion(QUESTIONNAIRE_V1, 'd1_choroby_inne_opis')!;

describe('logika warunkowa', () => {
  test('pytanie o opis kontuzji ukryte przy odpowiedzi przeczącej', () => {
    assert.equal(isVisible(kontuzjeOpis, syntheticAnswers()), false);
  });

  test('pojawia się po odpowiedzi twierdzącej', () => {
    assert.equal(isVisible(kontuzjeOpis, syntheticAnswers({ d1_kontuzje: 'tak' })), true);
  });

  test('warunek na liście wielokrotnego wyboru', () => {
    assert.equal(isVisible(chorobyInne, syntheticAnswers()), false);
    assert.equal(
      isVisible(chorobyInne, syntheticAnswers({ d1_choroby_przewlekle: ['inne'] })),
      true,
    );
  });

  test('brak odpowiedzi oznacza warunek niespełniony', () => {
    assert.equal(isVisible(kontuzjeOpis, {}), false);
  });

  test('liczba widocznych pytań rośnie wraz z odsłanianiem warunków', () => {
    const bez = visibleQuestions(QUESTIONNAIRE_V1, syntheticAnswers()).length;
    const z = visibleQuestions(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d1_kontuzje: 'tak', d1_choroby_przewlekle: ['inne'] }),
    ).length;
    assert.equal(z, bez + 2);
  });
});

describe('postęp', () => {
  test('komplet odpowiedzi daje 100%', () => {
    assert.equal(progress(QUESTIONNAIRE_V1, syntheticAnswers()), 1);
  });

  test('postęp liczony po pytaniach widocznych, nie po wszystkich', () => {
    // Odsłonięcie pytania warunkowego bez odpowiedzi musi cofnąć postęp poniżej 100%.
    const value = progress(QUESTIONNAIRE_V1, syntheticAnswers({ d1_kontuzje: 'tak' }));
    assert.ok(value < 1 && value > 0.9);
  });

  test('pusty formularz daje zero', () => {
    assert.equal(progress(QUESTIONNAIRE_V1, {}), 0);
  });
});

describe('walidacja', () => {
  test('komplet syntetyczny przechodzi bez uwag', () => {
    assert.deepEqual(validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers()), []);
    assert.equal(isComplete(QUESTIONNAIRE_V1, syntheticAnswers()), true);
  });

  test('brak pytania wymaganego jest zgłaszany', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d1_wiek: undefined }));
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.code, 'wymagane');
    assert.equal(issues[0]?.question, 'd1_wiek');
  });

  test('brak pytania nieobowiązkowego jest w porządku', () => {
    assert.deepEqual(validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d5_kroki: undefined })), []);
  });

  test('wartość poza zakresem', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d1_wiek: 8 }));
    assert.equal(issues[0]?.code, 'poza_zakresem');
  });

  test('nieistniejąca opcja', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d1_plec: 'inne' }));
    assert.equal(issues[0]?.code, 'nieznana_opcja');
  });

  test('nieistniejąca opcja w liście wielokrotnej', () => {
    const issues = validateAnswers(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d5_sprzet: ['hantle', 'czolg'] }),
    );
    assert.equal(issues[0]?.code, 'nieznana_opcja');
  });

  test('przekroczony limit wyborów', () => {
    const issues = validateAnswers(
      QUESTIONNAIRE_V1,
      syntheticAnswers({
        d10_cel_glowny: ['redukcja_masy', 'poprawa_snu', 'kondycja', 'wiecej_energii'],
      }),
    );
    assert.equal(issues[0]?.code, 'za_wiele_opcji');
  });

  test('zły typ odpowiedzi', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d1_wiek: 'czterdzieści' }));
    assert.equal(issues[0]?.code, 'zly_typ');
  });

  test('zła data', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d9_data_badan: '10.05.2026' }));
    assert.equal(issues[0]?.code, 'zly_typ');
  });

  test('odpowiedź na pytanie ukryte jest błędem, nie nadmiarem', () => {
    const issues = validateAnswers(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d1_kontuzje_opis: 'bark' }),
    );
    assert.equal(issues[0]?.code, 'pytanie_niewidoczne');
  });

  test('odpowiedź na nieistniejące pytanie jest zgłaszana', () => {
    const issues = validateAnswers(QUESTIONNAIRE_V1, syntheticAnswers({ d99_cokolwiek: 'x' }));
    assert.equal(issues[0]?.code, 'nieznane_pytanie');
  });

  test('tekst ponad limit', () => {
    const issues = validateAnswers(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d4_awersje: 'x'.repeat(400) }),
    );
    assert.equal(issues[0]?.code, 'za_dlugie');
  });
});
