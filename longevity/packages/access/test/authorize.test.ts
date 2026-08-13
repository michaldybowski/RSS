import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AccessDeniedError,
  AKCJE_ADMINISTRACYJNE,
  assertCan,
  can,
  czyAkcjaAdministracyjna,
  hasRole,
} from '../src/authorize.ts';
import type { Action, Actor, Resource } from '../src/types.ts';

const FIRMA_X = 'org-x';
const FIRMA_Y = 'org-y';

const uczestnik = (id: string, org = FIRMA_X): Actor => ({
  userId: id,
  grants: [{ role: 'uczestnik', organizationId: org }],
});
const hr = (org: string): Actor => ({ userId: `hr-${org}`, grants: [{ role: 'hr', organizationId: org }] });
const lekarz = (org: string): Actor => ({ userId: 'lek-1', grants: [{ role: 'lekarz', organizationId: org }] });
const trener = (id: string, org: string): Actor => ({ userId: id, grants: [{ role: 'trener', organizationId: org }] });
const audytor = (id: string, org: string): Actor => ({ userId: id, grants: [{ role: 'audytor', organizationId: org }] });
const admin: Actor = { userId: 'admin-1', grants: [{ role: 'admin' }] };

const osoba = (id: string, org = FIRMA_X): Resource => ({
  kind: 'uczestnik',
  participantId: id,
  organizationId: org,
});
const firma = (org: string): Resource => ({ kind: 'organizacja', organizationId: org });

describe('rozdział między organizacjami', () => {
  test('HR firmy X nie widzi dashboardu firmy Y', () => {
    assert.equal(can(hr(FIRMA_X), 'odczyt_dashboardu', firma(FIRMA_Y)).allowed, false);
    assert.equal(can(hr(FIRMA_X), 'odczyt_dashboardu', firma(FIRMA_X)).allowed, true);
  });

  test('lekarz przypisany do firmy X nie sięgnie po pacjenta z firmy Y', () => {
    const decyzja = can(lekarz(FIRMA_X), 'odczyt_karty_pacjenta', osoba('u-1', FIRMA_Y), {
      clinicianConsent: true,
    });
    assert.equal(decyzja.allowed, false);
  });

  test('rola bez wskazania organizacji nie działa jak globalna', () => {
    const luzny: Actor = { userId: 'x', grants: [{ role: 'hr' }] };
    assert.equal(hasRole(luzny, 'hr', FIRMA_X), false);
    assert.equal(can(luzny, 'odczyt_dashboardu', firma(FIRMA_X)).allowed, false);
  });
});

describe('dane uczestnika', () => {
  test('uczestnik odczytuje własne dane', () => {
    assert.equal(can(uczestnik('u-1'), 'odczyt_wlasnych_danych', osoba('u-1')).allowed, true);
  });

  test('uczestnik nie odczyta danych kolegi z tej samej firmy', () => {
    assert.equal(can(uczestnik('u-1'), 'odczyt_wlasnych_danych', osoba('u-2')).allowed, false);
  });

  test('HR nie ma dostępu do danych pojedynczej osoby we własnej organizacji', () => {
    // To jest sedno zakazu z linii A: HR widzi agregaty i nic poza nimi.
    assert.equal(can(hr(FIRMA_X), 'odczyt_karty_pacjenta', osoba('u-1')).allowed, false);
    assert.equal(can(hr(FIRMA_X), 'odczyt_wlasnych_danych', osoba('u-1')).allowed, false);
  });

  test('imienna lista uczestników programu nie jest dostępna dla nikogo', () => {
    for (const actor of [hr(FIRMA_X), admin, lekarz(FIRMA_X), trener('t-1', FIRMA_X)]) {
      assert.equal(can(actor, 'odczyt_listy_uczestnikow', firma(FIRMA_X)).allowed, false);
    }
  });

  test('lista zapisanych na warsztat jest wyjątkiem ograniczonym do prowadzącego', () => {
    // Jedyna lista imienna w systemie. Wąska: jeden warsztat, jeden trener.
    const swoj: Resource = { kind: 'warsztat', organizationId: FIRMA_X, trainerId: 't-1' };
    const cudzy: Resource = { kind: 'warsztat', organizationId: FIRMA_X, trainerId: 't-2' };

    assert.equal(can(trener('t-1', FIRMA_X), 'odczyt_listy_zapisanych', swoj).allowed, true);
    assert.equal(can(trener('t-1', FIRMA_X), 'odczyt_listy_zapisanych', cudzy).allowed, false);
    assert.equal(can(hr(FIRMA_X), 'odczyt_listy_zapisanych', swoj).allowed, false);
    assert.equal(can(admin, 'odczyt_listy_zapisanych', swoj).allowed, false);
  });
});

