import { wybierzLekarza } from '../lib/akcje.ts';
import { LEKARZE } from '../lib/dane.ts';

export default function Start() {
  return (
    <>
      <header className="strona">
        <h1>Panel lekarza</h1>
        <p>
          Grafik konsultacji, Karta Pacjenta i zlecenia badań. Karta otwiera się
          wyłącznie za aktywną zgodą uczestnika, a każde jej otwarcie jest odnotowane
          i widoczne dla niego w jego panelu.
        </p>
      </header>

      <form action={wybierzLekarza}>
        <div className="karta">
          <div className="pytanie">
            <label className="etykieta">Lekarz</label>
            <div className="opcje">
              {LEKARZE.map((lekarz, index) => (
                <label className="opcja" key={lekarz.id}>
                  <input
                    type="radio"
                    name="lekarzId"
                    value={lekarz.id}
                    defaultChecked={index === 0}
                    required
                  />
                  <span>{lekarz.imie}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="akcje">
            <button type="submit">Otwórz grafik</button>
          </div>
        </div>
      </form>
    </>
  );
}
