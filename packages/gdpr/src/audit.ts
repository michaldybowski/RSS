/**
 * Audit log — tabela tylko do dopisywania (specyfikacja 4.6).
 *
 * Brak UPDATE i DELETE nie jest konwencją: interfejs nie ma metody, którą
 * dałoby się zmienić lub usunąć wpis. Log, który da się poprawić, nie jest
 * dowodem na nic.
 *
 * Wpisy odnoszą się do pseudonimu, nie do tożsamości — dzięki temu przeżywają
 * usunięcie konta, nie przeżywając przy tym przypisywalności do osoby.
 */

export type AkcjaAudytu =
  | 'odczyt_danych_zdrowotnych'
  | 'zapis_danych_zdrowotnych'
  | 'wygenerowanie_planu'
  | 'przekazanie_do_modelu'
  | 'udostepnienie_lekarzowi'
  | 'odczyt_dashboardu'
  | 'eksport_danych'
  | 'usuniecie_danych'
  | 'zmiana_zgody'
  | 'synchronizacja_tresci'
  | 'rezerwacja_konsultacji'
  | 'odwolanie_konsultacji'
  | 'zamowienie_marketplace'
  | 'logowanie';

/**
 * Nazwy akcji dla człowieka.
 *
 * Rejestr dostępu istnieje po to, żeby uczestnik zrozumiał, co się działo
 * z jego danymi. Wpis „udostepnienie_lekarzowi" tego nie robi — to identyfikator
 * z bazy pokazany zamiast zdania. Słownik jest tutaj, a nie w kliencie,
 * bo inaczej każdy klient wymyśliłby własny i po dodaniu akcji jeden z nich
 * pokazywałby surowy kod.
 */
export const OPIS_AKCJI: Readonly<Record<AkcjaAudytu, string>> = {
  odczyt_danych_zdrowotnych: 'Odczyt danych zdrowotnych',
  zapis_danych_zdrowotnych: 'Zapis danych zdrowotnych',
  wygenerowanie_planu: 'Wygenerowanie planu',
  przekazanie_do_modelu: 'Przekazanie danych do modelu językowego',
  udostepnienie_lekarzowi: 'Udostępnienie Karty Pacjenta lekarzowi',
  odczyt_dashboardu: 'Odczyt zestawienia zbiorczego',
  eksport_danych: 'Eksport danych',
  usuniecie_danych: 'Usunięcie danych',
  zmiana_zgody: 'Zmiana zgody',
  synchronizacja_tresci: 'Synchronizacja treści z Notion',
  rezerwacja_konsultacji: 'Rezerwacja konsultacji lekarskiej',
  odwolanie_konsultacji: 'Odwołanie konsultacji lekarskiej',
  zamowienie_marketplace: 'Zamówienie u partnera marketplace',
  logowanie: 'Logowanie',
};

export interface WpisAudytu {
  readonly id: string;
  /** Kto wykonał operację — pseudonim aktora. */
  readonly actorRef: string;
  /** Kogo dotyczyła — pseudonim podmiotu danych. */
  readonly subjectRef?: string;
  readonly akcja: AkcjaAudytu;
  readonly zasob: string;
  readonly kontekst: Readonly<Record<string, string>>;
  readonly ipHash?: string;
  readonly at: string;
}

export interface NowyWpis {
  actorRef: string;
  subjectRef?: string;
  akcja: AkcjaAudytu;
  zasob: string;
  kontekst?: Readonly<Record<string, string>>;
  ipHash?: string;
  at: string;
}

/**
 * Interfejs celowo bez `update` i `delete`. Usuwanie wpisów po upływie
 * retencji jest osobną operacją administracyjną, nie funkcją tego API.
 */
export interface AuditLog {
  dopisz: (wpis: NowyWpis) => WpisAudytu;
  odczytaj: (filtr?: FiltrAudytu) => readonly WpisAudytu[];
}

export interface FiltrAudytu {
  subjectRef?: string;
  actorRef?: string;
  akcja?: AkcjaAudytu;
  od?: string;
  do?: string;
}

export class PamieciowyAuditLog implements AuditLog {
  private readonly wpisy: WpisAudytu[] = [];
  private licznik = 0;

  dopisz(wpis: NowyWpis): WpisAudytu {
    this.licznik += 1;
    const zapisany: WpisAudytu = Object.freeze({
      id: `audit-${String(this.licznik).padStart(6, '0')}`,
      actorRef: wpis.actorRef,
      ...(wpis.subjectRef !== undefined ? { subjectRef: wpis.subjectRef } : {}),
      akcja: wpis.akcja,
      zasob: wpis.zasob,
      kontekst: Object.freeze({ ...(wpis.kontekst ?? {}) }),
      ...(wpis.ipHash !== undefined ? { ipHash: wpis.ipHash } : {}),
      at: wpis.at,
    });

    this.wpisy.push(zapisany);
    return zapisany;
  }

  odczytaj(filtr: FiltrAudytu = {}): readonly WpisAudytu[] {
    return this.wpisy.filter((wpis) => {
      if (filtr.subjectRef !== undefined && wpis.subjectRef !== filtr.subjectRef) return false;
      if (filtr.actorRef !== undefined && wpis.actorRef !== filtr.actorRef) return false;
      if (filtr.akcja !== undefined && wpis.akcja !== filtr.akcja) return false;
      if (filtr.od !== undefined && wpis.at < filtr.od) return false;
      if (filtr.do !== undefined && wpis.at > filtr.do) return false;
      return true;
    });
  }
}

/**
 * Operacje, które muszą zostawić ślad. Lista jest zamknięta — dodanie nowej
 * ścieżki dostępu do danych zdrowotnych wymaga świadomego wpisu tutaj.
 */
export const OPERACJE_WYMAGAJACE_LOGU: readonly AkcjaAudytu[] = [
  'odczyt_danych_zdrowotnych',
  'zapis_danych_zdrowotnych',
  'wygenerowanie_planu',
  'przekazanie_do_modelu',
  'udostepnienie_lekarzowi',
  'odczyt_dashboardu',
  'eksport_danych',
  'usuniecie_danych',
  'zmiana_zgody',
  // Import z Notion nie dotyka danych zdrowotnych, ale zmienia cennik i progi
  // ZFŚS — czyli kwoty na notach. Bez wpisu nie da się odpowiedzieć na pytanie,
  // kto i kiedy wpuścił do systemu inną cenę.
  'synchronizacja_tresci',
  // Konsultacja i zamówienie u partnera nie są odczytem danych zdrowotnych,
  // ale są zdarzeniami, które uczestnik ma prawo zobaczyć u siebie: jedno mówi
  // o wizycie u lekarza, drugie o tym, że jego pseudonim pojechał do firmy
  // z zewnątrz. Odwołanie jest na liście razem z rezerwacją — rejestr, który
  // pokazuje tylko zapisy, przedstawia odwołaną wizytę jako odbytą.
  'rezerwacja_konsultacji',
  'odwolanie_konsultacji',
  'zamowienie_marketplace',
];

export function wymagaLogu(akcja: AkcjaAudytu): boolean {
  return OPERACJE_WYMAGAJACE_LOGU.includes(akcja);
}