describe('dostęp lekarza', () => {
  test('sama rola nie wystarcza — potrzebna jest zgoda', () => {
    assert.equal(can(lekarz(FIRMA_X), 'odczyt_karty_pacjenta', osoba('u-1')).allowed, false);
  });

  test('zgoda otwiera dostęp', () => {
    const decyzja = can(lekarz(FIRMA_X), 'odczyt_karty_pacjenta', osoba('u-1'), {
      clinicianConsent: true,
    });
    assert.equal(decyzja.allowed, true);
  });

  test('wycofana zgoda zamyka dostęp', () => {
    const decyzja = can(lekarz(FIRMA_X), 'odczyt_karty_pacjenta', osoba('u-1'), {
      clinicianConsent: false,
    });
    assert.equal(decyzja.allowed, false);
  });

  test('uczestnik zawsze widzi własną kartę, niezależnie od zgody dla lekarza', () => {
    assert.equal(can(uczestnik('u-1'), 'odczyt_karty_pacjenta', osoba('u-1')).allowed, true);
  });
});

describe('trener i audytor', () => {
  test('trener odnotowuje obecność wyłącznie na swoim warsztacie', () => {
    const swoj: Resource = { kind: 'warsztat', organizationId: FIRMA_X, trainerId: 't-1' };
    const cudzy: Resource = { kind: 'warsztat', organizationId: FIRMA_X, trainerId: 't-2' };

    assert.equal(can(trener('t-1', FIRMA_X), 'zapis_obecnosci', swoj).allowed, true);
    assert.equal(can(trener('t-1', FIRMA_X), 'zapis_obecnosci', cudzy).allowed, false);
  });

  test('audytor zapisuje ustalenia wyłącznie w swoim audycie', () => {
    const swoj: Resource = { kind: 'audyt', organizationId: FIRMA_X, auditorId: 'a-1' };
    const cudzy: Resource = { kind: 'audyt', organizationId: FIRMA_X, auditorId: 'a-2' };

    assert.equal(can(audytor('a-1', FIRMA_X), 'zapis_audytu', swoj).allowed, true);
    assert.equal(can(audytor('a-1', FIRMA_X), 'zapis_audytu', cudzy).allowed, false);
  });
});

