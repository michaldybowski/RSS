/**
 * Moduł medyczny: terminarz konsultacji, notatki i zlecenia badań.
 *
 * Granica odpowiedzialności jest tu ważniejsza niż model danych. Platforma
 * **nie leczy i nie wystawia dokumentów medycznych**. Umawia konsultację,
 * przygotowuje propozycję zlecenia badań z reguł i przechowuje to, co lekarz
 * napisał. Podpis pod zleceniem jest lekarza — bez tego platforma byłaby
 * podmiotem wykonującym działalność leczniczą, a nią nie jest.
 */

export type RodzajTerminu = 'planowy' | 'pilny';

export interface Termin {
  id: string;
  organizationId: string;
  clinicianId: string;
  /**
   * Początek terminu jako **czas lokalny bez strefy** (`YYYY-MM-DDTHH:mm`).
   *
   * Ta sama decyzja co w kalendarzu (@longevity/documents/ics.ts): wizyta
   * o 12:00 ma być o 12:00 na zegarze pacjenta i lekarza. Zapis w UTC
   * wyświetlony bez konwersji pokazuje godzinę o dwie wcześniejszą — i nikt
   * tego nie zauważa aż do pierwszej nieodbytej wizyty.
   *
   * Wszystkie znaczniki czasu podawane do tego pakietu (`teraz`) muszą być
   * w tej samej konwencji; mieszanie ich rozjeżdża zarówno porównania,
   * jak i okno odwołania.
   */
  start: string;
  minut: number;
  rodzaj: RodzajTerminu;
}

export type StatusKonsultacji =
  | 'zarezerwowana'
  | 'odbyta'
  | 'odwolana'
  | 'niestawiennictwo';

export interface Konsultacja {
  id: string;
  terminId: string;
  organizationId: string;
  clinicianId: string;
  participantId: string;
  /** Pseudonim uczestnika — do rejestrów i rozliczeń bez tożsamości. */
  subjectRef: string;
  status: StatusKonsultacji;
  zarezerwowana: string;
  /** Powód rezerwacji podany przez uczestnika. Nie jest wywiadem medycznym. */
  powod?: string;
  odwolana?: string;
  /** Odwołanie w oknie krótszym niż wymagane — odnotowane, ale bez sankcji. */
  poznoOdwolana?: boolean;
}

export interface Notatka {
  konsultacjaId: string;
  /** Treść pisana przez lekarza. Platforma jej nie generuje i nie zmienia. */
  tresc: string;
  zalecenia: readonly string[];
  autorId: string;
  utworzona: string;
}

export type StatusZlecenia = 'propozycja' | 'zatwierdzone' | 'odrzucone';

export interface PozycjaZlecenia {
  badanie: string;
  /** Skąd wzięła się ta pozycja — pokazywane lekarzowi przy zatwierdzaniu. */
  powod: string;
}

export interface ZlecenieBadan {
  id: string;
  konsultacjaId: string;
  participantId: string;
  pozycje: readonly PozycjaZlecenia[];
  status: StatusZlecenia;
  utworzone: string;
  /** Lekarz, który podpisał albo odrzucił propozycję. */
  lekarzId?: string;
  rozpatrzone?: string;
  uzasadnienieOdrzucenia?: string;
  /** Pozycje usunięte przez lekarza przed podpisem. */
  usuniete?: readonly string[];
}
