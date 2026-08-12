import { wybierzKonto } from '../lib/akcje.ts';
import { KONTA } from '../lib/dane.ts';

export default function Start() {
  return (
    <>
      <header className="strona">
        <h1>Panel administratora</h1>
        <p>
          Utrzymanie systemu: import treści z Notion, obsługa wniosków osób,
          retencja i stan reguł. Panel nie daje dostępu do danych zdrowotnych
          uczestników — administrator ich nie potrzebuje i nie może ich odczytać.
        </p>
      </header>

      <form action={wybierzKonto}>
        <div className="karta">
          <div className="pytanie">
            <label className="etykieta">Konto</label>
            <div className="opcje">
              {KONTA.map((konto, index) => (
                <label className="opcja" key={konto.id}>
                  <input
                    type="radio"
                    name="kontoId"
                    value={konto.id}
                    defaultChecked={index === 0}
                    required
                  />
                  <span>{konto.opis}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="akcje">
            <button type="submit">Otwórz panel</button>
          </div>
        </div>
      </form>
    </>
  );
}
