/**
 * Marketplace partnerów (specyfikacja 13, linia M).
 *
 * Jedna zasada nadrzędna, z której wynika reszta tego pakietu:
 * **prowizja nie może zależeć od danych zdrowotnych uczestnika.**
 *
 * Program, który zarabia więcej, gdy komuś pogarszają się wyniki, przestaje
 * być programem zdrowotnym. Dlatego funkcje wystawiające oferty nie przyjmują
 * oceny ryzyka — nie jako przeoczenie, tylko jako kształt API. Ocena wchodzi
 * do gry wyłącznie tam, gdzie może coś **ograniczyć** (ostrzeżenie przy
 * przeciwwskazaniu), nigdy tam, gdzie mogłaby coś podbić.
 */

export type KategoriaPartnera =
  | 'diagnostyka'
  | 'sport'
  | 'zywienie'
  | 'suplementy'
  | 'regeneracja'
  | 'sprzet';

export type StatusUmowy = 'negocjacje' | 'podpisana' | 'zawieszona';

export interface Partner {
  id: string;
  nazwa: string;
  kategoria: KategoriaPartnera;
  opis: string;
  url?: string;
  /** Prowizja programu od wartości netto zamówienia, w procentach. */
  prowizjaPct: number;
  statusUmowy: StatusUmowy;
}

export interface Oferta {
  id: string;
  partnerId: string;
  nazwa: string;
  opis: string;
  /** Cena netto w groszach — arytmetyka jak w @longevity/billing. */
  cenaNettoGr: number;
  stawkaVat: '23' | '8' | '5' | '0' | 'zw';
  pakiety: readonly string[];
  /**
   * Kody flag, przy których oferta dostaje ostrzeżenie. Ostrzeżenie, nie
   * blokada: sauna przy nadciśnieniu wymaga rozmowy z lekarzem, a nie zniknięcia
   * oferty z katalogu bez słowa.
   */
  przeciwwskazania?: readonly string[];
}

export type StatusZamowienia = 'zlozone' | 'zrealizowane' | 'anulowane';

export interface Zamowienie {
  id: string;
  ofertaId: string;
  partnerId: string;
  /** Pseudonim uczestnika. Partner nie dostaje tożsamości ani pracodawcy. */
  subjectRef: string;
  kwotaNettoGr: number;
  stawkaVat: Oferta['stawkaVat'];
  /** Prowizja programu, wyliczona przy złożeniu i zamrożona na zamówieniu. */
  prowizjaGr: number;
  prowizjaPct: number;
  zlozone: string;
  status: StatusZamowienia;
  zrealizowane?: string;
  anulowane?: string;
  powodAnulowania?: string;
}
