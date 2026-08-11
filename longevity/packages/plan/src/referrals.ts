/**
 * Zlecenie badań i lista pytań do lekarza — Dokumenty 2 i 4 pakietu konsultacyjnego.
 *
 * Powstają z reguł, nie z modelu (specyfikacja 8). To treść o charakterze
 * medycznym: musi być identyczna dla identycznych danych wejściowych i musi
 * dać się obronić progiem, a nie stylem wypowiedzi.
 *
 * STATUS: wersja robocza, obejmuje ją ta sama walidacja medyczna co czerwone
 * flagi (decyzja 8).
 */

import type { Assessment, ParticipantIntake } from '@longevity/core';

export interface ConditionalPanel {
  /** Dlaczego panel został zlecony — pokazywane uczestnikowi i lekarzowi. */
  powod: string;
  badania: readonly string[];
}

export interface QuestionGroup {
  powod: string;
  pytania: readonly string[];
}

export interface Referrals {
  panelBazowy: readonly string[];
  paneleWarunkowe: readonly ConditionalPanel[];
  pytaniaUniwersalne: readonly string[];
  pytaniaWarunkowe: readonly QuestionGroup[];
}

/** Panel Bazowy Longevity — ten sam dla każdego uczestnika. */
export const PANEL_BAZOWY: readonly string[] = [
  'Morfologia pełna z rozmazem',
  'Glukoza na czczo',
  'HbA1c',
  'Insulina na czczo',
  'Lipidogram pełny (cholesterol całkowity, LDL, HDL, trójglicerydy)',
  'Witamina D (25-OH)',
  'Ferrytyna, żelazo, TIBC',
  'TSH, FT3, FT4',
  'Kreatynina z eGFR',
  'ALT, AST, GGTP',
  'Witamina B12',
  'Kwas foliowy',
  'CRP (hs-CRP jeśli dostępne)',
  'Homocysteina',
  'Kwas moczowy',
  'Badanie ogólne moczu',
];

const PYTANIA_UNIWERSALNE: readonly string[] = [
  'Czy moje wyniki pozwalają na bezpieczne rozpoczęcie programu z treningiem siłowym?',
  'Czy przyjmowane przeze mnie leki wymagają korekty przy planowanej zmianie diety i aktywności?',
  'Czy powinienem wykonać badania dodatkowe poza zleconymi?',
  'Jakie są przeciwwskazania do wysiłku fizycznego w moim przypadku?',
  'Jak często powinienem kontrolować badania w trakcie programu?',
];

export function buildReferrals(intake: ParticipantIntake, assessment: Assessment): Referrals {
  return {
    panelBazowy: PANEL_BAZOWY,
    paneleWarunkowe: conditionalPanels(intake, assessment),
    pytaniaUniwersalne: PYTANIA_UNIWERSALNE,
    pytaniaWarunkowe: conditionalQuestions(intake, assessment),
  };
}

