/**
 * Linie finansowe i dokumenty (specyfikacja 13).
 *
 * Pięć linii, pięć typów dokumentu, pięciu odbiorców. Przypisanie nie jest
 * konfiguracją — wynika z podstawy prawnej wydatku i nie może być mieszane.
 */

import type { Grosze, VatRate } from './money.ts';

export type Linia = 'A' | 'B' | 'C' | 'G' | 'M';

export type TypDokumentu =
  | 'nota_zbiorcza'
  | 'nota_imienna'
  | 'faktura'
  | 'rozliczenie_grantowe'
  | 'faktura_prowizyjna';

export type Odbiorca = 'pracodawca' | 'pracownik' | 'instytucja' | 'partner';

export interface OpisLinii {
  linia: Linia;
  zrodlo: string;
  dokument: TypDokumentu;
  odbiorca: Odbiorca;
  /** Czy dokument tej linii może zawierać dane imienne uczestników. */
  daneImienne: boolean;
}

export const LINIE: Readonly<Record<Linia, OpisLinii>> = {
  A: {
    linia: 'A',
    zrodlo: 'Ryczałt zbiorowy z ZFŚS',
    dokument: 'nota_zbiorcza',
    odbiorca: 'pracodawca',
    // Zakaz z macierzy funkcjonalności: w linii A pracodawca nie dostaje
    // listy uczestników, tylko liczby.
    daneImienne: false,
  },
  B: {
    linia: 'B',
    zrodlo: 'Dopłaty indywidualne z ZFŚS wg progów',
    dokument: 'nota_imienna',
    odbiorca: 'pracownik',
    daneImienne: true,
  },
  C: {
    linia: 'C',
    zrodlo: 'Środki obrotowe / działalność gospodarcza',
    dokument: 'faktura',
    odbiorca: 'pracodawca',
    daneImienne: false,
  },
  G: {
    linia: 'G',
    zrodlo: 'Grant / budżet publiczny',
    dokument: 'rozliczenie_grantowe',
    odbiorca: 'instytucja',
    daneImienne: false,
  },
  M: {
    linia: 'M',
    zrodlo: 'Marketplace / prowizja',
    dokument: 'faktura_prowizyjna',
    odbiorca: 'partner',
    daneImienne: false,
  },
};

/** Pozycja katalogu z cennika w Notion. */
export interface PozycjaKatalogu {
  kod: string;
  nazwa: string;
  cenaNettoGr: Grosze;
  /** Stawka jest parametrem, nie założeniem — decyzja 4. */
  vat: VatRate;
  linia: Linia;
  /** ISO 8601 (YYYY-MM-DD). */
  obowiazujeOd: string;
  /** Ustawiona ręcznie przed interpretacją KIS — widoczne w panelu. */
  przedInterpretacja?: boolean;
}

/** Próg dopłaty z regulaminu ZFŚS danego zakładu. */
export interface ProgZfss {
  organizationId: string;
  /** Górna granica dochodu, dla którego obowiązuje ta dopłata. */
  progDochodowyGr: Grosze;
  doplataPct: number;
  obowiazujeOd: string;
}

export interface Uczestnik {
  participantId: string;
  organizationId: string;
  /** Dochód na osobę w rodzinie — podstawa progu w linii B. */
  dochodGr?: Grosze;
}

/** Jedno obciążenie: kto, za co, w której linii. */
export interface Obciazenie {
  participantId: string;
  organizationId: string;
  kodPozycji: string;
  ilosc: number;
}

export interface PozycjaDokumentu {
  kod: string;
  nazwa: string;
  ilosc: number;
  cenaJednostkowaNettoGr: Grosze;
  nettoGr: Grosze;
  /** Stawka utrwalona w chwili wystawienia, nie odczytywana z cennika później. */
  vat: VatRate;
  vatGr: Grosze;
  bruttoGr: Grosze;
}

interface DokumentBazowy {
  numer: string;
  linia: Linia;
  typ: TypDokumentu;
  odbiorca: Odbiorca;
  organizationId: string;
  /** Okres rozliczeniowy w formacie YYYY-MM. */
  okres: string;
  wystawiono: string;
  pozycje: readonly PozycjaDokumentu[];
  sumaNettoGr: Grosze;
  sumaVatGr: Grosze;
  sumaBruttoGr: Grosze;
}

/**
 * Nota zbiorcza nie ma pola na uczestnika — brak danych imiennych w linii A
 * jest właściwością typu, a nie dyscypliną przy wypełnianiu.
 */
export interface NotaZbiorcza extends DokumentBazowy {
  typ: 'nota_zbiorcza';
  linia: 'A';
  liczbaUczestnikow: number;
}

export interface NotaImienna extends DokumentBazowy {
  typ: 'nota_imienna';
  linia: 'B';
  participantId: string;
  /** Procent dopłaty z regulaminu ZFŚS zakładu. */
  doplataPct: number;
  doplataGr: Grosze;
  /** Część pokrywana przez uczestnika po odjęciu dopłaty. */
  doZaplatyGr: Grosze;
}

export interface DokumentProsty extends DokumentBazowy {
  typ: 'faktura' | 'rozliczenie_grantowe' | 'faktura_prowizyjna';
  linia: 'C' | 'G' | 'M';
  liczbaUczestnikow: number;
}

export type Dokument = NotaZbiorcza | NotaImienna | DokumentProsty;

export interface OstrzezenieRozliczenia {
  kod: 'brak_pozycji' | 'brak_progu_zfss' | 'brak_dochodu' | 'stawka_przed_interpretacja';
  komunikat: string;
  kontekst?: string;
}

export interface WynikRozliczenia {
  okres: string;
  dokumenty: readonly Dokument[];
  ostrzezenia: readonly OstrzezenieRozliczenia[];
  pominieteObciazenia: readonly Obciazenie[];
}
