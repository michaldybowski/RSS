/**
 * Ewaluacja logiki warunkowej.
 *
 * Zasada domyślna: brak odpowiedzi oznacza warunek niespełniony. Pytanie
 * warunkowe nie pokazuje się „na wszelki wypadek" — inaczej uczestnik dostaje
 * pola, których kontekstu nie widzi.
 */

import type { Answers, AnswerValue, Condition, Question, QuestionnaireDefinition } from './types.ts';

export function evaluate(condition: Condition, answers: Answers): boolean {
  switch (condition.kind) {
    case 'equals':
      return answers[condition.question] === condition.value;

    case 'includes': {
      const value = answers[condition.question];
      return Array.isArray(value) && value.includes(condition.value);
    }

    case 'greaterThan': {
      const value = answers[condition.question];
      return typeof value === 'number' && value > condition.value;
    }

    case 'lessThan': {
      const value = answers[condition.question];
      return typeof value === 'number' && value < condition.value;
    }

    case 'answered':
      return isAnswered(answers[condition.question]);

    case 'all':
      return condition.conditions.every((inner) => evaluate(inner, answers));

    case 'any':
      return condition.conditions.some((inner) => evaluate(inner, answers));

    case 'not':
      return !evaluate(condition.condition, answers);
  }
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function isVisible(question: Question, answers: Answers): boolean {
  return question.showIf === undefined || evaluate(question.showIf, answers);
}

/** Pytania faktycznie pokazane uczestnikowi przy danym stanie odpowiedzi. */
export function visibleQuestions(
  definition: QuestionnaireDefinition,
  answers: Answers,
): readonly Question[] {
  return definition.steps
    .flatMap((step) => step.questions)
    .filter((question) => isVisible(question, answers));
}

export function allQuestions(definition: QuestionnaireDefinition): readonly Question[] {
  return definition.steps.flatMap((step) => step.questions);
}

export function findQuestion(
  definition: QuestionnaireDefinition,
  code: string,
): Question | undefined {
  return allQuestions(definition).find((question) => question.code === code);
}

/**
 * Postęp liczony po pytaniach widocznych, nie po wszystkich. Uczestnik, który
 * nie bierze GLP-1, nie powinien oglądać paska utkniętego na 80%.
 */
export function progress(definition: QuestionnaireDefinition, answers: Answers): number {
  const visible = visibleQuestions(definition, answers);
  if (visible.length === 0) return 1;
  const answered = visible.filter((question) => isAnswered(answers[question.code])).length;
  return answered / visible.length;
}
