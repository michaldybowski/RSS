/**
 * Biblioteka treści i Akademia (specyfikacja 9 i 14).
 *
 * Materiały są klasą danych K5 — treść redagowana w Notion, ta sama dla
 * wszystkich. To, **co ktoś przeczytał**, jest już czymś innym: z listy
 * obejrzanych materiałów o cukrzycy da się wnioskować o rozpoznaniu.
 * Dlatego historia nauki żyje po stronie uczestnika, nigdy nie wraca
 * do Notion i nie trafia do pracodawcy inaczej niż jako agregat.
 */

export type TypMaterialu = 'lekcja' | 'webinar' | 'podcast' | 'artykul' | 'ebook' | 'zeszyt';

/**
 * Intensywność opisywanego wysiłku. Nie blokuje dostępu — materiał się czyta,
 * a nie wykonuje. Steruje ostrzeżeniem, nie bramką (patrz `biblioteka.ts`).
 */
export type Intensywnosc = 'niska' | 'umiarkowana' | 'wysoka';

export interface Material {
  id: string;
  tytul: string;
  typ: TypMaterialu;
  opis: string;
  czasTrwaniaMin: number;
  filary: readonly string[];
  pakiety: readonly string[];
  mediaUrl?: string;
  opublikowana: boolean;
  /** Materiał wycofany z biblioteki. Zostaje w cache, znika z katalogu. */
  wycofany?: boolean;
  intensywnosc?: Intensywnosc;
  quizId?: string;
}

export interface Pytanie {
  id: string;
  tresc: string;
  odpowiedzi: readonly string[];
  /** Indeks poprawnej odpowiedzi. */
  poprawna: number;
  wyjasnienie: string;
}

/**
 * Sprawdzian wiedzy — wyłącznie z treści materiału.
 *
 * Quiz nie pyta o stan zdrowia uczestnika. Pytanie „czy miewasz zawroty głowy"
 * w sprawdzianie byłoby kwestionariuszem przemyconym poza modelem zgód
 * i poza zestawem reguł, który jako jedyny ma prawo liczyć ryzyko (ADR-03).
 */
export interface Quiz {
  id: string;
  materialId: string;
  pytania: readonly Pytanie[];
}

export type SposobZaliczenia = 'deklaracja' | 'quiz';

export interface Zaliczenie {
  materialId: string;
  /** Kiedy uczestnik zaliczył materiał. */
  kiedy: string;
  sposob: SposobZaliczenia;
  /** Wynik quizu w procentach — tylko dla `sposob === 'quiz'`. */
  wynikProcent?: number;
}

export interface Modul {
  materialId: string;
  /** Moduł obowiązkowy wchodzi do warunku ukończenia ścieżki. */
  obowiazkowy: boolean;
}

export interface Sciezka {
  id: string;
  nazwa: string;
  opis: string;
  /** Kolejność ma znaczenie: moduł otwiera się po zaliczeniu poprzedniego. */
  moduly: readonly Modul[];
  pakiety: readonly string[];
  filar?: string;
}

export interface Zaswiadczenie {
  numer: string;
  sciezkaId: string;
  /** Pseudonim uczestnika — zaświadczenie należy do niego, nie do pracodawcy. */
  subjectRef: string;
  wydane: string;
  minutyNauki: number;
  modulow: number;
}
