/**
 * Bariery merytoryczne nakładane na odpowiedź modelu.
 *
 * Walidacja strukturalna sprawdza, czy plan ma właściwy kształt. Ten moduł
 * sprawdza, czy model nie przekroczył swoich uprawnień: nie postawił diagnozy,
 * nie ruszył leków, nie zignorował ograniczeń wynikających z kategorii ryzyka
 * i nie zaplanował więcej treningów, niż uczestnik zadeklarował, że udźwignie.
 *
 * Naruszenie bariery nie jest poprawiane po cichu — wraca do modelu jako
 * informacja zwrotna i wymusza ponowienie.
 */

import type { Assessment, PlanPreferences } from '@longevity/core';
import type { Plan } from './plan.ts';

export interface GuardrailViolation {
  rule: string;
  message: string;
  /** Treść przekazywana modelowi przy ponowieniu. */
  feedback: string;
}

/** Sformułowania, których model nie ma prawa użyć. */
const ZAKAZANE_FRAZY: readonly { pattern: RegExp; rule: string; feedback: string }[] = [
  {
    pattern: /\b(diagnoz\w*|rozpozna\w+)\b/iu,
    rule: 'brak_diagnozy',
    feedback: 'Nie stawiaj diagnozy i nie używaj słów „diagnoza" ani „rozpoznanie".',
  },
  {
    pattern: /\b(dawk\w+|mg\b|odstaw\w*|zwiększ\s+dawk\w+|zmniejsz\s+dawk\w+)/iu,
    rule: 'brak_zalecen_lekowych',
    feedback: 'Nie odnoś się do dawek leków ani nie sugeruj ich zmiany lub odstawienia.',
  },
  {
    pattern: /\b(metformin\w*|semaglutyd\w*|tirzepatyd\w*|lewotyroksyn\w*|insulin\w*)\b/iu,
    rule: 'brak_nazw_lekow',
    feedback: 'Nie wymieniaj nazw leków. Odnoś się do kategorii, jeśli to konieczne.',
  },
  {
    pattern: /\b(wyleczy\w*|gwarantuj\w*|na pewno schudniesz)\b/iu,
    rule: 'brak_obietnic',
    feedback: 'Nie obiecuj wyleczenia ani gwarantowanych efektów.',
  },
];

const INTENSYWNE = /\b(hiit|maksymaln\w+\s+intensywn\w+|do\s+upadku|sprint\w*|test\s+1rm|1rm)\b/iu;

