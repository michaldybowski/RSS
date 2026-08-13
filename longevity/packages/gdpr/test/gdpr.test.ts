import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  czyNieprzypisywalny,
  doFormatuPrzenoszalnego,
  OPIS_RODZAJU,
  opisRodzaju,
  PamieciowyAuditLog,
  rekordy,
  POLITYKA_RETENCJI,
  regulaDla,
  terminRetencji,
  wykonajRetencje,
  wykonajUsuniecie,
  wymagalne,
  wymagaLogu,
  zaplanujUsuniecie,
  zbudujEksport,
  type Rekord,
  type ZbiorPodmiotu,
} from '../src/index.ts';

const rekord = (id: string, rodzaj: Rekord['rodzaj'], utworzono: string): Rekord => ({
  id,
  rodzaj,
  utworzono,
  dane: { przyklad: 'wartość' },
});

function zbior(overrides: Partial<ZbiorPodmiotu> = {}): ZbiorPodmiotu {
  return {
    subjectRef: 'psd-001',
    uczestnictwo: { od: '2026-01-15', do: '2026-12-31' },
    tozsamosc: {
      userId: 'u-1',
      email: 'anna@example.org',
      imie: 'Anna',
      nazwisko: 'Kowalska',
      dataUrodzenia: '1984-03-12',
    },
    rekordy: [
      rekord('r-1', 'kwestionariusz', '2026-02-01'),
      rekord('r-2', 'plan', '2026-02-02'),
      rekord('r-3', 'health_score', '2026-02-02'),
      rekord('r-4', 'dziennik_objawow', '2026-03-01'),
      rekord('r-5', 'wearables_surowe', '2026-02-10'),
      rekord('r-6', 'zgoda', '2026-01-15'),
      rekord('r-7', 'audit_log', '2026-02-01'),
      rekord('r-8', 'dokument_ksiegowy', '2026-09-30'),
    ],
    ...overrides,
  };
}

describe('audit log', () => {
  test('wpisy są niemodyfikowalne', () => {
    const log = new PamieciowyAuditLog();
    const wpis = log.dopisz({
      actorRef: 'psd-001',
      subjectRef: 'psd-001',
      akcja: 'odczyt_danych_zdrowotnych',
      zasob: 'intake/1',
      at: '2026-08-01T10:00:00Z',
    });

    assert.throws(() => {
      (wpis as { akcja: string }).akcja = 'logowanie';
    });
  });

  test('interfejs nie udostępnia metod zmiany ani usunięcia', () => {
    const log = new PamieciowyAuditLog();
    const metody = Object.getOwnPropertyNames(Object.getPrototypeOf(log));
    assert.deepEqual(metody.filter((m) => /update|delete|usun|zmien/iu.test(m)), []);
  });

  test('wpisy odnoszą się do pseudonimu, nie do tożsamości', () => {
    const log = new PamieciowyAuditLog();
    const wpis = log.dopisz({
      actorRef: 'psd-002',
      subjectRef: 'psd-001',
      akcja: 'udostepnienie_lekarzowi',
      zasob: 'karta/1',
      at: '2026-08-01T10:00:00Z',
    });

    const serialized = JSON.stringify(wpis);
    assert.ok(!serialized.includes('Kowalska'));
    assert.ok(!serialized.includes('anna@example.org'));
  });

  test('filtrowanie po podmiocie i akcji', () => {
    const log = new PamieciowyAuditLog();
    log.dopisz({ actorRef: 'a', subjectRef: 'psd-001', akcja: 'logowanie', zasob: '/', at: '2026-08-01T09:00:00Z' });
    log.dopisz({ actorRef: 'a', subjectRef: 'psd-002', akcja: 'logowanie', zasob: '/', at: '2026-08-01T10:00:00Z' });
    log.dopisz({ actorRef: 'a', subjectRef: 'psd-001', akcja: 'eksport_danych', zasob: '/', at: '2026-08-02T10:00:00Z' });

    assert.equal(log.odczytaj({ subjectRef: 'psd-001' }).length, 2);
    assert.equal(log.odczytaj({ akcja: 'eksport_danych' }).length, 1);
    assert.equal(log.odczytaj({ od: '2026-08-02' }).length, 1);
  });

  test('operacje na danych zdrowotnych wymagają logu', () => {
    assert.equal(wymagaLogu('odczyt_danych_zdrowotnych'), true);
    assert.equal(wymagaLogu('przekazanie_do_modelu'), true);
    assert.equal(wymagaLogu('synchronizacja_tresci'), true);
    assert.equal(wymagaLogu('logowanie'), false);
  });

  test('identyfikatory są kolejne i przewidywalne', () => {
    const log = new PamieciowyAuditLog();
    const a = log.dopisz({ actorRef: 'a', akcja: 'logowanie', zasob: '/', at: 't1' });
    const b = log.dopisz({ actorRef: 'a', akcja: 'logowanie', zasob: '/', at: 't2' });
    assert.equal(a.id, 'audit-000001');
    assert.equal(b.id, 'audit-000002');
  });
});

