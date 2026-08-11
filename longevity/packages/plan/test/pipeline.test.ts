import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, syntheticIntake, SYNTHETIC_NOW } from '@longevity/core';

import { generatePlan, summarizeFailure, type GenerationMode } from '../src/pipeline.ts';
import { PANEL_BAZOWY } from '../src/referrals.ts';
import { PREFERENCES, ScriptedModel, validPlan } from './fixtures.ts';

function run(
  responses: readonly unknown[],
  options: { mode?: GenerationMode; intake?: Parameters<typeof syntheticIntake>[0] } = {},
) {
  const intake = syntheticIntake(options.intake ?? {});
  const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });
  const client = new ScriptedModel(responses);

  return {
    client,
    assessment,
    result: generatePlan({
      requestId: 'req-1',
      intake,
      assessment,
      preferences: PREFERENCES,
      mode: options.mode ?? 'automatyczna',
      client,
    }),
  };
}

describe('ścieżka udana', () => {
  test('poprawna odpowiedź modelu daje plan za pierwszym podejściem', async () => {
    const { result, client } = run([validPlan()]);
    const value = await result;

    assert.equal(value.kind, 'plan');
    assert.equal(client.requests.length, 1);
    if (value.kind === 'plan') assert.equal(value.attempts.length, 1);
  });

  test('plan dostaje zastrzeżenie od platformy, nie od modelu', async () => {
    const value = await run([validPlan()]).result;

    assert.equal(value.kind, 'plan');
    if (value.kind === 'plan') {
      assert.match(value.disclaimer, /nie jest diagnozą medyczną/u);
      assert.ok(!JSON.stringify(value.plan).includes('nie jest diagnozą'));
    }
  });

  test('do planu dołączane są skierowania wyliczone z reguł', async () => {
    const value = await run([validPlan()]).result;

    assert.equal(value.kind, 'plan');
    if (value.kind === 'plan') {
      assert.deepEqual(value.referrals.panelBazowy, PANEL_BAZOWY);
      assert.ok(value.referrals.pytaniaUniwersalne.length >= 5);
    }
  });

  test('model dostaje ładunek zminimalizowany, nie surowy wywiad', async () => {
    const { client, result } = run([validPlan()]);
    await result;

    const payload = client.requests[0]!.payload;
    assert.equal(payload.demographics.ageYears, 42);
    assert.ok(!JSON.stringify(payload).includes('92'), 'surowy obwód talii w ładunku');
  });
});

describe('ponowienia', () => {
  test('odpowiedź niezgodna ze schematem jest ponawiana z informacją zwrotną', async () => {
    const { client, result } = run(['nie jestem obiektem', validPlan()]);
    const value = await result;

    assert.equal(value.kind, 'plan');
    assert.equal(client.requests.length, 2);
    assert.ok(client.requests[1]!.feedback.length > 0);
    assert.equal(client.requests[0]!.feedback.length, 0);
  });

  test('naruszenie bariery merytorycznej jest ponawiane z instrukcją', async () => {
    const plan = validPlan();
    const zdiagnoza = {
      ...plan,
      zywienie: { ...plan.zywienie, uwagi: ['Twoja diagnoza to insulinooporność'] },
    };

    const { client, result } = run([zdiagnoza, validPlan()]);
    const value = await result;

    assert.equal(value.kind, 'plan');
    assert.ok(client.requests[1]!.feedback.some((item) => /diagnoz/iu.test(item)));
  });

  test('błąd wywołania modelu jest ponawiany', async () => {
    const { client, result } = run([new Error('timeout'), validPlan()]);
    const value = await result;

    assert.equal(value.kind, 'plan');
    assert.equal(client.requests.length, 2);
  });

  test('po trzech nieudanych próbach zadanie trafia do kolejki ręcznej', async () => {
    const { client, result } = run(['zły', 'wynik', 'znowu zły']);
    const value = await result;

    assert.equal(value.kind, 'kolejka_reczna');
    assert.equal(client.requests.length, 3);
    if (value.kind === 'kolejka_reczna') {
      assert.equal(value.reason, 'model_nie_spelnil_wymagan');
      assert.equal(value.attempts.length, 3);
    }
  });

  test('kolejka ręczna dostaje skierowania mimo braku planu', async () => {
    const value = await run(['zły', 'wynik', 'znowu zły']).result;

    assert.equal(value.kind, 'kolejka_reczna');
    if (value.kind === 'kolejka_reczna') {
      assert.deepEqual(value.referrals.panelBazowy, PANEL_BAZOWY);
    }
  });

  test('podsumowanie porażki wskazuje, co poszło nie tak w każdej próbie', async () => {
    const value = await run(['zły', 'wynik', 'znowu zły']).result;

    assert.equal(value.kind, 'kolejka_reczna');
    if (value.kind === 'kolejka_reczna') {
      const summary = summarizeFailure(value.attempts);
      assert.ok(summary.length >= 3);
      assert.ok(summary[0]!.startsWith('Próba 1'));
    }
  });
});

