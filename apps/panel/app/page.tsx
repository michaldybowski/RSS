import { definitionOf, pendingOnboardingConsents } from '@longevity/consent';

import { acceptConsents } from '../lib/actions.ts';
import { ONBOARDING_CONSENTS } from '../lib/config.ts';
import { getSession } from '../lib/session.ts';

export default async function Start() {
  const session = await getSession();
  const brakZgod =
    session.consentAttempted && pendingOnboardingConsents(session.ledger).length > 0;

  return (
    <>
      <header className="strona">
        <h1>Program Longevity</h1>
        <p>
          Kwestionariusz zajmuje około piętnastu minut. Na końcu otrzymasz ocenę
          w sześciu obszarach, plan i komplet dokumentów do rozmowy z lekarzem.
        </p>
      </header>

      {brakZgod && (
        <div className="blad">
          Bez wszystkich trzech zgód nie możemy przetwarzać Twoich odpowiedzi.
          Każdą z nich możesz później wycofać.
        </div>
      )}

      <form action={acceptConsents}>
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Zanim zaczniemy</h2>

          {ONBOARDING_CONSENTS.map((code) => {
            const definition = definitionOf(code);
            return (
              <div className="pytanie" key={code}>
                <label className="opcja">
                  <input
                    type="checkbox"
                    name={code}
                    defaultChecked={session.ledger.some(
                      (event) => event.code === code && event.kind === 'granted',
                    )}
                  />
                  <span>
                    <strong>{definition.title}</strong>
                    <p className="pomoc" style={{ marginTop: 4 }}>
                      {definition.text}
                    </p>
                    <p className="pomoc">
                      <em>Po wycofaniu: {definition.withdrawalEffect}</em>
                    </p>
                  </span>
                </label>
              </div>
            );
          })}

          <div className="notka">
            Program nie stawia diagnozy i nie zastępuje wizyty u lekarza. Ocena
            ryzyka liczona jest regułami, nie przez system AI — sztuczna
            inteligencja przygotowuje wyłącznie opisową część planu.
          </div>

          <div className="akcje">
            <button type="submit">Rozpocznij kwestionariusz</button>
          </div>
        </div>
      </form>
    </>
  );
}
