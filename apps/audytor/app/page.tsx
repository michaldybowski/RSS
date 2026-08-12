import { wybierzAudytora } from '../lib/akcje.ts';
import { AUDYTORZY } from '../lib/dane.ts';

export default function Start() {
  return (
    <>
      <header className="strona">
        <h1>Panel audytora</h1>
        <p>
          Audyt Zdrowe Biuro według schematu „Pracodawca Długowieczności".
          Audyt można zamknąć dopiero po ocenieniu wszystkich kryteriów
          i załączeniu dowodów tam, gdzie standard ich wymaga.
        </p>
      </header>

      <form action={wybierzAudytora}>
        <div className="karta">
          <div className="pytanie">
            <label className="etykieta">Audytor</label>
            <div className="opcje">
              {AUDYTORZY.map((audytor, index) => (
                <label className="opcja" key={audytor.id}>
                  <input type="radio" name="audytorId" value={audytor.id} defaultChecked={index === 0} required />
                  <span>{audytor.imie}</span>
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
