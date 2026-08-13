/**
 * Decyzje autoryzacyjne.
 *
 * Domyślnie odmowa. Każde „wolno" wynika z jawnej reguły, nie z braku reguły
 * zabraniającej — przy dodawaniu nowej operacji brak wpisu oznacza blokadę,
 * a nie ciche przepuszczenie.
 */

import type { AccessContext, Action, Actor, Decision, Resource, Role } from './types.ts';

const ODMOWA = (reason: string): Decision => ({ allowed: false, reason });
const ZGODA: Decision = { allowed: true };

function organizationOf(resource: Resource): string | undefined {
  return resource.kind === 'system' ? undefined : resource.organizationId;
}

/** Czy aktor ma rolę w kontekście tej organizacji (albo globalnie, jako admin). */
export function hasRole(actor: Actor, role: Role, organizationId?: string): boolean {
  return actor.grants.some((grant) => {
    if (grant.role !== role) return false;
    if (grant.organizationId === undefined) return role === 'admin';
    return grant.organizationId === organizationId;
  });
}

/**
 * Operacje systemowe administratora. Lista jest zamknięta i celowo krótka —
 * każda pozycja to czynność utrzymaniowa, a nie odczyt danych uczestnika.
 *
 * Obsługa wniosków RODO jest tu wyjątkiem wymagającym wyjaśnienia: administrator
 * *realizuje* wniosek (uruchamia eksport, wykonuje usunięcie), ale nie ogląda
 * jego treści. Zapewnia to kształt API w @longevity/gdpr — panel dostaje
 * metadane i potwierdzenie, nie dane zdrowotne.
 */
export const AKCJE_ADMINISTRACYJNE = [
  'zarzadzanie_synchronizacja',
  'odczyt_logu_synchronizacji',
  'obsluga_wnioskow_rodo',
  'wykonanie_retencji',
  'odczyt_stanu_systemu',
] as const;

export type AkcjaAdministracyjna = (typeof AKCJE_ADMINISTRACYJNE)[number];

export function czyAkcjaAdministracyjna(action: Action): action is AkcjaAdministracyjna {
  return (AKCJE_ADMINISTRACYJNE as readonly Action[]).includes(action);
}

