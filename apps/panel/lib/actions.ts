'use server';

/**
 * Akcje serwerowe panelu.
 *
 * Formularze działają bez JavaScriptu po stronie klienta — to nie jest ozdoba.
 * Panel ma zadziałać na sprzęcie zakładowym i na starszej przeglądarce, bo
 * inaczej pilotaż odpadnie na pierwszym stanowisku produkcyjnym.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assess } from '@longevity/core';
import { grant, planGenerationMode, pendingOnboardingConsents } from '@longevity/consent';
import type { ConsentCode } from '@longevity/consent';
import {
  normalize,
  QUESTIONNAIRE_V1,
  validateAnswers,
  type AnswerValue,
} from '@longevity/questionnaire';
import { generatePlan } from '@longevity/plan';

import { PROTOTYPE_MODEL } from './prototypeModel.ts';
import { ensureSessionCookie, getSession, resetSession, saveSession } from './session.ts';
import { NOW, ONBOARDING_CONSENTS } from './config.ts';

const EVIDENCE = { ipHash: 'prototyp', userAgentHash: 'prototyp' };

export async function acceptConsents(formData: FormData): Promise<void> {
  const session = await getSession();
  await ensureSessionCookie(session);

  let ledger = session.ledger;
  for (const code of ONBOARDING_CONSENTS) {
    if (formData.get(code) === 'on') {
      ledger = grant(ledger, code as ConsentCode, NOW.toISOString(), EVIDENCE);
    }
  }

  saveSession({ ...session, ledger, consentAttempted: true });

  // Przekierowanie pod ten sam adres nie odświeża widoku — router uznaje je
  // za brak zmiany. Gdy zostajemy na miejscu, prosimy o ponowne renderowanie.
  if (pendingOnboardingConsents(ledger).length > 0) {
    revalidatePath('/');
    return;
  }

  redirect('/kwestionariusz/1');
}

/**
 * Zapis jednego kroku. Walidujemy tylko pytania z tego kroku — uczestnik nie
 * może zostać zablokowany błędem z kroku, którego jeszcze nie widział.
 */
export async function saveStep(formData: FormData): Promise<void> {
  const session = await getSession();
  await ensureSessionCookie(session);

  const step = Number(formData.get('__krok'));
  const answers: Record<string, AnswerValue> = { ...session.answers };
  const definition = QUESTIONNAIRE_V1.steps.find((item) => item.domain === step);

  if (definition === undefined) redirect('/kwestionariusz/1');

  for (const question of definition.questions) {
    const values = formData.getAll(question.code).filter((value) => value !== '');

    if (values.length === 0) {
      delete answers[question.code];
      continue;
    }

    if (question.type === 'multi') {
      answers[question.code] = values.map(String);
    } else if (question.type === 'number') {
      const parsed = Number(String(values[0]).replace(',', '.'));
      if (Number.isFinite(parsed)) answers[question.code] = parsed;
      else delete answers[question.code];
    } else {
      answers[question.code] = String(values[0]);
    }
  }

  const codes = new Set(definition.questions.map((question) => question.code));
  const issues = validateAnswers(QUESTIONNAIRE_V1, answers).filter((issue) =>
    codes.has(issue.question),
  );

  const stepIssues = { ...session.stepIssues };
  if (issues.length > 0) stepIssues[step] = issues;
  else delete stepIssues[step];

  saveSession({ ...session, answers, stepIssues });

  if (issues.length > 0) {
    revalidatePath(`/kwestionariusz/${step}`);
    return;
  }

  const next = QUESTIONNAIRE_V1.steps.findIndex((item) => item.domain === step) + 1;
  const nextStep = QUESTIONNAIRE_V1.steps[next];

  if (nextStep === undefined) redirect('/podsumowanie');
  redirect(`/kwestionariusz/${nextStep.domain}`);
}

export async function submitIntake(): Promise<void> {
  const session = await getSession();
  await ensureSessionCookie(session);

  const { intake, preferences } = normalize(QUESTIONNAIRE_V1, session.answers);
  const assessment = assess(intake, { mode: 'synthetic', now: NOW });

  const result = await generatePlan({
    requestId: session.id,
    intake,
    assessment,
    preferences,
    mode: planGenerationMode(session.ledger),
    client: PROTOTYPE_MODEL,
  });

  saveSession({ ...session, intake, preferences, assessment, result });
  redirect('/wynik');
}

export async function startOver(): Promise<void> {
  await resetSession();
  redirect('/');
}
