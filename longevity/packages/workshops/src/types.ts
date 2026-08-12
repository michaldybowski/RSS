/**
 * Warsztaty on-site i obecności (macierz funkcjonalności, pozycja 3).
 *
 * Warsztaty pochodzą z bazy „Harmonogram warsztatów" w Notion i są tu tylko
 * do odczytu — obłożenie widać w panelu platformy, nie wraca do Notion
 * (ADR-02, decyzja 2).
 *
 * Zapisy i obecności powstają po stronie platformy i są jedynym miejscem,
 * gdzie istnieje imienna lista uczestników.
 */

export type StatusWarsztatu = 'zaplanowany' | 'odwolany' | 'zakonczony';

export interface Warsztat {
  id: string;
  notionId: string;
  temat: string;
  /** Początek, ISO 8601 z czasem. */
  start: string;
  czasTrwaniaMin: number;
  organizationId: string;
  unitId?: string;
  trenerId: string;
  miejsc: number;
  status: StatusWarsztatu;
  /** Czy trener może odnotować obecność osoby, która się nie zapisała. */
  dopuscBezZapisu: boolean;
}

export type StatusZapisu = 'zapisany' | 'lista_rezerwowa' | 'wypisany';

export interface Zapis {
  warsztatId: string;
  participantId: string;
  status: StatusZapisu;
  /** Kolejność zgłoszeń rozstrzyga o miejscu na liście rezerwowej. */
  zgloszony: string;
}

export interface Obecnosc {
  warsztatId: string;
  participantId: string;
  obecny: boolean;
  odnotowalTrenerId: string;
  at: string;
}

/**
 * To, co trener widzi na liście.
 *
 * Nie pełne dane osobowe: imię i inicjał nazwiska wystarczą do sprawdzenia
 * obecności przy wejściu, a kod uczestnika rozstrzyga przypadki, gdy na sali
 * są dwie osoby o tym samym imieniu. Pełne nazwisko na wydruku, który krąży
 * po hali produkcyjnej, to więcej danych, niż wymaga zadanie.
 */
export interface PozycjaListy {
  participantId: string;
  etykieta: string;
  kod: string;
  status: StatusZapisu;
  obecny?: boolean;
}

export interface DaneOsobowe {
  participantId: string;
  imie: string;
  nazwisko: string;
}

export interface Obloznosc {
  miejsc: number;
  zapisani: number;
  naLiscieRezerwowej: number;
  wolneMiejsca: number;
  pelny: boolean;
}

export type WynikZapisu =
  | { kind: 'zapisany' }
  | { kind: 'lista_rezerwowa'; pozycja: number }
  | { kind: 'odrzucony'; powod: PowodOdrzucenia };

export type PowodOdrzucenia =
  | 'juz_zapisany'
  | 'warsztat_odwolany'
  | 'warsztat_zakonczony'
  | 'zapisy_zamkniete';

export type WynikWypisania =
  | { kind: 'wypisany'; awansowany?: string }
  | { kind: 'odrzucony'; powod: 'nie_byl_zapisany' | 'warsztat_zakonczony' };
