import { redirect } from 'next/navigation';

import {
  isVisible,
  progress,
  QUESTIONNAIRE_V1,
  type Answers,
  type Question,
} from '@longevity/questionnaire';
import { pendingOnboardingConsents } from '@longevity/consent';

import { saveStep } from '../../../lib/actions.ts';
import { getSession } from '../../../lib/session.ts';

function Pole({ question, answers }: { question: Question; answers: Answers }) {
  const value = answers[question.code];

  return (
    <div className="pytanie">
      <label className="etykieta" htmlFor={question.code}>
        {question.label}
        {question.required === true && (
          <span className="wymagane" aria-hidden="true">
            *
          </span>
        )}
        {question.unit !== undefined && <span className="jednostka">({question.unit})</span>}
      </label>

      {question.help !== undefined && <p className="pomoc">{question.help}</p>}

      {question.type === 'number' && (
        <input
          id={question.code}
          name={question.code}
          type="number"
          step="any"
          min={question.validation?.min}
          max={question.validation?.max}
          defaultValue={typeof value === 'number' ? value : ''}
          required={question.required === true}
        />
      )}

      {question.type === 'text' && (
        <textarea
          id={question.code}
          name={question.code}
          rows={3}
          maxLength={question.validation?.maxLength}
          defaultValue={typeof value === 'string' ? value : ''}
        />
      )}

      {question.type === 'date' && (
        <input
          id={question.code}
          name={question.code}
          type="date"
          defaultValue={typeof value === 'string' ? value : ''}
        />
      )}

      {question.type === 'single' && (
        <div className="opcje">
          {question.options?.map((option) => (
            <label className="opcja" key={option.value}>
              <input
                type="radio"
                name={question.code}
                value={option.value}
                defaultChecked={value === option.value}
                required={question.required === true}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === 'multi' && (
        <div className="opcje">
          {question.options?.map((option) => (
            <label className="opcja" key={option.value}>
              <input
                type="checkbox"
                name={question.code}
                value={option.value}
                defaultChecked={Array.isArray(value) && value.includes(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function Krok({ params }: { params: Promise<{ krok: string }> }) {
  const [{ krok }, session] = await Promise.all([params, getSession()]);

  if (pendingOnboardingConsents(session.ledger).length > 0) redirect('/');

  const domain = Number(krok);
  const index = QUESTIONNAIRE_V1.steps.findIndex((step) => step.domain === domain);
  const step = QUESTIONNAIRE_V1.steps[index];

  if (step === undefined) redirect('/kwestionariusz/1');

  const answers = session.answers;
  // Pokazujemy wyłącznie pytania spełniające warunek widoczności — to samo
  // źródło prawdy, którego używa walidacja, więc uczestnik nie może zostać
  // odrzucony za pole, którego nie zobaczył.
  const visible = step.questions.filter((question) => isVisible(question, answers));

  // Błędy pochodzą z sesji, nie z adresu — inaczej znikałyby na ścieżce bez JS.
  const issues = session.stepIssues[step.domain] ?? [];

  const wypelnienie = Math.round(progress(QUESTIONNAIRE_V1, answers) * 100);
  const poprzedni = QUESTIONNAIRE_V1.steps[index - 1];

  return (
    <>
      <div className="postep">
        <div className="postep-tor">
          <div className="postep-wypelnienie" style={{ width: `${wypelnienie}%` }} />
        </div>
        <p className="postep-opis">
          Krok {index + 1} z {QUESTIONNAIRE_V1.steps.length} · wypełnione {wypelnienie}%
        </p>
      </div>

      <header className="strona">
        <h1>{step.title}</h1>
        {step.description !== undefined && <p>{step.description}</p>}
      </header>

      {issues.length > 0 && (
        <div className="blad">
          <strong>Popraw przed przejściem dalej:</strong>
          <ul className="zwykla">
            {issues.map((issue) => (
              <li key={`${issue.question}-${issue.code}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <form action={saveStep}>
        <input type="hidden" name="__krok" value={step.domain} />

        <div className="karta">
          {visible.map((question) => (
            <Pole key={question.code} question={question} answers={answers} />
          ))}
        </div>

        <div className="akcje">
          <button type="submit">
            {index + 1 === QUESTIONNAIRE_V1.steps.length ? 'Zakończ' : 'Dalej'}
          </button>
          {poprzedni !== undefined && (
            <a className="przycisk wtorny" href={`/kwestionariusz/${poprzedni.domain}`}>
              Wstecz
            </a>
          )}
        </div>
      </form>
    </>
  );
}
