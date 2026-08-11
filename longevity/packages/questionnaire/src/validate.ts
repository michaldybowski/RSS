/**
 * Walidacja odpowiedzi (Etap 1 pipeline'u, specyfikacja 8).
 *
 * Walidujemy wyłącznie pytania widoczne. Odpowiedź na pytanie ukryte jest
 * błędem, nie „nadmiarową informacją" — oznacza, że stan formularza rozjechał
 * się z logiką warunkową, a wtedy nie wiadomo, co uczestnik naprawdę widział.
 */

import { isAnswered, isVisible } from './conditions.ts';
import type { Answers, Question, QuestionnaireDefinition, ValidationIssue } from './types.ts';

export function validateAnswers(
  definition: QuestionnaireDefinition,
  answers: Answers,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const questions = definition.steps.flatMap((step) => step.questions);
  const byCode = new Map(questions.map((question) => [question.code, question]));

  for (const code of Object.keys(answers)) {
    if (!byCode.has(code)) {
      issues.push({
        question: code,
        code: 'nieznane_pytanie',
        message: `Odpowiedź na nieistniejące pytanie "${code}".`,
      });
    }
  }

  for (const question of questions) {
    const visible = isVisible(question, answers);
    const value = answers[question.code];
    const answered = isAnswered(value);

    if (!visible) {
      if (answered) {
        issues.push({
          question: question.code,
          code: 'pytanie_niewidoczne',
          message: `Pytanie "${question.label}" nie było widoczne, a ma odpowiedź.`,
        });
      }
      continue;
    }

    if (!answered) {
      if (question.required === true) {
        issues.push({
          question: question.code,
          code: 'wymagane',
          message: `Pytanie "${question.label}" jest wymagane.`,
        });
      }
      continue;
    }

    issues.push(...validateValue(question, value as NonNullable<typeof value>));
  }

  return issues;
}

function validateValue(question: Question, value: Answers[string]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { validation } = question;

  switch (question.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(typeIssue(question, 'liczby'));
        break;
      }
      if (validation?.min !== undefined && value < validation.min) {
        issues.push(rangeIssue(question, validation.min, validation.max));
      } else if (validation?.max !== undefined && value > validation.max) {
        issues.push(rangeIssue(question, validation.min, validation.max));
      }
      break;
    }

    case 'text': {
      if (typeof value !== 'string') {
        issues.push(typeIssue(question, 'tekstu'));
        break;
      }
      if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
        issues.push({
          question: question.code,
          code: 'za_dlugie',
          message: `Odpowiedź na "${question.label}" przekracza ${validation.maxLength} znaków.`,
        });
      }
      break;
    }

    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
        issues.push(typeIssue(question, 'daty w formacie RRRR-MM-DD'));
        break;
      }
      if (Number.isNaN(new Date(value).getTime())) {
        issues.push(typeIssue(question, 'poprawnej daty'));
      }
      break;
    }

    case 'single':
    case 'boolean': {
      if (typeof value !== 'string' && typeof value !== 'boolean') {
        issues.push(typeIssue(question, 'pojedynczego wyboru'));
        break;
      }
      if (question.options !== undefined && typeof value === 'string') {
        if (!question.options.some((option) => option.value === value)) {
          issues.push(unknownOptionIssue(question, value));
        }
      }
      break;
    }

    case 'multi': {
      if (!Array.isArray(value)) {
        issues.push(typeIssue(question, 'listy wyborów'));
        break;
      }
      if (question.options !== undefined) {
        for (const selected of value) {
          if (!question.options.some((option) => option.value === selected)) {
            issues.push(unknownOptionIssue(question, selected));
          }
        }
      }
      if (validation?.maxSelected !== undefined && value.length > validation.maxSelected) {
        issues.push({
          question: question.code,
          code: 'za_wiele_opcji',
          message: `W pytaniu "${question.label}" można wybrać maksymalnie ${validation.maxSelected}.`,
        });
      }
      break;
    }
  }

  return issues;
}

function typeIssue(question: Question, expected: string): ValidationIssue {
  return {
    question: question.code,
    code: 'zly_typ',
    message: `Pytanie "${question.label}" oczekuje ${expected}.`,
  };
}

function rangeIssue(question: Question, min?: number, max?: number): ValidationIssue {
  const range =
    min !== undefined && max !== undefined
      ? `${min}–${max}`
      : min !== undefined
        ? `co najmniej ${min}`
        : `co najwyżej ${max}`;
  return {
    question: question.code,
    code: 'poza_zakresem',
    message: `Wartość w "${question.label}" musi mieścić się w zakresie ${range}.`,
  };
}

function unknownOptionIssue(question: Question, value: string): ValidationIssue {
  return {
    question: question.code,
    code: 'nieznana_opcja',
    message: `Opcja "${value}" nie istnieje w pytaniu "${question.label}".`,
  };
}

export function isComplete(definition: QuestionnaireDefinition, answers: Answers): boolean {
  return validateAnswers(definition, answers).length === 0;
}