function conditionalPanels(intake: ParticipantIntake, assessment: Assessment): ConditionalPanel[] {
  const panels: ConditionalPanel[] = [];
  const { derived } = assessment;
  const flags = new Set(assessment.flags.map((flag) => flag.code));

  if (intake.sex === 'M' && intake.ageYears >= 40) {
    panels.push({
      powod: 'Mężczyzna powyżej 40. roku życia',
      badania: ['Testosteron całkowity i wolny', 'SHBG', 'PSA'],
    });
  }

  if (intake.sex === 'K') {
    panels.push({
      powod: 'Ocena statusu hormonalnego',
      badania: ['FSH', 'LH', 'Estradiol', 'Progesteron'],
    });
  }

  const podejrzenieIR =
    derived.bmi > 30 ||
    derived.whrCategory === 'wysoki' ||
    (derived.homaIr !== undefined && derived.homaIr > 2.5);

  if (podejrzenieIR) {
    panels.push({
      powod: 'Wskaźniki sugerujące zaburzenia gospodarki węglowodanowej',
      badania: ['OGTT 75 g z insuliną (0, 1, 2 h)', 'C-peptyd'],
    });
  }

  if (intake.lifestyle.stressLevel >= 8) {
    panels.push({
      powod: 'Wysoki deklarowany poziom stresu',
      badania: ['Kortyzol poranny (godz. 8:00)', 'DHEA-S'],
    });
  }

  if (flags.has('FLAG_APNEA_SUSPECT')) {
    panels.push({
      powod: 'Współwystępowanie chrapania, otyłości i zmęczenia dziennego',
      badania: ['Polisomnografia — skierowanie', 'Skala senności Epworth'],
    });
  }

  if (flags.has('FLAG_CRP_HIGH') || derived.bmi > 35) {
    panels.push({
      powod: 'Wykładniki stanu zapalnego',
      badania: ['IL-6', 'TNF-alfa', 'Fibrynogen'],
    });
  }

  const ryzykoSercowe =
    intake.ageYears > 50 ||
    derived.whrCategory === 'wysoki' ||
    intake.history.familyHistory.includes('zawal');

  if (ryzykoSercowe) {
    panels.push({
      powod: 'Ocena ryzyka sercowo-naczyniowego',
      badania: ['EKG spoczynkowe', 'ApoB', 'Lp(a) — jednorazowo w życiu'],
    });
  }

  if (intake.history.chronicConditions.length > 0 || derived.bmi > 30) {
    panels.push({
      powod: 'Ocena składu ciała i gęstości kości',
      badania: ['DEXA — skład ciała i densytometria'],
    });
  }

  return panels;
}

function conditionalQuestions(intake: ParticipantIntake, assessment: Assessment): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  const flags = new Set(assessment.flags.map((flag) => flag.code));

  if (flags.has('FLAG_GLP1_ACTIVE')) {
    groups.push({
      powod: 'Leczenie GLP-1/GIP',
      pytania: [
        'Czy moja obecna dawka jest optymalna przy planowanym treningu siłowym?',
        'Czy powinienem monitorować glikemię glukometrem i jak często?',
        'Kiedy powinna odbyć się następna kontrola leczenia?',
        'Jakie objawy hipoglikemii powinny mnie zaniepokoić?',
      ],
    });
  }

  if (flags.has('FLAG_HYPERTENSION')) {
    groups.push({
      powod: 'Leczone nadciśnienie',
      pytania: [
        'Czy mogę bezpiecznie wykonywać ćwiczenia wielostawowe z obciążeniem?',
        'Czy powinienem mierzyć ciśnienie przed treningiem i po nim?',
      ],
    });
  }

  if (intake.medications.thyroidHormones || intake.history.chronicConditions.includes('tarczyca')) {
    groups.push({
      powod: 'Choroba tarczycy',
      pytania: [
        'Czy moje wyniki TSH, FT3 i FT4 są optymalnie wyrównane, a nie tylko mieszczą się w normie?',
        'Czy zmiana pory posiłków wpłynie na wchłanianie mojego leczenia?',
      ],
    });
  }

  if (flags.has('FLAG_APNEA_SUSPECT')) {
    groups.push({
      powod: 'Podejrzenie bezdechu sennego',
      pytania: [
        'Czy potrzebuję polisomnografii?',
        'Czy moje zmęczenie w ciągu dnia może wynikać z zaburzeń oddychania podczas snu?',
      ],
    });
  }

  if (assessment.riskCategory === 'CZERWONA') {
    groups.push({
      powod: 'Wynik wymagający oceny przed rozpoczęciem programu',
      pytania: [
        'Które z moich wyników wymagają pilnej interwencji?',
        'Kiedy będę mógł bezpiecznie rozpocząć program aktywności?',
        'Jakie badania kontrolne powinienem wykonać przed ponowną oceną?',
      ],
    });
  }

  if (intake.labs === undefined) {
    groups.push({
      powod: 'Brak aktualnych badań',
      pytania: [
        'Czy Panel Bazowy jest w moim przypadku wystarczający?',
        'Czy któreś z badań powinienem wykonać w pierwszej kolejności?',
      ],
    });
  }

  return groups;
}
