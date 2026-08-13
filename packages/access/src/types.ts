/**
 * Model uprawnień (specyfikacja 4.1).
 *
 * Role przypisane są **w kontekście organizacji**, nie globalnie. HR firmy X
 * nie widzi niczego z firmy Y — i nie jest to kwestia ukrycia przycisku,
 * tylko decyzji podejmowanej przed sięgnięciem po dane.
 */

export type Role = 'uczestnik' | 'hr' | 'trener' | 'audytor' | 'lekarz' | 'admin';

export type Action =
  | 'odczyt_wlasnych_danych'
  | 'odczyt_dashboardu'
  | 'odczyt_karty_pacjenta'
  | 'odczyt_listy_uczestnikow'
  | 'odczyt_listy_zapisanych'
  | 'zapis_obecnosci'
  | 'zapis_audytu'
  | 'odczyt_rozliczen'
  | 'rezerwacja_konsultacji'
  | 'prowadzenie_konsultacji'
  | 'zatwierdzenie_zlecenia_badan'
  | 'zarzadzanie_synchronizacja'
  | 'odczyt_logu_synchronizacji'
  | 'obsluga_wnioskow_rodo'
  | 'wykonanie_retencji'
  | 'odczyt_stanu_systemu'
  | 'odczyt_rozliczen_prowizji';

/** Nadanie roli. Brak `organizationId` oznacza rolę globalną — tylko dla admina. */
export interface RoleGrant {
  role: Role;
  organizationId?: string;
}

export interface Actor {
  userId: string;
  grants: readonly RoleGrant[];
}

export type Resource =
  | { kind: 'uczestnik'; participantId: string; organizationId: string }
  | { kind: 'organizacja'; organizationId: string }
  | { kind: 'warsztat'; organizationId: string; trainerId: string }
  | { kind: 'audyt'; organizationId: string; auditorId: string }
  | {
      kind: 'konsultacja';
      organizationId: string;
      /** Lekarz prowadzący. Konsultacja należy do jednego, nie do „lekarzy". */
      clinicianId: string;
      participantId: string;
    }
  | { kind: 'system' };

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Kontekst wykraczający poza samą rolę. Dostęp lekarza do Karty Pacjenta
 * wymaga zgody uczestnika — sama rola nie wystarcza (specyfikacja 6.4).
 */
export interface AccessContext {
  /** Czy uczestnik udzielił aktywnej zgody na udostępnienie karty lekarzowi. */
  clinicianConsent?: boolean;
}
