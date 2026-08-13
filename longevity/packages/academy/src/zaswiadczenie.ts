/**
 * Zaświadczenie o ukończeniu ścieżki.
 *
 * Należy do uczestnika, nie do pracodawcy. Zawiera pseudonim, a nie imię
 * i nazwisko — dokument imienny wystawia się przez panel uczestnika, gdy
 * człowiek sam zdecyduje, komu go pokazać.
 *
 * To nie jest certyfikat w rozumieniu pakietu @longevity/audit. Tamten jest
 * oświadczeniem wobec osób trzecich o stanie zakładu i wymaga zamkniętego
 * audytu z dowodami. Ten mówi tylko: „ta osoba przerobiła ten materiał".
 * Pomieszanie tych dwóch rzeczy zamieniłoby ukończony kurs w certyfikat
 * jakości pracodawcy.
 */

import type { PostepSciezki } from './sciezki.ts';
import type { Sciezka, Zaswiadczenie } from './types.ts';

export class SciezkaNieukonczonaError extends Error {
  constructor(sciezkaId: string, procent: number) {
    super(
      `Ścieżka ${sciezkaId} jest ukończona w ${procent}%. Zaświadczenie wymaga ` +
        'zaliczenia wszystkich modułów obowiązkowych.',
    );
    this.name = 'SciezkaNieukonczonaError';
  }
}

export function numerZaswiadczenia(kolejny: number, rok: string): string {
  return `AK/${rok}/${String(kolejny).padStart(4, '0')}`;
}

export function wydajZaswiadczenie(
  sciezka: Sciezka,
  postep: PostepSciezki,
  subjectRef: string,
  kolejny: number,
  kiedy: string,
): Zaswiadczenie {
  if (!postep.ukonczona) throw new SciezkaNieukonczonaError(sciezka.id, postep.procent);

  return {
    numer: numerZaswiadczenia(kolejny, kiedy.slice(0, 4)),
    sciezkaId: sciezka.id,
    subjectRef,
    wydane: kiedy.slice(0, 10),
    minutyNauki: postep.minutyNauki,
    modulow: postep.ukonczonych,
  };
}