export function can(
  actor: Actor,
  action: Action,
  resource: Resource,
  context: AccessContext = {},
): Decision {
  const org = organizationOf(resource);

  // Admin globalny obsługuje wyłącznie operacje systemowe. Celowo nie jest
  // wytrychem do danych zdrowotnych — administrator platformy nie ma powodu
  // oglądać Karty Pacjenta i nie może tego zrobić „bo jest adminem".
  //
  // Wymóg zasobu `system` nie jest formalnością: bez niego zgoda na operację
  // administracyjną obowiązywałaby także wtedy, gdy ktoś poda jako zasób
  // uczestnika — a wtedy pierwsza pomyłka w wywołaniu otwiera dostęp do osoby.
  if (czyAkcjaAdministracyjna(action)) {
    if (resource.kind !== 'system') {
      return ODMOWA('Operacja administracyjna dotyczy systemu, nie zasobu osoby ani organizacji.');
    }
    return hasRole(actor, 'admin') ? ZGODA : ODMOWA('Wymagana rola administratora.');
  }

  switch (action) {
    case 'odczyt_wlasnych_danych': {
      if (resource.kind !== 'uczestnik') return ODMOWA('Zasób nie jest danymi uczestnika.');
      return resource.participantId === actor.userId
        ? ZGODA
        : ODMOWA('Można odczytać wyłącznie własne dane.');
    }

    case 'odczyt_karty_pacjenta': {
      if (resource.kind !== 'uczestnik') return ODMOWA('Zasób nie jest danymi uczestnika.');
      if (resource.participantId === actor.userId) return ZGODA;

      if (!hasRole(actor, 'lekarz', org)) {
        return ODMOWA('Kartę Pacjenta może odczytać wyłącznie uczestnik lub lekarz.');
      }
      // Rola lekarza nie wystarcza — potrzebna jest odrębna, aktywna zgoda.
      return context.clinicianConsent === true
        ? ZGODA
        : ODMOWA('Brak aktywnej zgody uczestnika na udostępnienie karty lekarzowi.');
    }

    case 'odczyt_dashboardu': {
      if (resource.kind !== 'organizacja') return ODMOWA('Dashboard dotyczy organizacji.');
      return hasRole(actor, 'hr', org) ? ZGODA : ODMOWA('Wymagana rola HR w tej organizacji.');
    }

    case 'odczyt_listy_uczestnikow': {
      // Nikt nie dostaje listy imiennej uczestników programu. HR widzi wyłącznie
      // agregaty (specyfikacja 10), trener — listę zapisanych na swój warsztat,
      // co jest osobnym zasobem i osobną operacją.
      return ODMOWA('Imienna lista uczestników nie jest udostępniana żadnej roli.');
    }

    case 'odczyt_listy_zapisanych': {
      // Jedyna lista imienna w systemie. Ograniczona do jednego warsztatu
      // i do trenera, który go prowadzi — nie do „trenerów w ogóle".
      if (resource.kind !== 'warsztat') return ODMOWA('Zasób nie jest warsztatem.');
      if (!hasRole(actor, 'trener', org)) return ODMOWA('Wymagana rola trenera w tej organizacji.');
      return resource.trainerId === actor.userId
        ? ZGODA
        : ODMOWA('Listę zapisanych widzi wyłącznie trener prowadzący.');
    }

    case 'zapis_obecnosci': {
      if (resource.kind !== 'warsztat') return ODMOWA('Zasób nie jest warsztatem.');
      if (!hasRole(actor, 'trener', org)) return ODMOWA('Wymagana rola trenera w tej organizacji.');
      return resource.trainerId === actor.userId
        ? ZGODA
        : ODMOWA('Obecność może odnotować wyłącznie trener prowadzący.');
    }

    case 'zapis_audytu': {
      if (resource.kind !== 'audyt') return ODMOWA('Zasób nie jest audytem.');
      if (!hasRole(actor, 'audytor', org)) return ODMOWA('Wymagana rola audytora w tej organizacji.');
      return resource.auditorId === actor.userId
        ? ZGODA
        : ODMOWA('Ustalenia może zapisać wyłącznie audytor prowadzący.');
    }

    case 'rezerwacja_konsultacji': {
      // Rezerwację składa się wyłącznie dla siebie. Zapisywanie kogoś innego
      // na wizytę u lekarza jest decyzją zdrowotną za tę osobę.
      if (resource.kind !== 'konsultacja') return ODMOWA('Zasób nie jest konsultacją.');
      return resource.participantId === actor.userId
        ? ZGODA
        : ODMOWA('Termin można zarezerwować wyłącznie dla siebie.');
    }

    case 'prowadzenie_konsultacji': {
      if (resource.kind !== 'konsultacja') return ODMOWA('Zasób nie jest konsultacją.');
      if (!hasRole(actor, 'lekarz', org)) return ODMOWA('Wymagana rola lekarza w tej organizacji.');
      return resource.clinicianId === actor.userId
        ? ZGODA
        : ODMOWA('Konsultację prowadzi wyłącznie lekarz do niej przypisany.');
    }

    case 'zatwierdzenie_zlecenia_badan': {
      // Zlecenie badań podpisuje lekarz, nie platforma. Bez tej reguły
      // propozycja wygenerowana z reguł stawałaby się dokumentem sama z siebie.
      if (resource.kind !== 'konsultacja') return ODMOWA('Zasób nie jest konsultacją.');
      if (!hasRole(actor, 'lekarz', org)) return ODMOWA('Zlecenie badań zatwierdza lekarz.');
      return resource.clinicianId === actor.userId
        ? ZGODA
        : ODMOWA('Zlecenie zatwierdza lekarz prowadzący tę konsultację.');
    }

    case 'odczyt_rozliczen': {
      if (resource.kind !== 'organizacja') return ODMOWA('Rozliczenia dotyczą organizacji.');
      return hasRole(actor, 'hr', org)
        ? ZGODA
        : ODMOWA('Wymagana rola HR w tej organizacji.');
    }
  }
}

export class AccessDeniedError extends Error {
  constructor(
    readonly action: Action,
    reason: string,
  ) {
    super(`Odmowa dostępu (${action}): ${reason}`);
    this.name = 'AccessDeniedError';
  }
}

export function assertCan(
  actor: Actor,
  action: Action,
  resource: Resource,
  context: AccessContext = {},
): void {
  const decision = can(actor, action, resource, context);
  if (!decision.allowed) throw new AccessDeniedError(action, decision.reason);
}
