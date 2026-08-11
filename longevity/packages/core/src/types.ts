/**
 * Znormalizowane dane wejściowe uczestnika.
 *
 * To NIE jest kształt odpowiedzi z kwestionariusza — te są przechowywane
 * per pytanie w `intake_answer` (patrz specyfikacja, 4.2). Tutaj trafia
 * wynik normalizacji: jednostki sprowadzone do jednego układu, pola
 * warunkowe rozwinięte, wartości puste jawnie opcjonalne.
 */

export type Sex = 'K' | 'M' | 'X';

export interface Anthropometry {
  weightKg: number;
  heightCm: number;
  waistCm?: number;
  hipCm?: number;
}

/** Domena 9 kwestionariusza. Wszystkie pola opcjonalne — badania bywają nieaktualne lub żadne. */
export interface LabPanel {
  /** Data pobrania, ISO 8601 (YYYY-MM-DD). */
  drawnAt?: string;
  glucoseMgDl?: number;
  hba1cPct?: number;
  insulinUIUmL?: number;
  ldlMgDl?: number;
  hdlMgDl?: number;
  triglyceridesMgDl?: number;
  vitaminDNgMl?: number;
  ferritinNgMl?: number;
  tshMIUL?: number;
  crpMgL?: number;
}

/** Domena 2 — leki w kategoriach, nie nazwach handlowych (decyzja 3, minimalizacja). */
export interface Medications {
  glp1OrGip: boolean;
  hypertensionTreated: boolean;
  psychotropics: boolean;
  thyroidHormones: boolean;
}

/** Domena 1 — stan zdrowia i historia. */
export interface MedicalHistory {
  syncope: boolean;
  exertionalChestPain: boolean;
  eatingDisorder: boolean;
  snoring: boolean;
  daytimeFatigue: boolean;
  chronicConditions: readonly string[];
  familyHistory: readonly string[];
}

/** Domeny 4–8 — styl życia. */
export interface Lifestyle {
  sleepHoursWeekday: number;
  /** Subiektywna jakość snu, 1 (fatalna) – 5 (bardzo dobra). */
  sleepQuality: 1 | 2 | 3 | 4 | 5;
  nightWakeups: 0 | 1 | 2 | 3;
  trainingDaysPerWeek: number;
  stepsPerDay?: number;
  /** Poziom stresu, 1 (brak) – 10 (skrajny). */
  stressLevel: number;
  mealsPerDay: number;
  waterIntake: '<1l' | '1-2l' | '2-3l' | '>3l';
  vegetableServingsPerDay?: number;
  alcohol: 'brak' | 'okazjonalnie' | 'tygodniowo' | 'codziennie';
  nicotine: 'nie' | 'okazjonalnie' | 'codziennie';
  /** Czy badania profilaktyczne są aktualne wg wieku i płci. */
  preventiveScreeningsUpToDate: boolean;
}

export interface ParticipantIntake {
  ageYears: number;
  sex: Sex;
  anthropometry: Anthropometry;
  labs?: LabPanel;
  medications: Medications;
  history: MedicalHistory;
  lifestyle: Lifestyle;
}

/** Kategorie ryzyka. Nazwy kolorami, nie A/B/C — patrz ADR-06 w specyfikacji. */
export type RiskCategory = 'ZIELONA' | 'ŻÓŁTA' | 'CZERWONA';

export type FlagLevel = Exclude<RiskCategory, 'ZIELONA'>;

export interface RedFlag {
  code: string;
  level: FlagLevel;
  /** Komunikat pokazywany uczestnikowi. Podlega walidacji medycznej razem z progiem. */
  message: string;
  /** Wersja zestawu reguł, przy której flaga powstała. */
  rulesetVersion: string;
}

export type WhrCategory = 'prawidłowy' | 'podwyższony' | 'wysoki';

export interface DerivedMetrics {
  bmi: number;
  whr?: number;
  whrCategory?: WhrCategory;
  /** Podstawowa przemiana materii, Mifflin-St Jeor (kcal/dobę). */
  bmr: number;
  /** Całkowity wydatek energetyczny (kcal/dobę). */
  tdee: number;
  /** HOMA-IR — tylko gdy dostępne glukoza i insulina na czczo. */
  homaIr?: number;
}
