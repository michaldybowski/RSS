/**
 * Normalizacja: odpowiedzi kwestionariusza → znormalizowane wejście silnika reguł.
 *
 * To jest granica między światem formularza (kody pytań, opcje, tekst) a światem
 * reguł (typy dziedzinowe). Silnik nie zna kodów pytań, kwestionariusz nie zna
 * progów — dzięki temu wersja kwestionariusza i wersja reguł zmieniają się
 * niezależnie.
 */

import type { ParticipantIntake, PlanPreferences, Sex } from '@longevity/core';
import { validateAnswers } from './validate.ts';
import type { Answers, QuestionnaireDefinition, ValidationIssue } from './types.ts';

export class NormalizationError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(
      `Nie można znormalizować odpowiedzi — ${issues.length} ${
        issues.length === 1 ? 'błąd' : 'błędów'
      }: ${issues.map((issue) => issue.message).join(' ')}`,
    );
    this.name = 'NormalizationError';
  }
}

export interface NormalizedIntake {
  intake: ParticipantIntake;
  preferences: PlanPreferences;
}

export function normalize(
  definition: QuestionnaireDefinition,
  answers: Answers,
): NormalizedIntake {
  const issues = validateAnswers(definition, answers);
  if (issues.length > 0) throw new NormalizationError(issues);

  const read = reader(answers);

  const labs = buildLabs(read);

  const intake: ParticipantIntake = {
    ageYears: read.number('d1_wiek') ?? 0,
    sex: (read.text('d1_plec') ?? 'X') as Sex,
    anthropometry: {
      weightKg: read.number('d3_waga') ?? 0,
      heightCm: read.number('d3_wzrost') ?? 0,
      ...optional('waistCm', read.number('d3_talia')),
      ...optional('hipCm', read.number('d3_biodra')),
    },
    ...(labs !== undefined ? { labs } : {}),
    medications: {
      glp1OrGip: read.list('d2_leki_metaboliczne').includes('glp1_gip'),
      hypertensionTreated: read.yesNo('d2_leki_nadcisnienie'),
      psychotropics: read.yesNo('d2_leki_psychotropowe'),
      thyroidHormones: read.yesNo('d2_leki_tarczyca'),
    },
    history: {
      syncope: read.yesNo('d1_omdlenia'),
      exertionalChestPain: read.yesNo('d1_bol_w_klatce'),
      eatingDisorder: read.yesNo('d1_zaburzenia_odzywiania'),
      snoring: read.yesNo('d1_chrapanie'),
      daytimeFatigue: read.yesNo('d1_zmeczenie_dzienne'),
      chronicConditions: read.list('d1_choroby_przewlekle').filter((item) => item !== 'brak'),
      familyHistory: read.list('d1_historia_rodzinna').filter((item) => item !== 'brak'),
    },
    lifestyle: {
      sleepHoursWeekday: read.number('d6_godziny_sen') ?? 0,
      sleepQuality: (read.numericChoice('d6_jakosc') ?? 3) as 1 | 2 | 3 | 4 | 5,
      nightWakeups: (read.numericChoice('d6_wybudzenia') ?? 0) as 0 | 1 | 2 | 3,
      trainingDaysPerWeek: read.number('d5_trening_dni') ?? 0,
      ...optional('stepsPerDay', read.number('d5_kroki')),
      stressLevel: read.number('d7_poziom_stresu') ?? 5,
      mealsPerDay: read.number('d4_posilki_dziennie') ?? 3,
      waterIntake: (read.text('d4_woda') ?? '1-2l') as ParticipantIntake['lifestyle']['waterIntake'],
      ...optional('vegetableServingsPerDay', read.number('d4_warzywa_porcje')),
      alcohol: (read.text('d2_alkohol') ?? 'brak') as ParticipantIntake['lifestyle']['alcohol'],
      nicotine: (read.text('d2_nikotyna') ?? 'nie') as ParticipantIntake['lifestyle']['nicotine'],
      preventiveScreeningsUpToDate: read.yesNo('d9_profilaktyka_aktualna'),
    },
  };

  return { intake, preferences: buildPreferences(read) };
}

function buildLabs(read: Reader): ParticipantIntake['labs'] {
  const labs = {
    ...optional('drawnAt', read.text('d9_data_badan')),
    ...optional('glucoseMgDl', read.number('d9_glukoza')),
    ...optional('hba1cPct', read.number('d9_hba1c')),
    ...optional('insulinUIUmL', read.number('d9_insulina')),
    ...optional('ldlMgDl', read.number('d9_ldl')),
    ...optional('hdlMgDl', read.number('d9_hdl')),
    ...optional('triglyceridesMgDl', read.number('d9_trojglicerydy')),
    ...optional('vitaminDNgMl', read.number('d9_witamina_d')),
    ...optional('ferritinNgMl', read.number('d9_ferrytyna')),
    ...optional('tshMIUL', read.number('d9_tsh')),
    ...optional('crpMgL', read.number('d9_crp')),
  };

  // Pusty panel to brak panelu, nie panel z samymi lukami — inaczej
  // FLAG_LABS_STALE zachowywałaby się różnie dla „nie podałem nic"
  // w zależności od tego, czy uczestnik dotknął kroku 9.
  return Object.keys(labs).length === 0 ? undefined : labs;
}

function buildPreferences(read: Reader): PlanPreferences {
  const limitations = read.list('d5_ograniczenia_ruchowe').filter((item) => item !== 'brak');
  const equipment = read.list('d5_sprzet');
  const aversions = splitFreeText(read.text('d4_awersje'));
  const dealBreakers = splitFreeText(read.text('d10_deal_breakery'));

  return {
    goals: read.list('d10_cel_glowny'),
    planFormat: (read.text('d10_format_planu') ?? 'elastyczny') as PlanPreferences['planFormat'],
    minutesPerSession: read.numericChoice('d5_czas_sesji') ?? 45,
    daysAvailable: read.number('d5_dni_dostepne') ?? read.number('d5_trening_dni') ?? 3,
    timeWindows: read.list('d5_okna_czasowe'),
    equipment,
    dietaryPattern: read.text('d4_dieta') ?? 'bez_ograniczen',
    aversions: [...aversions, ...dealBreakers],
    movementLimitations: limitations,
  };
}

/**
 * Tekst swobodny rozbijany na pozycje i przycinany. Do modelu i tak trafia
 * przez skaner pól zakazanych — ale lepiej ograniczyć go już tutaj, niż liczyć
 * na to, że uczestnik nie wpisze numeru telefonu w polu „czego nie zjesz".
 */
function splitFreeText(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(/[,;\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 60)
    .slice(0, 10);
}

interface Reader {
  number: (code: string) => number | undefined;
  text: (code: string) => string | undefined;
  list: (code: string) => readonly string[];
  yesNo: (code: string) => boolean;
  numericChoice: (code: string) => number | undefined;
}

function reader(answers: Answers): Reader {
  return {
    number: (code) => {
      const value = answers[code];
      return typeof value === 'number' ? value : undefined;
    },
    text: (code) => {
      const value = answers[code];
      return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
    },
    list: (code) => {
      const value = answers[code];
      return Array.isArray(value) ? value : [];
    },
    yesNo: (code) => answers[code] === 'tak' || answers[code] === true,
    numericChoice: (code) => {
      const value = answers[code];
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
