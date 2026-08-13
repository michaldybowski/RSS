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
import { dolacz, zapiszPomiar } from '@longevity/challenges';
import { odwolaj, zarezerwuj } from '@longevity/clinical';
import { zloz } from '@longevity/marketplace';
import {
  ocenQuiz,
  postepSciezki,
  wydajZaswiadczenie,
  zaliczDeklaracja,
  zaliczSprawdzianem,
} from '@longevity/academy';

import { PROTOTYPE_MODEL } from './prototypeModel.ts';
import { ensureSessionCookie, getSession, resetSession, saveSession } from './session.ts';
import { NOW, ONBOARDING_CONSENTS } from './config.ts';
import { MATERIALY, materialPoIdentyfikatorze, QUIZY, sciezkaPoId } from './akademia.ts';
import { terminPoId, TERAZ as TERAZ_KONSULTACJE } from './konsultacje.ts';
import { OFERTY, PARTNERZY, TERAZ_MARKETPLACE } from './marketplace.ts';
import {
  DZISIAJ,
  PAKIET_UCZESTNIKA,
  SUBJECT_REF,
  wyzwaniePoId,
  ZESPOL_UCZESTNIKA,
} from './wyzwania.ts';

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

/**
 * Zapis do wyzwania.
 *
 * Kwalifikacja jest sprawdzana w pakiecie, nie tutaj — `dolacz` rzuca
 * wyjątkiem, gdy ocena ryzyka odradza tę metrykę. Panel nie decyduje
 * o dopuszczeniu, tylko pokazuje decyzję.
 */
export async function dolaczDoWyzwania(formData: FormData): Promise<void> {
  const session = await getSession();
  if (session.assessment === undefined) redirect('/');

  const wyzwanie = wyzwaniePoId(String(formData.get('wyzwanieId') ?? ''));
  if (wyzwanie === undefined) redirect('/wyzwania');

  const zapis = dolacz(
    wyzwanie,
    { ocena: session.assessment, pakiet: PAKIET_UCZESTNIKA },
    SUBJECT_REF,
    DZISIAJ,
    wyzwanie.typ === 'zespolowe' ? ZESPOL_UCZESTNIKA : undefined,
  );

  session.zapisy = [...session.zapisy, zapis];
  saveSession(session);
  revalidatePath(`/wyzwania/${wyzwanie.id}`);
  revalidatePath('/wyzwania');
}

/** Wpis dzienny. Odrzucenie pomiaru wraca do uczestnika jako komunikat. */
export async function zapiszWynikDnia(formData: FormData): Promise<void> {
  const session = await getSession();
  const wyzwanieId = String(formData.get('wyzwanieId') ?? '');

  const wyzwanie = wyzwaniePoId(wyzwanieId);
  const zapis = session.zapisy.find((pozycja) => pozycja.wyzwanieId === wyzwanieId);
  if (wyzwanie === undefined || zapis === undefined) redirect('/wyzwania');

  const wartosc = Number(formData.get('wartosc'));
  const dzien = String(formData.get('dzien') ?? DZISIAJ);

  try {
    session.pomiary = [
      ...zapiszPomiar(
        session.pomiary,
        { wyzwanieId, dzien, wartosc, zrodlo: 'reczne' },
        { wyzwanie, od: zapis.od, dzisiaj: DZISIAJ },
      ),
    ];
    session.bladPomiaru = undefined;
  } catch (blad) {
    // Odrzucenie pomiaru jest normalnym wynikiem, nie awarią — uczestnik
    // ma zobaczyć powód przy formularzu, a nie stronę błędu.
    session.bladPomiaru = blad instanceof Error ? blad.message : 'Nie udało się zapisać pomiaru.';
  }

  saveSession(session);
  revalidatePath(`/wyzwania/${wyzwanieId}`);
}

/**
 * Zaliczenie materiału deklaracją.
 *
 * „Przerobiłem" jest deklaracją i tak jest zapisywane. Nie mierzymy uwagi
 * i nie udajemy, że mierzymy — zaświadczenie ma mówić, co się faktycznie
 * wydarzyło, a nie sugerować pomiar, którego nie było.
 */
export async function oznaczPrzerobiony(formData: FormData): Promise<void> {
  const session = await getSession();
  const material = materialPoIdentyfikatorze(String(formData.get('materialId') ?? ''));
  if (material === undefined) redirect('/biblioteka');

  session.zaliczenia = [...zaliczDeklaracja(session.zaliczenia, material, NOW.toISOString())];
  saveSession(session);
  revalidatePath(`/biblioteka/${material.id}`);
  revalidatePath('/akademia');
}

