import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  allowTrend,
  auditDashboardAccess,
  bandSize,
  buildDashboard,
  checkGroup,
  detectProbing,
  PROG_K,
  roundShare,
  type DashboardAuditEntry,
  type ParticipantRecord,
} from '../src/index.ts';

const ORG = 'org-x';

function osoby(
  count: number,
  overrides: Partial<ParticipantRecord> = {},
  prefix = 'u',
): ParticipantRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `${prefix}-${index}`,
    organizationId: ORG,
    ageBand: '40-49',
    sex: 'M',
    active: true,
    healthScore: 70,
    challengesCompleted: 1,
    workshopsAttended: 1,
    workshopsOffered: 2,
    ...overrides,
  }));
}

describe('próg k-anonimowości', () => {
  test('grupa poniżej progu nie zwraca wyniku', () => {
    const wynik = buildDashboard(osoby(9), { organizationId: ORG, metric: 'uczestnictwo' });
    assert.equal(wynik.kind, 'za_malo_danych');
    if (wynik.kind === 'za_malo_danych') assert.equal(wynik.powod, 'grupa_ponizej_progu');
  });

  test('grupa dokładnie na progu przechodzi', () => {
    assert.equal(buildDashboard(osoby(PROG_K), { organizationId: ORG, metric: 'uczestnictwo' }).kind, 'wynik');
  });

  test('dopełnienie poniżej progu też blokuje wynik', () => {
    // 12 osób, filtr obejmuje 11 — dwunasta osoba jest identyfikowalna przez
    // różnicę, mimo że pokazywana grupa formalnie próg spełnia.
    const records = [...osoby(11, { sex: 'M' }, 'm'), ...osoby(1, { sex: 'K' }, 'k')];

    const bezFiltra = buildDashboard(records, { organizationId: ORG, metric: 'uczestnictwo' });
    assert.equal(bezFiltra.kind, 'wynik');

    const zawezony = buildDashboard(records, {
      organizationId: ORG,
      metric: 'uczestnictwo',
      filters: { sex: 'M' },
    });
    assert.equal(zawezony.kind, 'za_malo_danych');
    if (zawezony.kind === 'za_malo_danych') assert.equal(zawezony.powod, 'dopelnienie_ponizej_progu');
  });

  test('krzyżowanie filtrów poniżej progu jest blokowane', () => {
    const records = [
      ...osoby(20, { sex: 'M', ageBand: '40-49' }, 'm'),
      ...osoby(6, { sex: 'K', ageBand: '30-39' }, 'k'),
    ];

    const wynik = buildDashboard(records, {
      organizationId: ORG,
      metric: 'uczestnictwo',
      filters: { sex: 'K', ageBand: '30-39' },
    });

    assert.equal(wynik.kind, 'za_malo_danych');
  });

  test('rekordy innej organizacji nie wpadają do wyniku', () => {
    const records = [...osoby(5), ...osoby(20, { organizationId: 'org-y' }, 'y')];
    const wynik = buildDashboard(records, { organizationId: ORG, metric: 'uczestnictwo' });
    assert.equal(wynik.kind, 'za_malo_danych');
  });
});

describe('zaokrąglanie i przedziały', () => {
  test('liczebność podawana jako przedział, nie dokładna wartość', () => {
    const wynik = buildDashboard(osoby(37), { organizationId: ORG, metric: 'uczestnictwo' });
    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') assert.equal(wynik.liczebnosc, '30-39');
  });

  test('bandSize nie ujawnia grup poniżej progu', () => {
    assert.equal(bandSize(4), 'poniżej 10');
    assert.equal(bandSize(23), '20-29');
  });

  test('udziały zaokrąglane do pełnych pięciu punktów', () => {
    // Precyzja do dziesiątych pozwoliłaby odtworzyć licznik i mianownik.
    assert.equal(roundShare(7, 23), 30);
    assert.equal(roundShare(1, 3), 35);
    assert.equal(roundShare(0, 12), 0);
  });

  test('udziały nie zdradzają dokładnej liczby osób', () => {
    const wynik = buildDashboard(osoby(23, { active: true }), {
      organizationId: ORG,
      metric: 'uczestnictwo',
    });

    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') {
      for (const band of wynik.wartosci) assert.equal(band.udzialProcent % 5, 0);
    }
  });
});

