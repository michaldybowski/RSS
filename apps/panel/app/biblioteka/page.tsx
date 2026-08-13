import { czyZaliczony, filary, katalog, proponowane, type FiltrBiblioteki, type TypMaterialu } from '@longevity/academy';

import { MATERIALY } from '../../lib/akademia.ts';
import { getSession } from '../../lib/session.ts';
import { PAKIET_UCZESTNIKA } from '../../lib/wyzwania.ts';

const TYPY: readonly TypMaterialu[] = ['lekcja', 'webinar', 'podcast', 'artykul', 'ebook', 'zeszyt'];

const OPIS_TYPU: Readonly<Record<TypMaterialu, string>> = {
  lekcja: 'lekcja',
  webinar: 'webinar',
  podcast: 'podcast',
  artykul: 'artykuł',
  ebook: 'e-book',
  zeszyt: 'zeszyt ćwiczeń',
};

export default async function Biblioteka({
  searchParams,
}: {
  searchParams: Promise<{ filar?: string; typ?: string; fraza?: string }>;
}) {
  const [{ filar = '', typ = '', fraza = '' }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);

  const filtr: FiltrBiblioteki = {
    pakiet: PAKIET_UCZESTNIKA,
    ...(filar !== '' ? { filar } : {}),
    ...(TYPY.includes(typ as TypMaterialu) ? { typ: typ as TypMaterialu } : {}),
    ...(fraza !== '' ? { fraza } : {}),
  };

  const wyniki = katalog(MATERIALY, filtr);
  const dostepneFilary = filary(MATERIALY);

  // Filtrowanie jest intencją uczestnika. Sekcja „Dla Ciebie" nad wynikami
  // pokazywałaby wtedy materiały, których świadomie nie szukał — dlatego
  // propozycje znikają, gdy filtr jest ustawiony.
  const filtrujeUzytkownik = filar !== '' || typ !== '' || fraza !== '';

  // Propozycje liczone tutaj, przy renderowaniu — nigdzie nie zapisywane.
  const propozycje =
    session.assessment === undefined || filtrujeUzytkownik
      ? []
      : proponowane(MATERIALY, session.assessment, { pakiet: PAKIET_UCZESTNIKA, ile: 3 });

  return (
    <>
      <header className="strona">
        <h1>Biblioteka</h1>
        <p>
          Materiały programu. To, co czytasz, zostaje na Twoim koncie — nie wraca
          do redakcji i nie trafia do pracodawcy w postaci imiennej.
        </p>
      </header>

      {propozycje.length > 0 && (
        <div className="karta">
          <h2 style={{ marginTop: 0 }}>Dla Ciebie</h2>
          <p className="mala" style={{ marginTop: 0 }}>
            Dobrane do obszarów, w których Twój wynik wypadł najsłabiej. Propozycja
            liczona przy otwarciu strony; nie jest zapisywana ani przekazywana dalej.
          </p>
          <ul className="lista-plikow">
            {propozycje.map((material) => (
              <li key={material.id}>
                <span>
                  <strong>{material.tytul}</strong>
                  <p className="plik-opis">
                    {OPIS_TYPU[material.typ]} · {material.czasTrwaniaMin} min ·{' '}
                    {material.filary.join(', ')}
                  </p>
                </span>
                <a className="przycisk wtorny" href={`/biblioteka/${material.id}`}>
                  Otwórz
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="karta" method="get">
        <div className="filtry">
          <label className="filtr">
            Filar
            <select name="filar" defaultValue={filar}>
              <option value="">wszystkie</option>
              {dostepneFilary.map((pozycja) => (
                <option key={pozycja} value={pozycja}>
                  {pozycja}
                </option>
              ))}
            </select>
          </label>
          <label className="filtr">
            Typ
            <select name="typ" defaultValue={typ}>
              <option value="">wszystkie</option>
              {TYPY.map((pozycja) => (
                <option key={pozycja} value={pozycja}>
                  {OPIS_TYPU[pozycja]}
                </option>
              ))}
            </select>
          </label>
          <label className="filtr" style={{ flex: 1 }}>
            Szukaj
            <input type="text" name="fraza" defaultValue={fraza} placeholder="np. sen" />
          </label>
          <button type="submit">Filtruj</button>
        </div>
      </form>

      <div className="karta">
        <h2 style={{ marginTop: 0 }}>
          Materiały <span className="mala">({wyniki.length})</span>
        </h2>

        {wyniki.length === 0 ? (
          <p style={{ margin: 0 }}>
            Nic nie pasuje do tych filtrów. Wyczyść frazę albo wybierz inny filar.
          </p>
        ) : (
          wyniki.map((material) => (
            <div className="wyzwanie" key={material.id}>
              <div className="wyzwanie-naglowek">
                <span className="wyzwanie-nazwa">{material.tytul}</span>
                {czyZaliczony(session.zaliczenia, material.id) && (
                  <span className="znacznik">przerobione</span>
                )}
                <span className="mala">{material.czasTrwaniaMin} min</span>
              </div>
              <p className="mala" style={{ margin: '4px 0 8px' }}>
                {OPIS_TYPU[material.typ]} · {material.filary.join(', ')}
                {material.quizId !== undefined && ' · ze sprawdzianem'}
              </p>
              <p style={{ marginTop: 0 }}>{material.opis}</p>
              <a className="przycisk wtorny" href={`/biblioteka/${material.id}`}>
                Otwórz materiał
              </a>
            </div>
          ))
        )}
      </div>

      <div className="akcje">
        <a className="przycisk wtorny" href="/akademia">
          Przejdź do Akademii
        </a>
      </div>
    </>
  );
}
