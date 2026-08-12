import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DNI_TOLERANCJI_PASSY,
  LIMIT_PUNKTOW_DZIENNIE,
  MAKSIMA_DOBOWE,
  najdluzszaPassa,
  OKNO_WSTECZNE_DNI,
  passa,
  PomiarPozaOknemError,
  PomiarPozaZakresemError,
  PomiarPrzedStartemError,
  postepPoziomu,
  poziom,
  punktyDnia,
  punktyOkresu,
  zapiszPomiar,
  type Pomiar,
} from '../src/index.ts';
import { dni, pomiar, wyzwanie, WYZWANIE_SNU } from './fixtures.ts';

const KROKI = wyzwanie();
const KONTEKST = { wyzwanie: KROKI, od: '2026-09-01', dzisiaj: '2026-09-10' };

describe('zapisywanie pomiarów', () => {
  test('wpis ręczny za dziś i wczoraj przechodzi', () => {
    const reczny = (dzien: string): Pomiar => ({
      wyzwanieId: 'w-kroki',
      dzien,
      wartosc: 11_000,
      zrodlo: 'reczne',
    });

    assert.equal(zapiszPomiar([], reczny('2026-09-10'), KONTEKST).length, 1);
    assert.equal(zapiszPomiar([], reczny('2026-09-09'), KONTEKST).length, 1);
  });

  test('ręczne uzupełnianie odległych dni jest odrzucane', () => {
    // Wyzwanie wygrane deklaracją nie mówi nic o zdrowiu.
    assert.throws(
      () =>
        zapiszPomiar(
          [],
          { wyzwanieId: 'w-kroki', dzien: '2026-09-03', wartosc: 12_000, zrodlo: 'reczne' },
          KONTEKST,
        ),
      PomiarPozaOknemError,
    );
  });

  test('dane z urządzenia mogą się spóźnić o kilka dni', () => {
    assert.equal(OKNO_WSTECZNE_DNI.wearable > OKNO_WSTECZNE_DNI.reczne, true);
    assert.equal(zapiszPomiar([], pomiar('2026-09-05', 12_000), KONTEKST).length, 1);
  });

  test('pomiar z przyszłości jest odrzucany', () => {
    assert.throws(() => zapiszPomiar([], pomiar('2026-09-11', 12_000), KONTEKST), PomiarPozaOknemError);
  });

  test('pomiar sprzed startu wyzwania jest odrzucany', () => {
    assert.throws(
      () => zapiszPomiar([], pomiar('2026-08-30', 12_000), KONTEKST),
      PomiarPrzedStartemError,
    );
  });

  test('wartość spoza zakresu jest odrzucana, a nie przycinana', () => {
    // Przycięcie zapisałoby liczbę, której nikt nie zmierzył.
    assert.throws(
      () => zapiszPomiar([], pomiar('2026-09-10', 250_000), KONTEKST),
      PomiarPozaZakresemError,
    );
    assert.throws(() => zapiszPomiar([], pomiar('2026-09-10', -5), KONTEKST), PomiarPozaZakresemError);
  });

  test('każda metryka ma maksimum dobowe', () => {
    for (const [metryka, maksimum] of Object.entries(MAKSIMA_DOBOWE)) {
      assert.ok(maksimum > 0, metryka);
    }
  });

  test('drugi pomiar tego samego dnia zastępuje pierwszy', () => {
    // Inaczej cel dałoby się zebrać w ratach i zgłosić kilka razy.
    const po = zapiszPomiar([pomiar('2026-09-10', 4_000)], pomiar('2026-09-10', 11_000), KONTEKST);

    assert.equal(po.length, 1);
    assert.equal(po[0]!.wartosc, 11_000);
  });

  test('pomiary są posortowane po dniu', () => {
    let stan = zapiszPomiar([], pomiar('2026-09-10', 11_000), KONTEKST);
    stan = zapiszPomiar(stan, pomiar('2026-09-08', 12_000), KONTEKST);

    assert.deepEqual(
      stan.map((p) => p.dzien),
      ['2026-09-08', '2026-09-10'],
    );
  });
});

