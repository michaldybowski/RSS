/**
 * Audyt Zdrowe Biuro i certyfikacja „Pracodawca Długowieczności"
 * (macierz funkcjonalności poz. 4 i 14, specyfikacja 11).
 *
 * Schemat kryteriów pochodzi z bazy w Notion — Centrum Audytu i Certyfikacji
 * rozwija standard samodzielnie, bez udziału programisty. Kod odpowiada
 * za przebieg audytu, wyliczenie wyniku i warunki wydania certyfikatu.
 */

export type OcenaKryterium = 'spelnione' | 'czesciowo' | 'niespelnione' | 'nie_dotyczy';

export interface Domena {
  kod: string;
  nazwa: string;
  /** Udział domeny w wyniku ogólnym. Sumy wag są normalizowane. */
  waga: number;
}

export interface Kryterium {
  id: string;
  domenaKod: string;
  tresc: string;
  waga: number;
  /** Czy ocena pozytywna wymaga załączenia dowodu. */
  dowodWymagany: boolean;
  /** Powiązanie ze wskaźnikiem ESRS S1 — mapowanie na sprawozdawczość CSRD. */
  wskaznikESRS?: string;
}

export interface SchematCertyfikacji {
  id: string;
  wersja: string;
  nazwa: string;
  obowiazujeOd: string;
  domeny: readonly Domena[];
  kryteria: readonly Kryterium[];
}

export type StatusAudytu = 'w_toku' | 'zamkniety';

export interface Audyt {
  id: string;
  organizationId: string;
  schematId: string;
  /** Wersja schematu utrwalona w chwili rozpoczęcia — późniejsza zmiana
   *  standardu nie może przestawiać wyniku audytu wykonanego wcześniej. */
  schematWersja: string;
  audytorId: string;
  status: StatusAudytu;
  rozpoczety: string;
  zamkniety?: string;
}

export interface Ustalenie {
  audytId: string;
  kryteriumId: string;
  ocena: OcenaKryterium;
  uwaga?: string;
  /** Klucz załącznika w prywatnym magazynie. Brak oznacza brak dowodu. */
  dowodKey?: string;
  odnotowal: string;
  at: string;
}

export interface WynikDomeny {
  kod: string;
  nazwa: string;
  /** Udział punktów zdobytych do możliwych, w procentach. */
  wynikProcent: number;
  ocenionych: number;
  pominietych: number;
}

export type PoziomCertyfikatu = 'zloty' | 'srebrny' | 'brazowy' | 'brak';

export interface WynikAudytu {
  wynikProcent: number;
  poziom: PoziomCertyfikatu;
  domeny: readonly WynikDomeny[];
  /** Kryteria bez oceny — audyt nie może być zamknięty, dopóki są. */
  bezOceny: readonly string[];
  /** Oceny pozytywne bez wymaganego dowodu. */
  bezDowodu: readonly string[];
}

export interface Certyfikat {
  numer: string;
  organizationId: string;
  audytId: string;
  poziom: Exclude<PoziomCertyfikatu, 'brak'>;
  wynikProcent: number;
  wydany: string;
  waznyDo: string;
  status: 'wazny' | 'wygasly' | 'cofniety';
}
