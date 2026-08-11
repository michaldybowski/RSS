import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, syntheticIntake, SYNTHETIC_NOW } from '@longevity/core';
import {
  assertNoForbiddenFields,
  bmiBand,
  buildModelPayload,
  ForbiddenFieldError,
  interpretLabs,
  type PlanPreferences,
} from '../src/index.ts';

const PREFERENCES: PlanPreferences = {
  goals: ['redukcja_masy', 'poprawa_snu'],
  planFormat: 'elastyczny',
  minutesPerSession: 45,
  daysAvailable: 4,
  timeWindows: ['rano', 'po_pracy'],
  equipment: ['hantle', 'mata'],
  dietaryPattern: 'bez_ograniczen',
  aversions: ['ryby'],
  movementLimitations: [],
};

function payloadFor(intake = syntheticIntake()) {
  const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });
  return buildModelPayload({ requestId: 'req-0001', intake, assessment, preferences: PREFERENCES });
}

describe('skaner pól zakazanych', () => {
  test('przepuszcza ładunek zbudowany z białej listy', () => {
    assert.doesNotThrow(() => assertNoForbiddenFields(payloadFor()));
  });

  test('zatrzymuje pole o zakazanej nazwie', () => {
    assert.throws(() => assertNoForbiddenFields({ imie: 'Anna' }), ForbiddenFieldError);
    assert.throws(() => assertNoForbiddenFields({ email: 'x' }), ForbiddenFieldError);
    assert.throws(() => assertNoForbiddenFields({ PESEL: 'x' }), ForbiddenFieldError);
  });

  test('nazwa pola rozpoznawana niezależnie od zapisu', () => {
    assert.throws(() => assertNoForbiddenFields({ date_of_birth: 'x' }), ForbiddenFieldError);
    assert.throws(() => assertNoForbiddenFields({ 'Data-Urodzenia': 'x' }), ForbiddenFieldError);
  });

  test('zatrzymuje zakazaną treść ukrytą w niewinnym polu', () => {
    assert.throws(
      () => assertNoForbiddenFields({ notatka: 'kontakt: jan.kowalski@firma.pl' }),
      ForbiddenFieldError,
    );
    assert.throws(() => assertNoForbiddenFields({ uwaga: 'ur. 1984-03-12' }), ForbiddenFieldError);
  });

  test('schodzi w zagnieżdżenia i tablice', () => {
    assert.throws(
      () => assertNoForbiddenFields({ a: { b: [{ c: { nazwisko: 'Kowalska' } }] } }),
      ForbiddenFieldError,
    );
  });

  test('błąd wskazuje ścieżkę do problemu', () => {
    try {
      assertNoForbiddenFields({ pacjent: { dane: { email: 'x@y.pl' } } });
      assert.fail('powinno rzucić');
    } catch (error) {
      assert.ok(error instanceof ForbiddenFieldError);
      assert.match(error.path, /pacjent\.dane\.email/u);
    }
  });
});

describe('zakres ładunku (decyzja 3)', () => {
  test('klucze najwyższego poziomu są zamkniętym zbiorem', () => {
    assert.deepEqual(Object.keys(payloadFor()).sort(), [
      'anthropometryBands',
      'clinical',
      'demographics',
      'lifestyle',
      'preferences',
      'requestId',
      'scoring',
    ]);
  });

  test('idzie wiek, nie data urodzenia', () => {
    const payload = payloadFor();
    assert.equal(typeof payload.demographics.ageYears, 'number');
    assert.ok(!JSON.stringify(payload).includes('drawnAt'));
  });

  test('antropometria idzie jako przedziały, nie wartości surowe', () => {
    const payload = payloadFor();
    assert.equal(payload.anthropometryBands.bmiBand, 'nadwaga');
    assert.match(payload.anthropometryBands.tdeeBand, /^\d+-\d+ kcal$/u);
    assert.ok(!('bmi' in payload.anthropometryBands));
  });

  test('wyniki badań idą jako interpretacje, nie liczby', () => {
    const intake = syntheticIntake({ labs: { glucoseMgDl: 138, hba1cPct: 7.2, insulinUIUmL: 25 } });
    const payload = payloadFor(intake);

    assert.ok(payload.clinical.labInterpretations.includes('glikemia_na_czczo_nieprawidlowa'));
    assert.ok(payload.clinical.labInterpretations.includes('insulinoopornosc_potwierdzona'));

    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes('138'), 'surowa glukoza w ładunku');
    assert.ok(!serialized.includes('7.2'), 'surowe HbA1c w ładunku');
  });

  test('leki idą jako kategorie, nie nazwy handlowe', () => {
    const payload = payloadFor(syntheticIntake({ medications: { glp1OrGip: true } }));
    assert.deepEqual(payload.clinical.medicationCategories, ['glp1_gip_aktywny']);
  });

  test('kategoria ryzyka i flagi trafiają jako fakt, nie pytanie', () => {
    const payload = payloadFor(syntheticIntake({ lifestyle: { stressLevel: 9 } }));
    assert.equal(payload.clinical.riskCategory, 'ŻÓŁTA');
    assert.ok(payload.clinical.flagCodes.includes('FLAG_STRESS_HIGH'));
    assert.ok(payload.clinical.constraints.includes('pakiet_konsultacyjny_wymagany'));
  });

  test('scoring wskazuje najsłabsze składowe, na których ma się skupić plan', () => {
    const payload = payloadFor(
      syntheticIntake({ lifestyle: { sleepHoursWeekday: 4.5, sleepQuality: 1, nightWakeups: 3 } }),
    );
    assert.ok(payload.scoring.weakestComponents.includes('sen'));
    assert.equal(payload.scoring.weakestComponents.length, 3);
  });

  test('budowanie ładunku samo waliduje zakres', () => {
    assert.doesNotThrow(() => payloadFor());
  });
});

describe('pomocnicze', () => {
  test('pasma BMI pokrywają całą skalę', () => {
    assert.equal(bmiBand(17), 'niedowaga');
    assert.equal(bmiBand(22), 'prawidłowa');
    assert.equal(bmiBand(27), 'nadwaga');
    assert.equal(bmiBand(32), 'otyłość I');
    assert.equal(bmiBand(37), 'otyłość II');
    assert.equal(bmiBand(45), 'otyłość III');
  });

  test('brak badań daje pustą listę interpretacji, nie błąd', () => {
    assert.deepEqual(interpretLabs(syntheticIntake({ labs: undefined }), undefined), []);
  });
});
