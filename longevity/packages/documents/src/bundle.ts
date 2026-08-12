/**
 * Złożenie kompletu dokumentów dla jednego uczestnika.
 *
 * Wejściem jest wynik pipeline'u, nie surowe dane — dzięki temu komplet
 * dokumentów zawsze odpowiada temu, co system faktycznie policzył, i nie da się
 * wygenerować planu dla kogoś, komu pipeline planu nie przyznał.
 */

import type { Assessment, ParticipantIntake } from '@longevity/core';
import type { PipelineResult } from '@longevity/plan';

import { renderDocx } from './docx.ts';
import { renderHtml } from './html.ts';
import { renderIcs, type IcsOptions } from './ics.ts';
import { buildConsultationPack, buildPlanDocument, type DocumentModel } from './model.ts';
import type { PdfEngine } from './pdf.ts';

export interface BundleInput {
  intake: ParticipantIntake;
  assessment: Assessment;
  result: PipelineResult;
  ics?: IcsOptions;
}

export interface DocumentBundle {
  models: readonly DocumentModel[];
  html: string;
  /** Kalendarz powstaje tylko wtedy, gdy jest plan z harmonogramem. */
  ics?: string;
  title: string;
}

export class NoDocumentsError extends Error {
  constructor(reason: string) {
    super(`Nie ma z czego złożyć dokumentów: ${reason}.`);
    this.name = 'NoDocumentsError';
  }
}

export function buildBundle(input: BundleInput): DocumentBundle {
  const { intake, assessment, result } = input;

  if (result.kind === 'zablokowane') {
    throw new NoDocumentsError('brak zgody na przetwarzanie danych zdrowotnych');
  }

  const referrals = result.kind === 'raport_ryzyk' ? result.report.referrals : result.referrals;
  const disclaimer = result.kind === 'plan' ? result.disclaimer : result.kind === 'raport_ryzyk' ? result.report.disclaimer : DISCLAIMER_FALLBACK;

  const pack = buildConsultationPack({ intake, assessment, referrals, disclaimer });

  const models: DocumentModel[] = [
    pack.kartaPacjenta,
    pack.zlecenieBadan,
    pack.planPrzygotowania,
    pack.listaPytan,
    pack.planMonitoringu,
  ];

  // Plan jest pierwszy, gdy istnieje — to jego uczestnik szuka najpierw.
  if (result.kind === 'plan') {
    models.unshift(buildPlanDocument(result.plan, result.disclaimer));
  }

  const title =
    result.kind === 'plan'
      ? 'Plan Longevity i pakiet konsultacyjny'
      : 'Raport ryzyk i pakiet konsultacyjny';

  return {
    models,
    html: renderHtml(models, title),
    title,
    ...(result.kind === 'plan' && input.ics !== undefined
      ? { ics: renderIcs(result.plan, input.ics) }
      : {}),
  };
}

export async function renderBundleDocx(bundle: DocumentBundle): Promise<Buffer> {
  return renderDocx(bundle.models, bundle.title);
}

export async function renderBundlePdf(bundle: DocumentBundle, engine: PdfEngine): Promise<Buffer> {
  return engine.fromHtml(bundle.html);
}

const DISCLAIMER_FALLBACK =
  'Ten materiał nie jest diagnozą medyczną ani zaleceniem leczenia. Skonsultuj go z lekarzem.';
