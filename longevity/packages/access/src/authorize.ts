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
  if (hasRole(actor, 'admin') && action === 'zarzadzanie_synchronizacja') return ZGODA;

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

    case 'odczyt_rozliczen': {
      if (resource.kind !== 'organizacja') return ODMOWA('Rozliczenia dotyczą organizacji.');
      return hasRole(actor, 'hr', org)
        ? ZGODA
        : ODMOWA('Wymagana rola HR w tej organizacji.');
    }

    case 'zarzadzanie_synchronizacja':
      return ODMOWA('Wymagana rola administratora.');
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
