/**
 * Ścieżki Akademii: zaliczanie materiałów i postęp.
 *
 * Dwie reguły niosą tu cały ciężar:
 *
 * 1. **Zaliczenie mówi, skąd się wzięło.** Materiał bez sprawdzianu zalicza
 *    deklaracja uczestnika i jest to zapisane wprost (`sposob: 'deklaracja'`).
 *    Nie mierzymy uwagi i nie udajemy, że mierzymy — „obejrzane" i „zrozumiane"
 *    to dwie różne rzeczy, a zaświadczenie ma mówić, która zaszła.
 *
 * 2. **Wycofany materiał nie blokuje ścieżki.** Redakcja może wycofać treść
 *    w Notion w połowie czyjejś nauki. Gdyby moduł z takim materiałem liczył się
 *    dalej jako wymagany, ścieżka stawałaby się niemożliwa do ukończenia
 *    i nikt nie wiedziałby dlaczego. Moduł wypada z mianownika i przestaje
 *    zamykać kolejne.
 */

import { materialPoId } from './biblioteka.ts';
import type { WynikQuizu } from './quiz.ts';
import type { Material, Modul, Sciezka, Zaliczenie } from './types.ts';

export class WymaganySprawdzianError extends Error {
  constructor(materialId: string) {
    super(
      `Materiał ${materialId} ma sprawdzian — zalicza go wynik quizu, nie deklaracja.`,
    );
    this.name = 'WymaganySprawdzianError';
  }
}

export class SprawdzianNiezaliczonyError extends Error {
  constructor(materialId: string, procent: number) {
    super(`Sprawdzian materiału ${materialId} nie został zaliczony (${procent}%).`);
    this.name = 'SprawdzianNiezaliczonyError';
  }
}

function bezMaterialu(zaliczenia: readonly Zaliczenie[], materialId: string): Zaliczenie[] {
  return zaliczenia.filter((zaliczenie) => zaliczenie.materialId !== materialId);
}

export function zaliczDeklaracja(
  zaliczenia: readonly Zaliczenie[],
  material: Material,
  kiedy: string,
): readonly Zaliczenie[] {
  if (material.quizId !== undefined) throw new WymaganySprawdzianError(material.id);

  return [
    ...bezMaterialu(zaliczenia, material.id),
    { materialId: material.id, kiedy, sposob: 'deklaracja' },
  ];
}

export function zaliczSprawdzianem(
  zaliczenia: readonly Zaliczenie[],
  material: Material,
  wynik: WynikQuizu,
  kiedy: string,
): readonly Zaliczenie[] {
  if (!wynik.zaliczony) throw new SprawdzianNiezaliczonyError(material.id, wynik.procent);

  return [
    ...bezMaterialu(zaliczenia, material.id),
    { materialId: material.id, kiedy, sposob: 'quiz', wynikProcent: wynik.procent },
  ];
}

export function czyZaliczony(zaliczenia: readonly Zaliczenie[], materialId: string): boolean {
  return zaliczenia.some((zaliczenie) => zaliczenie.materialId === materialId);
}

export type StanModulu = 'zaliczony' | 'otwarty' | 'zablokowany' | 'niedostepny';

export interface PozycjaSciezki {
  modul: Modul;
  /**
   * Materiał modułu — także wtedy, gdy jest wycofany albo nieopublikowany.
   * Bez niego widok pokazałby identyfikator z bazy zamiast tytułu, a uczestnik
   * nie dowiedziałby się, czego dotyczył pominięty moduł.
   */
  material?: Material;
  stan: StanModulu;
  zaliczenie?: Zaliczenie;
}

export interface PostepSciezki {
  sciezkaId: string;
  pozycje: readonly PozycjaSciezki[];
  ukonczonych: number;
  /** Zaliczone moduły obowiązkowe — to one decydują o ukończeniu ścieżki. */
  zaliczonychObowiazkowych: number;
  wymaganych: number;
  /** Moduły pominięte, bo materiał zniknął z biblioteki. */
  pominietych: number;
  procent: number;
  ukonczona: boolean;
  minutyNauki: number;
  /** Pierwszy moduł do zrobienia — albo `undefined`, gdy ścieżka domknięta. */
  nastepny?: PozycjaSciezki;
}

function dostepny(material: Material | undefined): material is Material {
  return material !== undefined && material.opublikowana && material.wycofany !== true;
}

export function postepSciezki(
  sciezka: Sciezka,
  materialy: readonly Material[],
  zaliczenia: readonly Zaliczenie[],
): PostepSciezki {
  const pozycje: PozycjaSciezki[] = [];

  let poprzednieDomkniete = true;
  let ukonczonych = 0;
  let wymaganych = 0;
  let pominietych = 0;
  let minuty = 0;

  for (const modul of sciezka.moduly) {
    const material = materialPoId(materialy, modul.materialId);
    const zaliczenie = zaliczenia.find((pozycja) => pozycja.materialId === modul.materialId);

    if (!dostepny(material)) {
      // Moduł niedostępny nie liczy się do wymagań i nie zamyka kolejnego.
      pominietych += 1;
      pozycje.push({ modul, stan: 'niedostepny', ...(material !== undefined ? { material } : {}) });
      continue;
    }

    if (modul.obowiazkowy) wymaganych += 1;

    if (zaliczenie !== undefined) {
      ukonczonych += 1;
      minuty += material.czasTrwaniaMin;
      pozycje.push({ modul, material, stan: 'zaliczony', zaliczenie });
      continue;
    }

    const stan: StanModulu = poprzednieDomkniete ? 'otwarty' : 'zablokowany';
    pozycje.push({ modul, material, stan });

    // Kolejne moduły zamyka wyłącznie niezaliczony moduł obowiązkowy.
    if (modul.obowiazkowy) poprzednieDomkniete = false;
  }

  const zaliczoneObowiazkowe = pozycje.filter(
    (pozycja) => pozycja.stan === 'zaliczony' && pozycja.modul.obowiazkowy,
  ).length;

  return {
    sciezkaId: sciezka.id,
    pozycje,
    ukonczonych,
    zaliczonychObowiazkowych: zaliczoneObowiazkowe,
    wymaganych,
    pominietych,
    procent: wymaganych === 0 ? 100 : Math.round((zaliczoneObowiazkowe / wymaganych) * 100),
    ukonczona: zaliczoneObowiazkowe >= wymaganych,
    minutyNauki: minuty,
    ...(pozycje.find((pozycja) => pozycja.stan === 'otwarty') !== undefined
      ? { nastepny: pozycje.find((pozycja) => pozycja.stan === 'otwarty')! }
      : {}),
  };
}

export function dostepneSciezki(
  sciezki: readonly Sciezka[],
  pakiet?: string,
): readonly Sciezka[] {
  if (pakiet === undefined) return sciezki;
  return sciezki.filter((sciezka) => sciezka.pakiety.includes(pakiet));
}
