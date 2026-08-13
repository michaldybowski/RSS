import { redirect } from 'next/navigation';

import {
  czyZaliczony,
  katalog,
  ostrzezenia,
  PROG_ZALICZENIA_PROCENT,
  quizMaterialu,
} from '@longevity/academy';

import { oznaczPrzerobiony, wyslijSprawdzian } from '../../../lib/actions.ts';
import { MATERIALY, materialPoIdentyfikatorze, QUIZY } from '../../../lib/akademia.ts';
import { getSession } from '../../../lib/session.ts';
import { PAKIET_UCZESTNIKA } from '../../../lib/wyzwania.ts';

export default async function MaterialStrona({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);

  const material = materialPoIdentyfikatorze(id);
  // Materiał wycofany albo spoza pakietu nie otwiera się z adresu — filtr
  // katalogu byłby inaczej tylko dekoracją listy.
  const widoczny = katalog(MATERIALY, { pakiet: PAKIET_UCZESTNIKA }).some(
    (pozycja) => pozycja.id === id,
  );
  if (material === undefined || !widoczny) redirect('/biblioteka');

  const uwagi = session.assessment === undefined ? [] : ostrzezenia(material, session.assessment);
  const quiz = quizMaterialu(QUIZY, material.id);
  const zaliczony = czyZaliczony(session.zaliczenia, material.id);
  const wynik =
    session.wynikQuizu?.materialId === material.id ? session.wynikQuizu.wynik : undefined;

  return (
    <>
      <header className="strona">
        <h1>{material.tytul}</h1>
        <p>
          {material.czasTrwaniaMin} min · {material.filary.join(', ')}
        </p>
      </header>

      {uwagi.map((uwaga) => (
        // Ostrzeżenie, nie blokada: materiał się czyta, a nie wykonuje.
        <div className="wstrzymane" key={uwaga.kod}>
          <h3>Zanim wdrożysz</h3>
          <p>{uwaga.tresc}</p>
        </div>
      ))}

      <div className="karta">
        <p style={{ marginTop: 0 }}>{material.opis}</p>
        <p className="mala" style={{ marginBottom: 0 }}>
          Materiały programu mają charakter edukacyjny. Nie zastępują konsultacji
          lekarskiej ani indywidualnego planu.
        </p>
      </div>

      {quiz === undefined ? (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Zaliczenie</h2>
          {zaliczony ? (
            <div className="notka">
              Materiał oznaczony jako przerobiony. Zapis mówi wprost, że jest to Twoja
              deklaracja — programu nie interesuje pozorny pomiar uwagi.
            </div>
          ) : (
            <form action={oznaczPrzerobiony}>
              <input type="hidden" name="materialId" value={material.id} />
              <button type="submit">Oznacz jako przerobione</button>
            </form>
          )}
        </div>
      ) : (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Sprawdzian</h2>
          <p className="mala" style={{ marginTop: 0 }}>
            Pytania dotyczą wyłącznie treści materiału. Próg zaliczenia to{' '}
            {PROG_ZALICZENIA_PROCENT}%, podejść możesz dowolnie wiele. Wynik nie wpływa
            na ocenę zdrowia ani na dobór wyzwań.
          </p>

          {wynik !== undefined && (
            <div className={wynik.zaliczony ? 'notka' : 'blad'}>
              {wynik.poprawnych} z {wynik.pytan} poprawnych ({wynik.procent}%) —{' '}
              {wynik.zaliczony ? 'sprawdzian zaliczony' : 'spróbuj ponownie'}.
            </div>
          )}

          {wynik !== undefined && (
            <ul className="odznaki">
              {wynik.pytania.map((pozycja, index) => (
                <li key={pozycja.pytanieId}>
                  <strong>
                    Pytanie {index + 1}: {pozycja.trafiona ? 'poprawnie' : 'błędnie'}
                  </strong>
                  <p className="mala" style={{ margin: '4px 0 0' }}>
                    {pozycja.wyjasnienie}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <form action={wyslijSprawdzian}>
            <input type="hidden" name="materialId" value={material.id} />
            {quiz.pytania.map((pytanie) => (
              <div className="pytanie" key={pytanie.id}>
                <span className="etykieta">{pytanie.tresc}</span>
                <div className="opcje">
                  {pytanie.odpowiedzi.map((odpowiedz, index) => (
                    <label className="opcja" key={odpowiedz}>
                      <input type="radio" name={`pyt_${pytanie.id}`} value={index} required />
                      <span>{odpowiedz}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="akcje">
              <button type="submit">{wynik === undefined ? 'Sprawdź' : 'Spróbuj ponownie'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="akcje">
        <a className="przycisk wtorny" href="/biblioteka">
          Wróć do biblioteki
        </a>
      </div>
    </>
  );
}