/** Sprawdzian. Podejść jest dowolnie wiele — bramka po jednej pomyłce niczego nie uczy. */
export async function wyslijSprawdzian(formData: FormData): Promise<void> {
  const session = await getSession();
  const material = materialPoIdentyfikatorze(String(formData.get('materialId') ?? ''));
  const quiz = QUIZY.find((pozycja) => pozycja.id === material?.quizId);
  if (material === undefined || quiz === undefined) redirect('/biblioteka');

  const odpowiedzi: Record<string, number> = {};
  for (const pytanie of quiz.pytania) {
    const wybrana = formData.get(`pyt_${pytanie.id}`);
    if (typeof wybrana === 'string' && wybrana !== '') odpowiedzi[pytanie.id] = Number(wybrana);
  }

  const wynik = ocenQuiz(quiz, odpowiedzi);
  session.wynikQuizu = { materialId: material.id, wynik };

  if (wynik.zaliczony) {
    session.zaliczenia = [
      ...zaliczSprawdzianem(session.zaliczenia, material, wynik, NOW.toISOString()),
    ];
  }

  saveSession(session);
  revalidatePath(`/biblioteka/${material.id}`);
  revalidatePath('/akademia');
}

/** Zaświadczenie o ukończeniu ścieżki. Należy do uczestnika, nie do pracodawcy. */
export async function odbierzZaswiadczenie(formData: FormData): Promise<void> {
  const session = await getSession();
  const sciezka = sciezkaPoId(String(formData.get('sciezkaId') ?? ''));
  if (sciezka === undefined) redirect('/akademia');

  const postep = postepSciezki(sciezka, MATERIALY, session.zaliczenia);

  session.zaswiadczenia = [
    ...session.zaswiadczenia,
    wydajZaswiadczenie(
      sciezka,
      postep,
      SUBJECT_REF,
      session.zaswiadczenia.length + 1,
      NOW.toISOString(),
    ),
  ];

  saveSession(session);
  revalidatePath('/akademia');
}

/**
 * Rezerwacja konsultacji.
 *
 * Reguła puli pilnej jest w pakiecie, nie tutaj — panel pokazuje jej skutek
 * i powód, a nie decyduje o dostępie. Odmowa wraca do uczestnika komunikatem,
 * bo „nie da się" bez wyjaśnienia wygląda jak awaria.
 */
export async function zarezerwujTermin(formData: FormData): Promise<void> {
  const session = await getSession();
  if (session.assessment === undefined) redirect('/');

  const termin = terminPoId(String(formData.get('terminId') ?? ''));
  if (termin === undefined) redirect('/konsultacje');

  try {
    session.konsultacje = [
      ...session.konsultacje,
      zarezerwuj(session.konsultacje, {
        termin,
        participantId: SUBJECT_REF,
        subjectRef: SUBJECT_REF,
        kategoria: session.assessment.riskCategory,
        teraz: TERAZ_KONSULTACJE,
        powod: String(formData.get('powod') ?? ''),
      }),
    ];
    session.bladRezerwacji = undefined;
  } catch (blad) {
    session.bladRezerwacji =
      blad instanceof Error ? blad.message : 'Nie udało się zarezerwować terminu.';
  }

  saveSession(session);
  revalidatePath('/konsultacje');
}

export async function odwolajTermin(formData: FormData): Promise<void> {
  const session = await getSession();
  const konsultacja = session.konsultacje.find(
    (pozycja) => pozycja.id === String(formData.get('konsultacjaId') ?? ''),
  );
  const termin = konsultacja === undefined ? undefined : terminPoId(konsultacja.terminId);
  if (konsultacja === undefined || termin === undefined) redirect('/konsultacje');

  const odwolana = odwolaj(konsultacja, termin, TERAZ_KONSULTACJE);
  session.konsultacje = session.konsultacje.map((pozycja) =>
    pozycja.id === odwolana.id ? odwolana : pozycja,
  );

  saveSession(session);
  revalidatePath('/konsultacje');
}

/**
 * Zamówienie u partnera.
 *
 * Kwalifikacja partnera jest w pakiecie: zamówienie u partnera bez podpisanej
 * umowy rzuca wyjątkiem, a nie tworzy transakcji, której nikt nie honoruje.
 */
export async function zamowUsluge(formData: FormData): Promise<void> {
  const session = await getSession();
  const oferta = OFERTY.find((pozycja) => pozycja.id === String(formData.get('ofertaId') ?? ''));
  const partner = PARTNERZY.find((pozycja) => pozycja.id === oferta?.partnerId);
  if (oferta === undefined || partner === undefined) redirect('/marketplace');

  session.zamowienia = [
    ...session.zamowienia,
    zloz(oferta, partner, SUBJECT_REF, TERAZ_MARKETPLACE),
  ];

  saveSession(session);
  revalidatePath('/marketplace');
}