describe('retencja', () => {
  test('każdy rodzaj rekordu ma regułę', () => {
    const rodzaje = [
      'kwestionariusz',
      'plan',
      'health_score',
      'wyniki_badan',
      'dziennik_objawow',
      'wearables_surowe',
      'zgoda',
      'audit_log',
      'dokument_ksiegowy',
    ] as const;

    for (const rodzaj of rodzaje) assert.ok(regulaDla(rodzaj), rodzaj);
  });

  test('trzy punkty odniesienia są używane', () => {
    const punkty = new Set(POLITYKA_RETENCJI.map((r) => r.punktOdniesienia));
    assert.equal(punkty.size, 3);
  });

  test('zegar nie rusza, dopóki uczestnictwo trwa', () => {
    const trwajace = { od: '2026-01-15' };
    assert.equal(terminRetencji(rekord('r', 'kwestionariusz', '2026-02-01'), trwajace), undefined);
  });

  test('kwestionariusz usuwany trzy lata po zakończeniu uczestnictwa', () => {
    const wynik = terminRetencji(rekord('r', 'kwestionariusz', '2026-02-01'), {
      od: '2026-01-15',
      do: '2026-12-31',
    });
    assert.equal(wynik?.termin, '2029-12-31');
  });

  test('dziennik objawów krócej niż kwestionariusz', () => {
    const uczestnictwo = { od: '2026-01-15', do: '2026-12-31' };
    assert.equal(terminRetencji(rekord('r', 'dziennik_objawow', '2026-03-01'), uczestnictwo)?.termin, '2027-12-31');
  });

  test('surowe dane z wearables są agregowane, nie usuwane', () => {
    const wynik = terminRetencji(rekord('r', 'wearables_surowe', '2026-02-10'), {
      od: '2026-01-15',
      do: '2026-12-31',
    });
    assert.equal(wynik?.termin, '2028-02-10');
    assert.equal(wynik?.regula.akcja, 'agreguj_dobowo');
  });

  test('dokument księgowy liczony od końca roku obrotowego', () => {
    const wynik = terminRetencji(rekord('r', 'dokument_ksiegowy', '2026-09-30'), {
      od: '2026-01-15',
      do: '2026-12-31',
    });
    assert.equal(wynik?.termin, '2031-12-31');
  });

  test('audit log liczony od utworzenia, nie od zakończenia uczestnictwa', () => {
    const wynik = terminRetencji(rekord('r', 'audit_log', '2026-02-01'), {
      od: '2026-01-15',
      do: '2026-12-31',
    });
    assert.equal(wynik?.termin, '2031-02-01');
  });

  test('sweeper zwraca tylko wymagalne, posortowane po terminie', () => {
    const zadania = wymagalne(zbior().rekordy, zbior().uczestnictwo, '2028-06-01');

    assert.ok(zadania.length > 0);
    assert.ok(zadania.every((z) => z.termin <= '2028-06-01'));
    const terminy = zadania.map((z) => z.termin);
    assert.deepEqual(terminy, [...terminy].sort());
  });

  test('sweeper nic nie zwraca przed terminami', () => {
    assert.deepEqual(wymagalne(zbior().rekordy, zbior().uczestnictwo, '2027-01-01'), []);
  });

  test('sweeper zwraca zadania, nie wykonuje ich', () => {
    const dane = zbior();
    const przed = dane.rekordy.length;
    wymagalne(dane.rekordy, dane.uczestnictwo, '2032-01-01');
    assert.equal(dane.rekordy.length, przed);
  });

  test('wykonanie retencji usuwa to, co wymagalne, i zostawia resztę', () => {
    const przed = zbior();
    const { zbior: po, wykonane } = wykonajRetencje(przed, '2030-01-01');

    // Na tę datę wymagalne są: kwestionariusz, plan, health_score, zgoda,
    // dziennik objawów i surowe wearables. Audit log i dokument księgowy
    // mają dłuższe terminy i zostają.
    assert.equal(wykonane.length, 6);
    assert.deepEqual(
      po.rekordy.map((r) => r.rodzaj).sort(),
      ['audit_log', 'dokument_ksiegowy', 'wearables_dobowe'],
    );
    assert.equal(przed.rekordy.length, 8, 'wykonanie retencji zmodyfikowało wejście');
  });

  test('agregacja kasuje surowe próbki, zostawiając ślad dobowy', () => {
    const { zbior: po } = wykonajRetencje(zbior(), '2029-01-01');
    const dobowy = po.rekordy.find((r) => r.rodzaj === 'wearables_dobowe');

    assert.ok(dobowy, 'brak rekordu dobowego po agregacji');
    assert.equal(po.rekordy.some((r) => r.rodzaj === 'wearables_surowe'), false);
    assert.deepEqual(dobowy.dane, { zrodlo: 'r-5', zagregowano: '2029-01-01' });
  });

  test('przed terminami wykonanie retencji nie rusza niczego', () => {
    const { zbior: po, wykonane } = wykonajRetencje(zbior(), '2027-01-01');
    assert.equal(wykonane.length, 0);
    assert.equal(po.rekordy.length, 8);
  });
});

