import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { COOKIE_AKTOR } from '../lib/aktor.ts';
import { ORGANIZACJE } from '../lib/dane.ts';

async function wybierz(formData: FormData): Promise<void> {
  'use server';

  const organizationId = String(formData.get('organizationId') ?? '');
  const store = await cookies();
  store.set(COOKIE_AKTOR, organizationId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/dashboard');
}

export default function Start() {
  return (
    <>
      <header className="strona">
        <h1>Panel HR — program Longevity</h1>
        <p>
          Prototyp. Wybierz zakład, dla którego chcesz zobaczyć statystyki. Uprawnienia
          są sprawdzane po stronie serwera przy każdym zapytaniu — panel jednego zakładu
          nie sięgnie po dane drugiego.
        </p>
      </header>

      <form action={wybierz}>
        <div className="karta">
          <div className="pytanie">
            <label className="etykieta" htmlFor="organizationId">
              Zakład
            </label>
            <div className="opcje">
              {ORGANIZACJE.map((organizacja, index) => (
                <label className="opcja" key={organizacja.id}>
                  <input
                    type="radio"
                    name="organizationId"
                    value={organizacja.id}
                    defaultChecked={index === 0}
                    required
                  />
                  <span>{organizacja.nazwa}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="notka">
            Program nie udostępnia pracodawcy danych pojedynczych uczestników. Statystyki
            pokazywane są wyłącznie dla grup liczących co najmniej dziesięć osób, a każde
            wejście jest odnotowywane.
          </div>

          <div className="akcje">
            <button type="submit">Otwórz panel</button>
          </div>
        </div>
      </form>
    </>
  );
}
