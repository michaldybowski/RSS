import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  dolacz,
  dostepneWyzwania,
  JEDNOSTKI,
  METRYKI_WYSILKOWE,
  oceniaKwalifikacje,
  przegladKatalogu,
  PRZECIWWSKAZANIA,
  WyzwanieNiedozwoloneError,
  type Metryka,
} from '../src/index.ts';
import { flaga, METRYKI, ocena, wyzwanie, WYZWANIE_SNU, WYZWANIE_ZESPOLOWE } from './fixtures.ts';

describe('przeciwwskazania', () => {
  test('omdlenia blokują wyzwanie krokowe', () => {
    const wynik = oceniaKwalifikacje(wyzwanie(), { ocena: ocena([flaga('FLAG_SYNCOPE')]) });

    assert.equal(wynik.dozwolone, false);
    if (!wynik.dozwolone) {
      assert.equal(wynik.kod, 'przeciwwskazanie');
      assert.match(wynik.powod, /FLAG_SYNCOPE/);
    }
  });

  test('ból w klatce piersiowej blokuje trening', () => {
    const wynik = oceniaKwalifikacje(WYZWANIE_ZESPOLOWE, {
      ocena: ocena([flaga('FLAG_CHEST_PAIN')]),
    });
    assert.equal(wynik.dozwolone, false);
  });

  test('zaburzenia odżywiania blokują wyzwania krokowe i treningowe', () => {
    // Punkty za każdy kolejny krok bywają tu napędem kompulsji, nie motywacją.
    const kontekst = { ocena: ocena([flaga('FLAG_EATING_DISORDER')]) };

    assert.equal(oceniaKwalifikacje(wyzwanie(), kontekst).dozwolone, false);
    assert.equal(oceniaKwalifikacje(WYZWANIE_ZESPOLOWE, kontekst).dozwolone, false);
  });

  test('ta sama flaga nie blokuje snu ani nawodnienia', () => {
    const kontekst = { ocena: ocena([flaga('FLAG_EATING_DISORDER')]) };

    assert.equal(oceniaKwalifikacje(WYZWANIE_SNU, kontekst).dozwolone, true);
    assert.equal(
      oceniaKwalifikacje(wyzwanie({ id: 'w-woda', metryka: 'woda', cel: 2000 }), kontekst).dozwolone,
      true,
    );
  });

  test('flaga bez związku z wysiłkiem niczego nie blokuje', () => {
    const kontekst = { ocena: ocena([flaga('FLAG_LABS_STALE', 'ŻÓŁTA')]) };
    assert.equal(oceniaKwalifikacje(wyzwanie(), kontekst).dozwolone, true);
  });

  test('każde przeciwwskazanie dotyczy wyłącznie metryk wysiłkowych', () => {
    // Gdyby lista objęła sen albo nawodnienie, blokowalibyśmy dokładnie to,
    // co osobie z czerwoną flagą pomaga.
    for (const metryki of Object.values(PRZECIWWSKAZANIA)) {
      for (const metryka of metryki) {
        assert.ok(METRYKI_WYSILKOWE.includes(metryka), metryka);
      }
    }
  });
});

describe('kategoria ryzyka', () => {
  test('CZERWONA wstrzymuje wyzwania wysiłkowe', () => {
    const wynik = oceniaKwalifikacje(wyzwanie(), { ocena: ocena([], 'CZERWONA') });

    assert.equal(wynik.dozwolone, false);
    if (!wynik.dozwolone) assert.equal(wynik.kod, 'kategoria_ryzyka');
  });

  test('CZERWONA nie odcina uczestnika od gamifikacji', () => {
    // To jest sedno: człowiek z zatrzymanym planem nie zostaje bez niczego.
    const kontekst = { ocena: ocena([], 'CZERWONA') };
    const katalog = [
      wyzwanie(),
      WYZWANIE_SNU,
      wyzwanie({ id: 'w-woda', metryka: 'woda', cel: 2000 }),
      wyzwanie({ id: 'w-nawyk', metryka: 'nawyk', cel: 1 }),
    ];

    assert.deepEqual(
      dostepneWyzwania(katalog, kontekst).map((w) => w.id),
      ['w-sen', 'w-woda', 'w-nawyk'],
    );
  });

  test('ŻÓŁTA nie blokuje wyzwań wysiłkowych', () => {
    assert.equal(oceniaKwalifikacje(wyzwanie(), { ocena: ocena([], 'ŻÓŁTA') }).dozwolone, true);
  });
});

describe('pakiety', () => {
  test('wyzwanie spoza pakietu jest niedostępne z podanym powodem', () => {
    const wynik = oceniaKwalifikacje(wyzwanie({ pakiety: ['enterprise'] }), {
      ocena: ocena(),
      pakiet: 'light',
    });

    assert.equal(wynik.dozwolone, false);
    if (!wynik.dozwolone) assert.equal(wynik.kod, 'poza_pakietem');
  });

  test('bez podanego pakietu sprawdzenie jest pomijane', () => {
    const wynik = oceniaKwalifikacje(wyzwanie({ pakiety: ['enterprise'] }), { ocena: ocena() });
    assert.equal(wynik.dozwolone, true);
  });
});

describe('przegląd katalogu', () => {
  test('wyzwania niedostępne są pokazane z powodem, a nie ukryte', () => {
    const katalog = [wyzwanie(), WYZWANIE_SNU];
    const przeglad = przegladKatalogu(katalog, { ocena: ocena([flaga('FLAG_SYNCOPE')]) });

    assert.equal(przeglad.length, 2, 'katalog został przycięty zamiast opisany');
    const kroki = przeglad.find((pozycja) => pozycja.wyzwanie.id === 'w-kroki')!;
    assert.equal(kroki.kwalifikacja.dozwolone, false);
    if (!kroki.kwalifikacja.dozwolone) assert.ok(kroki.kwalifikacja.powod.length > 20);
  });
});

describe('dołączenie', () => {
  test('do dozwolonego wyzwania powstaje zapis', () => {
    const zapis = dolacz(wyzwanie(), { ocena: ocena() }, 'psd-001', '2026-09-01');

    assert.equal(zapis.wyzwanieId, 'w-kroki');
    assert.equal(zapis.od, '2026-09-01');
    assert.equal('zespol' in zapis, false, 'pusty zespół nie powinien trafiać do zapisu');
  });

  test('zapis do zablokowanego wyzwania rzuca wyjątkiem', () => {
    // Sprawdzenie jest w funkcji, nie w przycisku — przycisk da się ominąć.
    assert.throws(
      () => dolacz(wyzwanie(), { ocena: ocena([flaga('FLAG_SYNCOPE')]) }, 'psd-001', '2026-09-01'),
      WyzwanieNiedozwoloneError,
    );
  });

  test('zespół trafia do zapisu, gdy podany', () => {
    const zapis = dolacz(
      WYZWANIE_ZESPOLOWE,
      { ocena: ocena() },
      'psd-001',
      '2026-09-01',
      'Logistyka',
    );
    assert.equal(zapis.zespol, 'Logistyka');
  });
});

describe('jednostki', () => {
  test('każda metryka ma jednostkę', () => {
    const pelne: Record<Metryka, true> = {
      kroki: true,
      sen: true,
      trening: true,
      nawyk: true,
      woda: true,
    };

    for (const metryka of Object.keys(pelne) as Metryka[]) {
      assert.ok(JEDNOSTKI[metryka].length > 0, metryka);
      assert.ok(METRYKI.includes(metryka));
    }
  });
});
