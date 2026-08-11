/**
 * Model kwestionariusza wstępnego (specyfikacja 4.2, dokument kwietniowy część I.2).
 *
 * Definicja jest danymi, nie kodem: kroki, pytania, walidacja i logika warunkowa
 * opisane strukturą. Dzięki temu wersjonowanie kwestionariusza nie wymaga
 * zmiany silnika, a odpowiedzi historyczne dają się odtworzyć przy wersji,
 * w której powstały.
 */

export type AnswerPrimitive = string | number | boolean;
export type AnswerValue = AnswerPrimitive | readonly string[];

export type QuestionType =
  | 'number'
  | 'text'
  | 'single'
  | 'multi'
  | 'boolean'
  | 'date';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionValidation {
  min?: number;
  max?: number;
  maxLength?: number;
  maxSelected?: number;
}

/**
 * Warunek widoczności. Język celowo mały — im więcej wyrazistości, tym
 * trudniej udowodnić, że uczestnik zobaczył pytanie, na które odpowiedział.
 */
export type Condition =
  | { kind: 'equals'; question: string; value: AnswerPrimitive }
  | { kind: 'includes'; question: string; value: string }
  | { kind: 'greaterThan'; question: string; value: number }
  | { kind: 'lessThan'; question: string; value: number }
  | { kind: 'answered'; question: string }
  | { kind: 'all'; conditions: readonly Condition[] }
  | { kind: 'any'; conditions: readonly Condition[] }
  | { kind: 'not'; condition: Condition };

export interface Question {
  code: string;
  type: QuestionType;
  label: string;
  /** Wymagane oznacza: bez tego nie da się policzyć ryzyka ani planu. */
  required?: boolean;
  options?: readonly QuestionOption[];
  validation?: QuestionValidation;
  /** Pytanie widoczne tylko wtedy, gdy warunek jest spełniony. */
  showIf?: Condition;
  /** Jednostka pokazywana przy polu liczbowym. */
  unit?: string;
  /** Wyjaśnienie dla uczestnika — dlaczego pytamy. */
  help?: string;
}

export interface QuestionnaireStep {
  /** Numer domeny wg dokumentu kwietniowego. Krok 0 to zgody, obsługiwane osobno. */
  domain: number;
  title: string;
  description?: string;
  questions: readonly Question[];
}

export interface QuestionnaireDefinition {
  version: string;
  steps: readonly QuestionnaireStep[];
}

export type Answers = Readonly<Record<string, AnswerValue>>;

export interface ValidationIssue {
  question: string;
  code:
    | 'wymagane'
    | 'poza_zakresem'
    | 'nieznana_opcja'
    | 'zly_typ'
    | 'za_dlugie'
    | 'za_wiele_opcji'
    | 'pytanie_niewidoczne'
    | 'nieznane_pytanie';
  message: string;
}
