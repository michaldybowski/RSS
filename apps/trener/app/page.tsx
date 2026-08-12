import { wybierzTrenera } from '../lib/akcje.ts';
import { TRENERZY } from '../lib/dane.ts';

export default function Start() {
  return (
    <>
      <header className="strona">
        <h1>Panel trenera</h1>
        <p>
          Prototyp. Wybierz trenera, żeby zobaczyć jego warsztaty. Lista obecności
          i rozliczenie są dostępne wyłącznie dla prowadzącego dane zajęcia.
        </p>
      </header>

      <form action={wybierzTrenera}>
        <div className="karta">
          <div className="pytanie">
            <label className="etykieta">Trener</label>
            <div className="opcje">
              {TRENERZY.map((trener, index) => (
                <label className="opcja" key={trener.id}>
                  <input type="radio" name="trenerId" value={trener.id} defaultChecked={index === 0} required />
                  <span>{trener.imie}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="notka">
            Lista zapisanych pokazuje imię z inicjałem nazwiska i kod uczestnika —
            tyle, ile potrzeba do sprawdzenia obecności przy wejściu. Pełne dane
            osobowe nie są tu dostępne.
          </div>

          <div className="akcje">
            <button type="submit">Otwórz panel</button>
          </div>
        </div>
      </form>
    </>
  );
}
