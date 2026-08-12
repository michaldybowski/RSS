import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, syntheticIntake, SYNTHETIC_NOW } from '@longevity/core';
import { buildReferrals, DISCLAIMER, generatePlan, type PipelineResult } from '@longevity/plan';

import {
  buildBundle,
  buildConsultationPack,
  escapeHtml,
  NoDocumentsError,
  renderBundleDocx,
  renderBundlePdf,
  renderHtml,
  type PdfEngine,
} from '../src/index.ts';
import { PREFERENCES, ScriptedModel, validPlan } from './fixtures.ts';

const ICS_OPTIONS = { weekStart: '2026-08-03', uidPrefix: 'req-1', weeks: 12 };

async function scenario(
  overrides: Parameters<typeof syntheticIntake>[0] = {},
  mode: 'automatyczna' | 'reczna' | 'zablokowana' = 'automatyczna',
) {
  const intake = syntheticIntake(overrides);
  const assessment = assess(intake, { mode: 'synthetic', now: SYNTHETIC_NOW });
  const result: PipelineResult = await generatePlan({
    requestId: 'req-1',
    intake,
    assessment,
    preferences: PREFERENCES,
    mode,
    client: new ScriptedModel([validPlan()]),
  });

  return { intake, assessment, result };
}

describe('pakiet konsultacyjny', () => {
  test('składa się z pięciu dokumentów o stałych kodach', async () => {
    const { intake, assessment } = await scenario();
    const pack = buildConsultationPack({
      intake,
      assessment,
      referrals: buildReferrals(intake, assessment),
      disclaimer: DISCLAIMER,
    });

    assert.deepEqual(
      [
        pack.kartaPacjenta.kod,
        pack.zlecenieBadan.kod,
        pack.planPrzygotowania.kod,
        pack.listaPytan.kod,
        pack.planMonitoringu.kod,
      ],
      ['DOK-1', 'DOK-2', 'DOK-3', 'DOK-4', 'DOK-5'],
    );
  });

  test('każdy dokument niesie zastrzeżenie', async () => {
    const { intake, assessment } = await scenario();
    const pack = buildConsultationPack({
      intake,
      assessment,
      referrals: buildReferrals(intake, assessment),
      disclaimer: DISCLAIMER,
    });

    for (const model of Object.values(pack)) {
      assert.match(model.zastrzezenie, /nie jest diagnozą medyczną/u);
    }
  });

  test('brak badań daje informację zamiast pustej tabeli', async () => {
    const { intake, assessment } = await scenario({ labs: undefined });
    const pack = buildConsultationPack({
      intake,
      assessment,
      referrals: buildReferrals(intake, assessment),
      disclaimer: DISCLAIMER,
    });

    const sekcja = pack.kartaPacjenta.sekcje.find((s) => s.naglowek.includes('laboratoryjne'));
    assert.ok(sekcja?.tresc?.[0]?.includes('nie przekazał'));
    assert.equal(sekcja?.tabela, undefined);
  });

  test('GLP-1 dokłada pomiary glukometrem do przygotowania', async () => {
    const { intake, assessment } = await scenario({ medications: { glp1OrGip: true } });
    const pack = buildConsultationPack({
      intake,
      assessment,
      referrals: buildReferrals(intake, assessment),
      disclaimer: DISCLAIMER,
    });

    const tydzien = pack.planPrzygotowania.sekcje[0]!;
    assert.ok(tydzien.punkty?.some((item) => /glukometr/u.test(item)));
  });

  test('kategoria CZERWONA dopisuje zastrzeżenie do planu monitoringu', async () => {
    const { intake, assessment } = await scenario({ history: { syncope: true } });
    const pack = buildConsultationPack({
      intake,
      assessment,
      referrals: buildReferrals(intake, assessment),
      disclaimer: DISCLAIMER,
    });

    assert.ok(pack.planMonitoringu.sekcje.some((s) => s.naglowek === 'Uwaga'));
  });
});

