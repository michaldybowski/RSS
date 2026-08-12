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
  | 'logowanie';

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
];

export function wymagaLogu(akcja: AkcjaAudytu): boolean {
  return OPERACJE_WYMAGAJACE_LOGU.includes(akcja);
}