describe('etykiety', () => {
  test('żadna nazwa nie wygląda jak identyfikator z bazy', () => {
    // Jednowyrazowe kody („plan") bywają zarazem poprawną nazwą — sprawdzamy
    // więc kształt, a nie różnicę wobec kodu.
    for (const [kod, opis] of Object.entries(OPIS_RODZAJU)) {
      assert.ok(opis.length > 0, kod);
      assert.equal(/_/.test(opis), false, `nazwa "${opis}" wygląda jak identyfikator`);
    }
  });

  test('kody wielowyrazowe dostały prawdziwe nazwy', () => {
    assert.equal(OPIS_RODZAJU.wearables_surowe, 'surowe dane z urządzeń');
    assert.equal(OPIS_RODZAJU.tozsamosc, 'dane identyfikacyjne');
    assert.equal(OPIS_RODZAJU.dokument_ksiegowy, 'dokumenty księgowe');
  });

  test('nieznany rodzaj nie wywraca opisu', () => {
    assert.equal(opisRodzaju('cos_nowego'), 'cos_nowego');
  });

  test('liczebnik odmienia rekordy', () => {
    assert.equal(rekordy(1), '1 rekord');
    assert.equal(rekordy(2), '2 rekordy');
    assert.equal(rekordy(5), '5 rekordów');
    assert.equal(rekordy(12), '12 rekordów');
    assert.equal(rekordy(22), '22 rekordy');
    assert.equal(rekordy(0), '0 rekordów');
  });

  test('potwierdzenie usunięcia jest napisane po polsku', () => {
    const { potwierdzenie } = wykonajUsuniecie(zbior(), 'w-1', '2026-08-01');
    assert.match(potwierdzenie.komunikat, /Zachowano 2 rekordy,/);
  });
});

describe('eksport (art. 15 i 20)', () => {
  const pakiet = zbudujEksport(zbior(), '2026-08-01');

  test('zawiera cele przetwarzania i podstawy prawne', () => {
    assert.ok(pakiet.celePrzetwarzania.length >= 5);
    assert.ok(pakiet.celePrzetwarzania.every((cel) => cel.podstawaPrawna.length > 10));
  });

  test('opisuje wszystkie moduły, które dotykają danych osoby', () => {
    // Eksport z art. 15 ma mówić, po co przetwarzamy dane — a nie tylko po co
    // przetwarzaliśmy je w chwili pisania pierwszej wersji. Nowy moduł
    // sięgający po dane uczestnika musi tu dopisać swój cel.
    const cele = pakiet.celePrzetwarzania.map((cel) => cel.cel).join(' | ');

    for (const modul of ['plan', 'AI', 'lekarz', 'konsultacji', 'partnera', 'pracodawcy']) {
      assert.ok(cele.includes(modul), `brak celu obejmującego „${modul}": ${cele}`);
    }
  });

  test('wskazuje odbiorców, w tym transfer poza EOG', () => {
    const odbiorcy = pakiet.celePrzetwarzania.flatMap((cel) => cel.odbiorcy);
    assert.ok(odbiorcy.some((odbiorca) => /poza EOG/u.test(odbiorca)));
  });

  test('wymienia prawa osoby, łącznie ze skargą do organu', () => {
    assert.ok(pakiet.prawa.some((prawo) => /UODO|Urzędu Ochrony Danych/u.test(prawo)));
    assert.ok(pakiet.prawa.some((prawo) => /art\. 22|zautomatyzowan/u.test(prawo)));
  });

  test('każdy rekord niesie termin przechowywania', () => {
    const pozycje = Object.values(pakiet.dane).flat();
    assert.ok(pozycje.length > 0);
    assert.ok(pozycje.every((pozycja) => pozycja.przechowywanyDo !== undefined));
  });

  test('rekordy pogrupowane po rodzaju', () => {
    assert.ok('kwestionariusz' in pakiet.dane);
    assert.ok('dokument_ksiegowy' in pakiet.dane);
    assert.equal(pakiet.liczbaRekordow, 8);
  });

  test('format przenoszalny zawiera dane bez części informacyjnej', () => {
    const json = doFormatuPrzenoszalnego(pakiet);
    const odczytany = JSON.parse(json);

    assert.equal(odczytany.subjectRef, 'psd-001');
    assert.ok(odczytany.dane.kwestionariusz);
    assert.equal(odczytany.celePrzetwarzania, undefined);
  });

  test('eksport bez tożsamości nie wymyśla jej', () => {
    const bezTozsamosci = zbudujEksport(zbior({ tozsamosc: undefined }), '2026-08-01');
    assert.equal(bezTozsamosci.tozsamosc, undefined);
  });
});