describe('komplet dokumentów', () => {
  test('plan trafia na początek kompletu', async () => {
    const { intake, assessment, result } = await scenario();
    const bundle = buildBundle({ intake, assessment, result, ics: ICS_OPTIONS });

    assert.equal(bundle.models.length, 6);
    assert.equal(bundle.models[0]?.kod, 'PLAN');
  });

  test('bez planu komplet ma pięć dokumentów i inny tytuł', async () => {
    const { intake, assessment, result } = await scenario({ history: { syncope: true } });
    const bundle = buildBundle({ intake, assessment, result, ics: ICS_OPTIONS });

    assert.equal(result.kind, 'raport_ryzyk');
    assert.equal(bundle.models.length, 5);
    assert.match(bundle.title, /Raport ryzyk/u);
    assert.equal(bundle.ics, undefined);
  });

  test('brak zgody nie daje żadnych dokumentów', async () => {
    const { intake, assessment, result } = await scenario({}, 'zablokowana');
    assert.throws(() => buildBundle({ intake, assessment, result }), NoDocumentsError);
  });

  test('ścieżka ręczna daje pakiet konsultacyjny bez planu', async () => {
    const { intake, assessment, result } = await scenario({}, 'reczna');
    const bundle = buildBundle({ intake, assessment, result });

    assert.equal(bundle.models.length, 5);
    assert.equal(bundle.models[0]?.kod, 'DOK-1');
  });
});

describe('renderer HTML', () => {
  test('dokument jest samowystarczalny — bez odwołań zewnętrznych', async () => {
    const { intake, assessment, result } = await scenario();
    const { html } = buildBundle({ intake, assessment, result });

    assert.ok(!/src=["']https?:/iu.test(html));
    assert.ok(!/href=["']https?:/iu.test(html));
    assert.ok(!/<script/iu.test(html));
    assert.match(html, /<meta charset="utf-8">/u);
  });

  test('polskie znaki przechodzą bez uszczerbku', async () => {
    const { intake, assessment, result } = await scenario();
    const { html } = buildBundle({ intake, assessment, result });

    assert.match(html, /Żywienie/u);
    assert.match(html, /Ćwicz|ćwicz|Środa/u);
  });

  test('kody techniczne nie wyciekają do dokumentu', async () => {
    // Typy dnia treningowego są identyfikatorami bez diakrytyków. W dokumencie
    // dla uczestnika muszą wyglądać jak polskie słowa, a nie jak stałe z kodu.
    const { intake, assessment, result } = await scenario();
    const { html } = buildBundle({ intake, assessment, result });

    for (const kod of ['silowy', 'wytrzymalosciowy', 'mobilnosc']) {
      assert.ok(!html.includes(`<td>${kod}</td>`), `kod "${kod}" w dokumencie`);
    }
    assert.match(html, /siłowy/u);
    assert.match(html, /wytrzymałościowy/u);
  });

  test('treść jest escapowana', () => {
    assert.equal(escapeHtml('<b>x</b> & "y"'), '&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });

  test('wstrzyknięty znacznik nie staje się elementem', () => {
    const html = renderHtml(
      [
        {
          kod: 'X',
          tytul: '<img src=x onerror=alert(1)>',
          sekcje: [{ naglowek: 'A', punkty: ['<script>zle()</script>'] }],
          zastrzezenie: 'z',
        },
      ],
      'test',
    );

    assert.ok(!/<script>/u.test(html));
    assert.ok(!/<img /u.test(html));
    assert.match(html, /&lt;script&gt;/u);
  });

  test('każdy dokument zaczyna nową stronę wydruku', async () => {
    const { intake, assessment, result } = await scenario();
    const { html } = buildBundle({ intake, assessment, result });

    assert.match(html, /page-break-after: always/u);
    assert.equal((html.match(/<article class="dokument">/gu) ?? []).length, 6);
  });
});

describe('renderer DOCX', () => {
  test('produkuje plik Office Open XML', async () => {
    const { intake, assessment, result } = await scenario();
    const bundle = buildBundle({ intake, assessment, result });
    const buffer = await renderBundleDocx(bundle);

    // Sygnatura ZIP — DOCX jest archiwum.
    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK');
    assert.ok(buffer.length > 5000);
    assert.ok(buffer.includes(Buffer.from('word/document.xml')));
  });
});

describe('renderer PDF', () => {
  test('silnik jest wstrzykiwany — testy nie uruchamiają przeglądarki', async () => {
    const { intake, assessment, result } = await scenario();
    const bundle = buildBundle({ intake, assessment, result });

    let received = '';
    const engine: PdfEngine = {
      fromHtml: async (html) => {
        received = html;
        return Buffer.from('%PDF-1.4 fake');
      },
    };

    const pdf = await renderBundlePdf(bundle, engine);

    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(received, bundle.html);
  });
});
