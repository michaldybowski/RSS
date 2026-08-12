import { redirect } from 'next/navigation';

import { pendingOnboardingConsents } from '@longevity/consent';
import { QUESTIONNAIRE_V1, validateAnswers } from '@longevity/questionnaire';

import { submitIntake } from '../../lib/actions.ts';
import { getSession } from '../../lib/session.ts';

export default async function Podsumowanie() {
  const session = await getSession();

  if (pendingOnboardingConsents(session.ledger).length > 0) redirect('/');

  const issues = validateAnswers(QUESTIONNAIRE_V1, session.answers);
  const brakujace = issues.filter((issue) => issue.code === 'wymagane');

  const krokDlaPytania = (code: string): number =>
    QUESTIONNAIRE_V1.steps.find((step) => step.questions.some((q) => q.code === code))?.domain ?? 1;

  return (
    <>
      <header className="strona">
        <h1>Wszystko gotowe</h1>
        <p>
          Ocena ryzyka policzy się regułami, a plan powstanie na jej podstawie.
          Zajmie to chwilę.
        </p>
      </header>

      {issues.length > 0 ? (
        <div className="karta">
          <div className="blad">
            <strong>Brakuje odpowiedzi w {brakujace.length || issues.length} miejscach.</strong>
            <p style={{ margin: '6px 0 0' }}>
              Bez nich nie da się policzyć oceny ryzyka — nie zgadujemy za Ciebie.
            </p>
          </div>

          <ul className="zwykla">
            {issues.map((issue) => (
              <li key={`${issue.question}-${issue.code}`}>
                {issue.message}{' '}
                <a href={`/kwestionariusz/${krokDlaPytania(issue.question)}`}>Uzupełnij</a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form action={submitIntake}>
          <div className="karta">
            <p style={{ marginTop: 0 }}>
              Kwestionariusz jest kompletny. Po wysłaniu zobaczysz wynik w sześciu
              obszarach, kategorię ryzyka i — jeśli nie ma przeciwwskazań — plan
              wraz z dokumentami do rozmowy z lekarzem.
            </p>
            <div className="akcje">
              <button type="submit">Policz mój wynik</button>
              <a className="przycisk wtorny" href="/kwestionariusz/10">
                Wróć do odpowiedzi
              </a>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