describe('punkty', () => {
  test('cel osiągnięty daje punkty, niedobór nie daje nic', () => {
    assert.equal(punktyDnia([{ wyzwanie: KROKI, wartosc: 10_000 }]).punkty, 10);
    assert.equal(punktyDnia([{ wyzwanie: KROKI, wartosc: 9_999 }]).punkty, 0);
  });

  test('przekroczenie celu nie daje więcej punktów', () => {
    // Cel dzienny jest progiem, nie licznikiem — inaczej nagradzalibyśmy
    // przetrenowanie, a odpoczynek robił się stratą.
    assert.equal(punktyDnia([{ wyzwanie: KROKI, wartosc: 40_000 }]).punkty, 10);
  });

  test('dobowy limit obcina sumę i mówi o tym wprost', () => {
    const pozycje = Array.from({ length: 12 }, (_, i) => ({
      wyzwanie: wyzwanie({ id: `w-${i}` }),
      wartosc: 12_000,
    }));
    const wynik = punktyDnia(pozycje);

    assert.equal(wynik.punkty, LIMIT_PUNKTOW_DZIENNIE);
    assert.equal(wynik.ograniczone, true);
  });

  test('limit nie jest zgłaszany, gdy nie zadziałał', () => {
    assert.equal(punktyDnia([{ wyzwanie: KROKI, wartosc: 12_000 }]).ograniczone, false);
  });

  test('limit dobowy działa na dzień, nie na sumę okresu', () => {
    const dziesiecDni = dni('2026-09-01', 10).map((dzien) => pomiar(dzien, 12_000));
    assert.equal(punktyOkresu([KROKI], dziesiecDni), 100);
  });

  test('pomiary nieznanego wyzwania są pomijane', () => {
    assert.equal(punktyOkresu([KROKI], [pomiar('2026-09-01', 12_000, 'w-obce')]), 0);
  });
});

describe('passa', () => {
  const seria = (wartosci: readonly number[], od = '2026-09-01'): Pomiar[] =>
    dni(od, wartosci.length).map((dzien, i) => pomiar(dzien, wartosci[i]!));

  test('kolejne dni z celem budują passę', () => {
    const pomiary = seria([12_000, 11_000, 10_500]);
    assert.equal(passa(KROKI, pomiary, '2026-09-03', '2026-09-01'), 3);
  });

  test('jeden dzień przerwy nie kasuje passy', () => {
    // Passa, którą kasuje jeden dzień choroby, uczy ćwiczyć na chorobie.
    const pomiary = seria([12_000, 11_000, 2_000, 12_000]);
    assert.equal(passa(KROKI, pomiary, '2026-09-04', '2026-09-01'), 3);
  });

  test('dwa dni z rzędu kończą passę', () => {
    const pomiary = seria([12_000, 12_000, 1_000, 1_000, 12_000]);
    assert.equal(passa(KROKI, pomiary, '2026-09-05', '2026-09-01'), 1);
    assert.equal(DNI_TOLERANCJI_PASSY, 1);
  });

  test('brak pomiaru liczy się jak dzień bez celu', () => {
    const pomiary = [pomiar('2026-09-01', 12_000), pomiar('2026-09-04', 12_000)];
    assert.equal(passa(KROKI, pomiary, '2026-09-04', '2026-09-01'), 1);
  });

  test('passa nie sięga przed start wyzwania', () => {
    const pomiary = seria([12_000, 12_000]);
    assert.equal(passa(KROKI, pomiary, '2026-09-02', '2026-09-01'), 2);
  });

  test('najdłuższa passa pamięta serię sprzed przerwy', () => {
    const pomiary = seria([12_000, 12_000, 12_000, 1_000, 1_000, 12_000]);

    assert.equal(passa(KROKI, pomiary, '2026-09-06', '2026-09-01'), 1);
    assert.equal(najdluzszaPassa(KROKI, pomiary, '2026-09-01', '2026-09-06'), 3);
  });

  test('najdłuższa passa nie skleja serii przez dwie przerwy', () => {
    const pomiary = seria([12_000, 12_000, 1_000, 1_000, 12_000, 12_000, 12_000]);
    assert.equal(najdluzszaPassa(KROKI, pomiary, '2026-09-01', '2026-09-07'), 3);
  });

  test('pojedyncza przerwa nie dzieli najdłuższej passy', () => {
    const pomiary = seria([12_000, 12_000, 1_000, 12_000, 12_000]);
    assert.equal(najdluzszaPassa(KROKI, pomiary, '2026-09-01', '2026-09-05'), 4);
  });

  test('passa liczy tylko własne wyzwanie', () => {
    const pomiary = [pomiar('2026-09-01', 12_000, 'w-sen')];
    assert.equal(passa(KROKI, pomiary, '2026-09-01', '2026-09-01'), 0);
    assert.equal(passa(WYZWANIE_SNU, [pomiar('2026-09-01', 480, 'w-sen')], '2026-09-01', '2026-09-01'), 1);
  });
});

describe('poziomy', () => {
  test('progi rosną i zaczynają się od zera', () => {
    assert.equal(poziom(0).kod, 'start');
    assert.equal(poziom(299).kod, 'start');
    assert.equal(poziom(300).kod, 'regularny');
    assert.equal(poziom(5_000).kod, 'mistrz');
  });

  test('postęp mówi, ile brakuje do następnego poziomu', () => {
    const postep = postepPoziomu(250);

    assert.equal(postep.biezacy.kod, 'start');
    assert.equal(postep.nastepny?.kod, 'regularny');
    assert.equal(postep.brakuje, 50);
  });

  test('na najwyższym poziomie nie ma następnego', () => {
    const postep = postepPoziomu(9_000);

    assert.equal(postep.biezacy.kod, 'mistrz');
    assert.equal(postep.nastepny, undefined);
    assert.equal('brakuje' in postep, false);
  });
});
