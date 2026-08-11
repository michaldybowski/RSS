import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, SYNTHETIC_NOW } from '@longevity/core';
import { buildModelPayload } from '@longevity/model-payload';

import { QUESTIONNAIRE_V1 } from '../src/definition.ts';
import { NormalizationError, normalize } from '../src/normalize.ts';
import { answersWithoutLabs, syntheticAnswers } from '../src/syntheticAnswers.ts';

describe('normalizacja', () => {
  test('odrzuca odpowiedzi, które nie przeszły walidacji', () => {
    assert.throws(
      () => normalize(QUESTIONNAIRE_V1, syntheticAnswers({ d3_waga: undefined })),
      NormalizationError,
    );
  });

  test('błąd niesie listę problemów, nie tylko komunikat', () => {
    try {
      normalize(QUESTIONNAIRE_V1, syntheticAnswers({ d3_waga: undefined, d1_wiek: undefined }));
      assert.fail('powinno rzucić');
    } catch (error) {
      assert.ok(error instanceof NormalizationError);
      assert.equal(error.issues.length, 2);
    }
  });

  test('mapuje antropometrię i wiek', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    assert.equal(intake.ageYears, 42);
    assert.equal(intake.sex, 'M');
    assert.equal(intake.anthropometry.weightKg, 84);
    assert.equal(intake.anthropometry.waistCm, 92);
  });

  test('pomija obwody, gdy nie podane', () => {
    const { intake } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d3_talia: undefined, d3_biodra: undefined }),
    );
    assert.equal(intake.anthropometry.waistCm, undefined);
  });

  test('tak/nie zamieniane na wartości logiczne', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, syntheticAnswers({ d1_omdlenia: 'tak' }));
    assert.equal(intake.history.syncope, true);
    assert.equal(intake.history.exertionalChestPain, false);
  });

  test('GLP-1 rozpoznawany z listy leków metabolicznych', () => {
    const { intake } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d2_leki_metaboliczne: ['metformina', 'glp1_gip'] }),
    );
    assert.equal(intake.medications.glp1OrGip, true);
  });

  test('wybory liczbowe zapisane jako tekst wracają jako liczby', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, syntheticAnswers({ d6_jakosc: '2', d6_wybudzenia: '3' }));
    assert.equal(intake.lifestyle.sleepQuality, 2);
    assert.equal(intake.lifestyle.nightWakeups, 3);
  });

  test('"brak" w historii rodzinnej nie jest chorobą', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    assert.deepEqual(intake.history.familyHistory, []);
  });

  test('pusty panel badań daje brak panelu, nie panel pusty', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, answersWithoutLabs());
    assert.equal(intake.labs, undefined);
  });

  test('częściowo wypełniony panel jest zachowany', () => {
    const { intake } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d9_hba1c: undefined, d9_insulina: undefined }),
    );
    assert.equal(intake.labs?.glucoseMgDl, 92);
    assert.equal(intake.labs?.hba1cPct, undefined);
  });
});

describe('preferencje planu', () => {
  test('cele i format przenoszone wprost', () => {
    const { preferences } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    assert.deepEqual(preferences.goals, ['redukcja_masy', 'poprawa_snu']);
    assert.equal(preferences.planFormat, 'elastyczny');
    assert.equal(preferences.minutesPerSession, 45);
  });

  test('"brak" nie trafia do ograniczeń ruchowych', () => {
    const { preferences } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    assert.deepEqual(preferences.movementLimitations, []);
  });

  test('tekst swobodny rozbijany na pozycje', () => {
    const { preferences } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    assert.ok(preferences.aversions.includes('ryby'));
    assert.ok(preferences.aversions.includes('kalafior'));
  });

  test('zbyt długie fragmenty tekstu swobodnego są odrzucane', () => {
    const { preferences } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d4_awersje: `ryby, ${'x'.repeat(120)}` }),
    );
    assert.deepEqual(preferences.aversions.filter((item) => item.length > 60), []);
  });

  test('liczba pozycji z tekstu swobodnego jest ograniczona', () => {
    const { preferences } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d4_awersje: Array.from({ length: 30 }, (_, i) => `p${i}`).join(',') }),
    );
    assert.ok(preferences.aversions.length <= 20);
  });
});

describe('ścieżka od kwestionariusza do ładunku modelu', () => {
  test('zdrowy profil przechodzi całą drogę i daje kategorię ZIELONĄ', () => {
    const { intake, preferences } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
    const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });

    assert.equal(assessment.riskCategory, 'ZIELONA');
    assert.equal(assessment.generatePlan, true);

    const payload = buildModelPayload({
      requestId: 'req-e2e-1',
      intake,
      assessment,
      preferences,
    });

    assert.equal(payload.demographics.ageYears, 42);
    assert.equal(payload.clinical.riskCategory, 'ZIELONA');
    assert.deepEqual(payload.clinical.flagCodes, []);
  });

  test('odpowiedź o omdleniach zatrzymuje pipeline przed modelem', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, syntheticAnswers({ d1_omdlenia: 'tak' }));
    const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });

    assert.equal(assessment.riskCategory, 'CZERWONA');
    assert.equal(assessment.generatePlan, false);
    assert.ok(assessment.flags.some((flag) => flag.code === 'FLAG_SYNCOPE'));
  });

  test('brak badań podnosi flagę informacyjną, ale nie blokuje planu', () => {
    const { intake } = normalize(QUESTIONNAIRE_V1, answersWithoutLabs());
    const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });

    assert.equal(assessment.riskCategory, 'ŻÓŁTA');
    assert.equal(assessment.generatePlan, true);
    assert.ok(assessment.flags.some((flag) => flag.code === 'FLAG_LABS_STALE'));
  });

  test('tekst swobodny nie przenosi danych kontaktowych do modelu', () => {
    const { intake, preferences } = normalize(
      QUESTIONNAIRE_V1,
      syntheticAnswers({ d10_deal_breakery: 'kontakt jan.kowalski@firma.pl' }),
    );
    const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });

    assert.throws(() =>
      buildModelPayload({ requestId: 'req-e2e-2', intake, assessment, preferences }),
    );
  });
});