describe('zatrzymanie przed modelem', () => {
  test('kategoria CZERWONA nie wywołuje modelu w ogóle', async () => {
    const { client, result } = run([validPlan()], { intake: { history: { syncope: true } } });
    const value = await result;

    assert.equal(value.kind, 'raport_ryzyk');
    assert.equal(client.requests.length, 0);
  });

  test('raport ryzyk niesie flagi i skierowania', async () => {
    const value = await run([validPlan()], { intake: { history: { exertionalChestPain: true } } }).result;

    assert.equal(value.kind, 'raport_ryzyk');
    if (value.kind === 'raport_ryzyk') {
      assert.equal(value.report.riskCategory, 'CZERWONA');
      assert.ok(value.report.flags.some((flag) => flag.code === 'FLAG_CHEST_PAIN'));
      assert.ok(value.report.referrals.pytaniaWarunkowe.length > 0);
    }
  });

  test('ścieżka ręczna nie wywołuje modelu, ale przygotowuje materiał dla specjalisty', async () => {
    const { client, result } = run([validPlan()], { mode: 'reczna' });
    const value = await result;

    assert.equal(value.kind, 'kolejka_reczna');
    assert.equal(client.requests.length, 0);
    if (value.kind === 'kolejka_reczna') {
      assert.equal(value.reason, 'sciezka_reczna');
      assert.ok(value.referrals.panelBazowy.length > 0);
    }
  });

  test('brak zgody blokuje wszystko', async () => {
    const { client, result } = run([validPlan()], { mode: 'zablokowana' });
    const value = await result;

    assert.equal(value.kind, 'zablokowane');
    assert.equal(client.requests.length, 0);
  });
});

describe('skierowania warunkowe', () => {
  test('mężczyzna po czterdziestce dostaje panel andrologiczny', async () => {
    const value = await run([validPlan()]).result;

    assert.equal(value.kind, 'plan');
    if (value.kind === 'plan') {
      assert.ok(
        value.referrals.paneleWarunkowe.some((panel) => panel.badania.includes('PSA')),
      );
    }
  });

  test('GLP-1 generuje własną grupę pytań do lekarza', async () => {
    const value = await run([validPlan()], { intake: { medications: { glp1OrGip: true } } }).result;

    const referrals = value.kind === 'plan' ? value.referrals : value.kind === 'kolejka_reczna' ? value.referrals : null;
    assert.ok(referrals);
    assert.ok(referrals.pytaniaWarunkowe.some((group) => /GLP-1/u.test(group.powod)));
  });

  test('brak badań generuje pytanie o kolejność wykonania', async () => {
    const value = await run([validPlan()], { intake: { labs: undefined } }).result;
    const referrals = value.kind === 'plan' ? value.referrals : null;

    assert.ok(referrals);
    assert.ok(referrals.pytaniaWarunkowe.some((group) => /Brak aktualnych badań/u.test(group.powod)));
  });

  test('skierowania są deterministyczne', async () => {
    const a = await run([validPlan()]).result;
    const b = await run([validPlan()]).result;

    assert.equal(a.kind, 'plan');
    assert.equal(b.kind, 'plan');
    if (a.kind === 'plan' && b.kind === 'plan') {
      assert.deepEqual(a.referrals, b.referrals);
    }
  });
});
