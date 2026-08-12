/**
 * Demo Fazy A — cała droga na danych syntetycznych.
 *
 * Odpowiedzi kwestionariusza → normalizacja → ocena ryzyka → plan (model
 * zastąpiony atrapą) → komplet dokumentów w HTML, PDF, DOCX i iCal.
 *
 * Uruchomienie:
 *   npm run demo -- --out ./out
 *   CHROMIUM_PATH=/ścieżka/do/chrome npm run demo -- --out ./out
 *
 * Bez CHROMIUM_PATH generowanie PDF jest pomijane, reszta i tak powstaje.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assess } from '@longevity/core';
import { grant, planGenerationMode, type ConsentLedger } from '@longevity/consent';
import { normalize, QUESTIONNAIRE_V1, syntheticAnswers } from '@longevity/questionnaire';
import { generatePlan, summarizeFailure } from '@longevity/plan';
import {
  buildBundle,
  ChromiumPdfEngine,
  renderBundleDocx,
  renderBundlePdf,
} from '@longevity/documents';

import { PROTOTYPE_MODEL } from './prototypeModel.ts';

const outDir = argValue('--out') ?? './out';
const now = new Date('2026-07-26T00:00:00Z');
const evidence = { ipHash: 'demo', userAgentHash: 'demo' };

// Krok 0 — zgody. Bez nich pipeline zwróciłby "zablokowane".
let ledger: ConsentLedger = [];
for (const code of ['regulamin', 'dane_zdrowotne', 'przetwarzanie_ai'] as const) {
  ledger = grant(ledger, code, now.toISOString(), evidence);
}

const { intake, preferences } = normalize(QUESTIONNAIRE_V1, syntheticAnswers());
const assessment = assess(intake, { mode: 'synthetic', now });

console.log(`Health Score: ${assessment.healthScore.overall}/100`);
console.log(`Kategoria ryzyka: ${assessment.riskCategory}`);
console.log(`Flagi: ${assessment.flags.map((flag) => flag.code).join(', ') || 'brak'}`);
console.log(`Tryb generowania: ${planGenerationMode(ledger)}`);

const result = await generatePlan({
  requestId: 'demo-1',
  intake,
  assessment,
  preferences,
  mode: planGenerationMode(ledger),
  client: PROTOTYPE_MODEL,
});

console.log(`Wynik pipeline'u: ${result.kind}`);
if (result.kind === 'kolejka_reczna' && result.attempts.length > 0) {
  for (const line of summarizeFailure(result.attempts)) console.log(`  ${line}`);
}

const bundle = buildBundle({
  intake,
  assessment,
  result,
  ics: { weekStart: '2026-08-03', uidPrefix: 'demo-1', weeks: 12 },
});

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'dokumenty.html'), bundle.html, 'utf8');
await writeFile(join(outDir, 'dokumenty.docx'), await renderBundleDocx(bundle));
if (bundle.ics !== undefined) await writeFile(join(outDir, 'harmonogram.ics'), bundle.ics, 'utf8');

const chromium = process.env.CHROMIUM_PATH;
if (chromium !== undefined) {
  const pdf = await renderBundlePdf(bundle, new ChromiumPdfEngine({ executablePath: chromium }));
  // CHROMIUM_NO_SANDBOX=1 potrzebne tylko wtedy, gdy proces działa jako root.
  await writeFile(join(outDir, 'dokumenty.pdf'), pdf);
  console.log(`PDF: ${pdf.length} bajtów`);
} else {
  console.log('PDF pominięty — ustaw CHROMIUM_PATH, żeby go wygenerować.');
}

console.log(`Dokumenty (${bundle.models.length}): ${bundle.models.map((m) => m.kod).join(', ')}`);
console.log(`Zapisano w ${outDir}`);

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