describe('usunięcie (art. 17)', () => {
  const { zbior: po, potwierdzenie } = wykonajUsuniecie(zbior(), 'wns-1', '2026-08-05');

  test('dane zdrowotne znikają', () => {
    const rodzaje = po.rekordy.map((r) => r.rodzaj);
    for (const rodzaj of ['kwestionariusz', 'plan', 'health_score', 'dziennik_objawow', 'wearables_surowe']) {
      assert.ok(!rodzaje.includes(rodzaj as Rekord['rodzaj']), rodzaj);
    }
  });

  test('tożsamość znika, a pseudonim zostaje', () => {
    assert.equal(po.tozsamosc, undefined);
    assert.equal(po.subjectRef, 'psd-001');
    assert.equal(potwierdzenie.tozsamoscUsunieta, true);
  });

  test('dokumenty księgowe zostają, z jawną podstawą', () => {
    assert.ok(po.rekordy.some((r) => r.rodzaj === 'dokument_ksiegowy'));

    const pozycja = potwierdzenie.pozycje.find((p) => p.rodzaj === 'dokument_ksiegowy');
    assert.equal(pozycja?.los, 'zachowany_z_ograniczeniem');
    assert.match(pozycja?.podstawa ?? '', /rachunkowości/u);
    assert.equal(pozycja?.do, '2031-12-31');
  });

  test('audit log zostaje, ale przestaje prowadzić do osoby', () => {
    assert.ok(po.rekordy.some((r) => r.rodzaj === 'audit_log'));

    const pozycja = potwierdzenie.pozycje.find((p) => p.rodzaj === 'audit_log');
    assert.equal(pozycja?.los, 'zachowany_bez_przypisania');
    assert.match(pozycja?.podstawa ?? '', /nie prowadzą już do osoby/u);
  });

  test('potwierdzenie wylicza wszystko, co zostało i dlaczego', () => {
    const rodzaje = potwierdzenie.pozycje.map((p) => p.rodzaj).sort();
    assert.ok(rodzaje.includes('tozsamosc'));
    assert.ok(potwierdzenie.pozycje.every((p) => p.podstawa.length > 15));
    assert.match(potwierdzenie.komunikat, /Zachowano/u);
  });

  test('plan usunięcia nie zmienia zbioru', () => {
    const dane = zbior();
    const przed = dane.rekordy.length;
    zaplanujUsuniecie(dane, '2026-08-05');
    assert.equal(dane.rekordy.length, przed);
    assert.ok(dane.tozsamosc !== undefined);
  });

  test('po usunięciu zbiór jest nieprzypisywalny do osoby', () => {
    assert.equal(czyNieprzypisywalny(po), true);
    assert.equal(czyNieprzypisywalny(zbior()), false);
  });

  test('zbiór bez dokumentów księgowych znika w całości', () => {
    const bezKsiegowych = zbior({
      rekordy: [rekord('r-1', 'kwestionariusz', '2026-02-01'), rekord('r-2', 'plan', '2026-02-02')],
    });
    const wynik = wykonajUsuniecie(bezKsiegowych, 'wns-2', '2026-08-05');

    assert.deepEqual(wynik.zbior.rekordy, []);
    assert.match(wynik.potwierdzenie.komunikat, /Nie zachowano żadnych danych/u);
  });

  test('usunięcie jest idempotentne', () => {
    const pierwsze = wykonajUsuniecie(zbior(), 'wns-1', '2026-08-05');
    const drugie = wykonajUsuniecie(pierwsze.zbior, 'wns-1', '2026-08-05');

    assert.deepEqual(drugie.zbior.rekordy, pierwsze.zbior.rekordy);
  });
});