export function checkGuardrails(
  plan: Plan,
  assessment: Assessment,
  preferences: PlanPreferences,
): readonly GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const tekst = collectText(plan);

  for (const { pattern, rule, feedback } of ZAKAZANE_FRAZY) {
    const match = tekst.match(pattern);
    if (match !== null) {
      violations.push({
        rule,
        message: `Plan zawiera niedozwolone sformułowanie: "${match[0]}".`,
        feedback,
      });
    }
  }

  const dniTreningowe = plan.trening.mikrocykl.filter((day) => day.typ !== 'wolne' && day.typ !== 'regeneracja');

  if (dniTreningowe.length > preferences.daysAvailable) {
    violations.push({
      rule: 'limit_dni_treningowych',
      message: `Plan zakłada ${dniTreningowe.length} dni treningowych, uczestnik zadeklarował ${preferences.daysAvailable}.`,
      feedback: `Zaplanuj najwyżej ${preferences.daysAvailable} dni treningowych w tygodniu.`,
    });
  }

  const zaDlugie = dniTreningowe.filter((day) => day.czasMin > preferences.minutesPerSession);
  if (zaDlugie.length > 0) {
    violations.push({
      rule: 'limit_czasu_sesji',
      message: `Sesje dłuższe niż zadeklarowane ${preferences.minutesPerSession} min: dni ${zaDlugie
        .map((day) => day.dzien)
        .join(', ')}.`,
      feedback: `Żadna sesja nie może przekraczać ${preferences.minutesPerSession} minut.`,
    });
  }

  if (assessment.constraints.includes('intensywnosc_treningu_ograniczona') && INTENSYWNE.test(tekst)) {
    violations.push({
      rule: 'ograniczenie_intensywnosci',
      message: 'Plan zawiera akcenty maksymalnej intensywności mimo kategorii ŻÓŁTEJ.',
      feedback:
        'Kategoria ryzyka wymaga ograniczenia intensywności — bez HIIT, sprintów, testów 1RM i pracy do upadku.',
    });
  }

  if (hasFlag(assessment, 'FLAG_GLP1_ACTIVE') && !mentionsGlycemia(plan)) {
    violations.push({
      rule: 'monitoring_glikemii',
      message: 'Uczestnik na GLP-1/GIP, a monitoring nie obejmuje glikemii.',
      feedback: 'Uwzględnij w monitoringu pomiar glikemii — uczestnik przyjmuje leki z grupy GLP-1/GIP.',
    });
  }

  if (hasFlag(assessment, 'FLAG_APNEA_SUSPECT') && !mentionsSleepDiagnostics(plan)) {
    violations.push({
      rule: 'diagnostyka_bezdechu',
      message: 'Podejrzenie bezdechu sennego bez odniesienia w protokole snu.',
      feedback:
        'W protokole snu odnieś się do potrzeby diagnostyki w kierunku bezdechu sennego, bez stawiania rozpoznania.',
    });
  }

  const ograniczenia = preferences.movementLimitations;
  if (ograniczenia.length > 0 && !mentionsLimitations(plan, ograniczenia)) {
    violations.push({
      rule: 'ograniczenia_ruchowe',
      message: `Plan pomija zgłoszone ograniczenia ruchowe: ${ograniczenia.join(', ')}.`,
      feedback: `Uwzględnij zgłoszone ograniczenia ruchowe (${ograniczenia.join(', ')}) w doborze ćwiczeń.`,
    });
  }

  const dniHarmonogramu = new Set(plan.harmonogram.map((item) => item.dzien));
  const dniBezWpisu = plan.trening.mikrocykl
    .filter((day) => day.typ !== 'wolne' && !dniHarmonogramu.has(day.dzien))
    .map((day) => day.dzien);

  if (dniBezWpisu.length > 0) {
    violations.push({
      rule: 'spojnosc_harmonogramu',
      message: `Dni z treningiem bez wpisu w harmonogramie: ${dniBezWpisu.join(', ')}.`,
      feedback: 'Każdy dzień z zaplanowaną aktywnością musi mieć odpowiadający wpis w harmonogramie.',
    });
  }

  return violations;
}

function hasFlag(assessment: Assessment, code: string): boolean {
  return assessment.flags.some((flag) => flag.code === code);
}

function mentionsGlycemia(plan: Plan): boolean {
  return /glikemi\w*|glukoz\w*|glukometr\w*|cukr\w+\s+we\s+krwi/iu.test(
    plan.monitoring.wskazniki.join(' ') + ' ' + plan.monitoring.punktyKontrolne.join(' '),
  );
}

function mentionsSleepDiagnostics(plan: Plan): boolean {
  return /bezdech\w*|polisomnograf\w*|badani\w+\s+snu/iu.test(plan.sen.protokol.join(' '));
}

function mentionsLimitations(plan: Plan, limitations: readonly string[]): boolean {
  const tekst = collectText(plan).toLowerCase();
  const slowa: Readonly<Record<string, RegExp>> = {
    kregoslup_l: /lędźwi\w*|kręgosłup\w*|odcink\w+\s+lędźwi\w*/iu,
    kregoslup_sz: /szyjn\w*|kark\w*|kręgosłup\w*/iu,
    kolana: /kolan\w*/iu,
    barki: /bark\w*|obręcz\w+\s+barkow\w*/iu,
    biodra: /biodr\w*/iu,
  };

  return limitations.every((limitation) => slowa[limitation]?.test(tekst) ?? true);
}

function collectText(plan: Plan): string {
  return [
    plan.podsumowanie,
    ...plan.zywienie.zasady,
    ...plan.zywienie.uwagi,
    ...plan.zywienie.posilki.flatMap((meal) => [meal.pora, meal.opis, ...meal.przyklady]),
    ...plan.trening.mikrocykl.flatMap((day) => day.bloki),
    ...plan.trening.progresja,
    ...plan.sen.protokol,
    plan.sen.celGodzin,
    ...plan.harmonogram.map((item) => `${item.czynnosc} ${item.filar}`),
    ...plan.monitoring.wskazniki,
    ...plan.monitoring.punktyKontrolne,
  ].join(' \n ');
}