describe('metryki', () => {
  test('uczestnictwo liczy aktywnych', () => {
    const records = [...osoby(15, { active: true }, 'a'), ...osoby(5, { active: false }, 'n')];
    const wynik = buildDashboard(records, { organizationId: ORG, metric: 'uczestnictwo' });

    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') {
      assert.equal(wynik.wartosci.find((b) => b.etykieta === 'aktywni')?.udzialProcent, 75);
    }
  });

  test('rozkład Health Score w przedziałach', () => {
    const records = [
      ...osoby(10, { healthScore: 85 }, 'w'),
      ...osoby(10, { healthScore: 45 }, 's'),
    ];
    const wynik = buildDashboard(records, { organizationId: ORG, metric: 'rozklad_health_score' });

    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') {
      assert.equal(wynik.wartosci.find((b) => b.etykieta === '80-100')?.udzialProcent, 50);
      assert.equal(wynik.wartosci.find((b) => b.etykieta === '40-59')?.udzialProcent, 50);
    }
  });

  test('osoby bez wyniku są odejmowane przed sprawdzeniem progu', () => {
    // Grupa 20-osobowa, ale wynik ma dwoje — pokazanie rozkładu ujawniłoby ich.
    const records = [
      ...osoby(2, { healthScore: 90 }, 'z'),
      ...osoby(18, { healthScore: undefined }, 'b'),
    ];
    const wynik = buildDashboard(records, { organizationId: ORG, metric: 'rozklad_health_score' });

    assert.equal(wynik.kind, 'za_malo_danych');
    if (wynik.kind === 'za_malo_danych') assert.equal(wynik.powod, 'brak_danych_metryki');
  });

  test('frekwencja liczona z ofert i obecności', () => {
    const wynik = buildDashboard(osoby(20, { workshopsAttended: 3, workshopsOffered: 4 }), {
      organizationId: ORG,
      metric: 'frekwencja_warsztatow',
    });

    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') assert.match(wynik.podsumowanie ?? '', /75%/u);
  });

  test('brak oferty warsztatów nie daje dzielenia przez zero', () => {
    const wynik = buildDashboard(osoby(20, { workshopsOffered: 0, workshopsAttended: 0 }), {
      organizationId: ORG,
      metric: 'frekwencja_warsztatow',
    });
    assert.equal(wynik.kind, 'za_malo_danych');
  });
});

describe('brak wycieku identyfikatorów', () => {
  test('wynik nie zawiera identyfikatora żadnego uczestnika', () => {
    const records = osoby(25);
    for (const metric of ['uczestnictwo', 'rozklad_health_score', 'wyzwania', 'frekwencja_warsztatow'] as const) {
      const wynik = buildDashboard(records, { organizationId: ORG, metric });
      const serialized = JSON.stringify(wynik);

      for (const record of records) {
        assert.ok(!serialized.includes(record.participantId), `${metric}: wyciek ${record.participantId}`);
      }
    }
  });

  test('wynik nie zawiera surowych liczebności', () => {
    const wynik = buildDashboard(osoby(23), { organizationId: ORG, metric: 'uczestnictwo' });
    assert.equal(wynik.kind, 'wynik');
    if (wynik.kind === 'wynik') assert.ok(!JSON.stringify(wynik.liczebnosc).includes('23'));
  });
});

describe('porównania w czasie', () => {
  test('grupy blisko progu nie dostają trendu', () => {
    assert.equal(allowTrend([11, 12, 11]), false);
    assert.equal(allowTrend([40, 42, 39]), true);
  });

  test('pojedynczy okres poniżej marginesu blokuje cały trend', () => {
    assert.equal(allowTrend([40, 13, 41]), false);
  });
});

describe('rejestr wejść', () => {
  test('wpis zapisuje zastosowane filtry', () => {
    const query = {
      organizationId: ORG,
      metric: 'uczestnictwo' as const,
      filters: { sex: 'K' as const, ageBand: '30-39' as const },
    };
    const wynik = buildDashboard(osoby(30), query);
    const wpis = auditDashboardAccess('hr-1', query, wynik, '2026-08-01T10:00:00Z');

    assert.deepEqual(wpis.filters, { sex: 'K', ageBand: '30-39' });
    assert.equal(wpis.actorUserId, 'hr-1');
  });

  test('wstrzymanie wyniku jest odnotowane z powodem', () => {
    const query = { organizationId: ORG, metric: 'uczestnictwo' as const };
    const wynik = buildDashboard(osoby(3), query);
    const wpis = auditDashboardAccess('hr-1', query, wynik, '2026-08-01T10:00:00Z');

    assert.equal(wpis.outcome, 'za_malo_danych');
    assert.equal(wpis.suppressionReason, 'grupa_ponizej_progu');
  });

  test('seria coraz węższych zapytań podnosi alert', () => {
    const wpisy: DashboardAuditEntry[] = [
      { actorUserId: 'hr-1', organizationId: ORG, metric: 'uczestnictwo', filters: {}, outcome: 'wynik', at: 't1' },
      { actorUserId: 'hr-1', organizationId: ORG, metric: 'uczestnictwo', filters: { unitId: 'a' }, outcome: 'za_malo_danych', at: 't2' },
      { actorUserId: 'hr-1', organizationId: ORG, metric: 'uczestnictwo', filters: { unitId: 'a', sex: 'K' }, outcome: 'za_malo_danych', at: 't3' },
      { actorUserId: 'hr-1', organizationId: ORG, metric: 'uczestnictwo', filters: { unitId: 'a', sex: 'K', ageBand: '30-39' }, outcome: 'za_malo_danych', at: 't4' },
    ];

    assert.equal(detectProbing(wpisy), true);
  });

  test('zwykłe korzystanie nie podnosi alertu', () => {
    const wpisy: DashboardAuditEntry[] = Array.from({ length: 5 }, (_, i) => ({
      actorUserId: 'hr-1',
      organizationId: ORG,
      metric: 'uczestnictwo',
      filters: {},
      outcome: 'wynik',
      at: `t${i}`,
    }));

    assert.equal(detectProbing(wpisy), false);
  });
});

describe('kontrola grupy', () => {
  test('checkGroup działa niezależnie od metryki', () => {
    assert.equal(checkGroup(20, 100).suppressed, false);
    assert.equal(checkGroup(5, 100).suppressed, true);
    assert.equal(checkGroup(95, 100).suppressed, true);
    assert.equal(checkGroup(100, 100).suppressed, false);
  });
});