describe('administrator', () => {
  test('wykonuje wszystkie operacje systemowe', () => {
    for (const akcja of AKCJE_ADMINISTRACYJNE) {
      assert.equal(can(admin, akcja, { kind: 'system' }).allowed, true, akcja);
    }
  });

  test('nie jest wytrychem do danych zdrowotnych', () => {
    // Administrator platformy nie ma powodu oglądać Karty Pacjenta i nie może
    // tego zrobić „bo jest adminem".
    assert.equal(can(admin, 'odczyt_karty_pacjenta', osoba('u-1')).allowed, false);
    assert.equal(can(admin, 'odczyt_dashboardu', firma(FIRMA_X)).allowed, false);
    assert.equal(can(admin, 'odczyt_rozliczen', firma(FIRMA_X)).allowed, false);
  });

  test('operacja administracyjna nie działa na zasobie osoby', () => {
    // Zgoda jest związana z zasobem `system`. Podanie uczestnika jako zasobu
    // operacji administracyjnej to pomyłka wywołania — i ma być odmową,
    // a nie przypadkowo szerszym uprawnieniem.
    for (const akcja of AKCJE_ADMINISTRACYJNE) {
      assert.equal(can(admin, akcja, osoba('u-1')).allowed, false, akcja);
      assert.equal(can(admin, akcja, firma(FIRMA_X)).allowed, false, `${akcja} / organizacja`);
    }
  });

  test('rola HR nie sięga po operacje administracyjne', () => {
    for (const akcja of AKCJE_ADMINISTRACYJNE) {
      assert.equal(can(hr(FIRMA_X), akcja, { kind: 'system' }).allowed, false, akcja);
    }
  });

  test('obsługa wniosków RODO nie otwiera drogi do treści danych', () => {
    // Realizacja wniosku i odczyt danych to dwie różne operacje. Pierwszą
    // administrator wykonuje, drugiej nie — także wobec osoby, której
    // wniosek dotyczy.
    assert.equal(can(admin, 'obsluga_wnioskow_rodo', { kind: 'system' }).allowed, true);
    assert.equal(can(admin, 'odczyt_karty_pacjenta', osoba('u-1')).allowed, false);
    assert.equal(can(admin, 'odczyt_wlasnych_danych', osoba('u-1')).allowed, false);
  });
});

/**
 * Wyliczenie wszystkich operacji, wymuszone przez typ.
 *
 * `Record<Action, true>` na literale obiektu sprawia, że dopisanie operacji
 * bez uzupełnienia tej listy jest błędem kompilacji — a nie cichym zwężeniem
 * pokrycia testu domyślnej odmowy.
 */
const WSZYSTKIE_AKCJE: Record<Action, true> = {
  odczyt_wlasnych_danych: true,
  odczyt_dashboardu: true,
  odczyt_karty_pacjenta: true,
  odczyt_listy_uczestnikow: true,
  odczyt_listy_zapisanych: true,
  zapis_obecnosci: true,
  zapis_audytu: true,
  odczyt_rozliczen: true,
  rezerwacja_konsultacji: true,
  prowadzenie_konsultacji: true,
  zatwierdzenie_zlecenia_badan: true,
  zarzadzanie_synchronizacja: true,
  odczyt_logu_synchronizacji: true,
  obsluga_wnioskow_rodo: true,
  wykonanie_retencji: true,
  odczyt_stanu_systemu: true,
  odczyt_rozliczen_prowizji: true,
};

describe('domyślna odmowa', () => {
  test('aktor bez ról nie może nic — dla każdej zdefiniowanej operacji', () => {
    const nikt: Actor = { userId: 'n', grants: [] };

    for (const akcja of Object.keys(WSZYSTKIE_AKCJE) as Action[]) {
      assert.equal(can(nikt, akcja, firma(FIRMA_X)).allowed, false, akcja);
      assert.equal(can(nikt, akcja, { kind: 'system' }).allowed, false, `${akcja} / system`);
    }
  });

  test('poza listą operacji administracyjnych admin nie może nic', () => {
    // Lista AKCJE_ADMINISTRACYJNE jest pełnym zakresem uprawnień administratora,
    // a nie tylko ich częścią wygodną do wypisania.
    for (const akcja of Object.keys(WSZYSTKIE_AKCJE) as Action[]) {
      if (czyAkcjaAdministracyjna(akcja)) continue;
      assert.equal(can(admin, akcja, { kind: 'system' }).allowed, false, akcja);
    }
  });

  test('odmowa niesie powód, nie samo „nie"', () => {
    const decyzja = can(hr(FIRMA_X), 'odczyt_dashboardu', firma(FIRMA_Y));
    assert.equal(decyzja.allowed, false);
    if (!decyzja.allowed) assert.ok(decyzja.reason.length > 10);
  });

  test('assertCan rzuca wyjątkiem z nazwą operacji', () => {
    assert.throws(
      () => assertCan(hr(FIRMA_X), 'odczyt_dashboardu', firma(FIRMA_Y)),
      AccessDeniedError,
    );
  });
});
