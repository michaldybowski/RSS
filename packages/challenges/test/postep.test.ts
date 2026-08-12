import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  podsumuj,
  postep,
  pozycjaWlasna,
  PROG_UKONCZENIA_PROCENT,
  przyznaneOdznaki,
  rankingZespolow,
  type Pomiar,
} from '../src/index.ts';
import { dni, ocena, pomiar, wyzwanie, WYZWANIE_SNU, WYZWANIE_ZESPOLOWE, zapis } from './fixtures.ts';

const KROKI = wyzwanie({ czasTrwaniaDni: 10 });

/** Seria dni z celem, potem reszta poniżej celu. */
function seria(zCelem: number, bez = 0, od = '2026-09-01'): Pomiar[] {
  return dni(od, zCelem + bez).map((dzien, i) => pomiar(dzien, i < zCelem ? 12_000 : 3_000));
}

describe('postęp', () => {
  test('liczy dni z celem i procent całego wyzwania', () => {
    const wynik = postep(KROKI, zapis(), seria(4), '2026-09-04');

    assert.equal(wynik.dniZaliczone, 4);
    assert.equal(wynik.dniWyzwania, 10);
    assert.equal(wynik.procent, 40);
    assert.equal(wynik.zakonczone, false);
  });

  test('ukończenie nie wymaga kompletu dni', () => {
    // Warunek „każdego dnia bez wyjątku" premiuje ludzi, którym nic nie wypadło,
    // a nie ludzi, którzy zmienili nawyk.
    assert.equal(PROG_UKONCZENIA_PROCENT, 80);

    const wynik = postep(KROKI, zapis(), seria(8, 2), '2026-09-10');
    assert.equal(wynik.ukonczone, true);
    assert.equal(wynik.brakujeDoUkonczenia, 0);
  });

  test('poniżej progu wyzwanie nie jest ukończone i widać ile brakuje', () => {
    const wynik = postep(KROKI, zapis(), seria(6, 2), '2026-09-08');

    assert.equal(wynik.ukonczone, false);
    assert.equal(wynik.brakujeDoUkonczenia, 2);
  });

  test('premia za ukończenie doliczana jest raz', () => {
    const bez = postep(KROKI, zapis(), seria(6, 2), '2026-09-08');
    const z = postep(KROKI, zapis(), seria(8, 2), '2026-09-10');

    assert.equal(bez.punkty, 60);
    assert.equal(z.punkty, 80 + 10 * 5);
  });

  test('dni które minęły nie przekraczają czasu trwania', () => {
    const wynik = postep(KROKI, zapis(), seria(10), '2026-10-15');

    assert.equal(wynik.dniMinelo, 10);
    assert.equal(wynik.zakonczone, true);
  });
});

describe('podsumowanie uczestnika', () => {
  const wyzwania = [KROKI, WYZWANIE_SNU];
  const zapisy = [zapis(), zapis({ wyzwanieId: 'w-sen' })];

  test('sumuje punkty i ukończenia z wielu wyzwań', () => {
    // Wyzwanie snu trwa 21 dni, więc próg ukończenia to 17 dni z celem.
    const pomiary = [
      ...seria(8, 2),
      ...dni('2026-09-01', 21).map((dzien) => pomiar(dzien, 480, 'w-sen')),
    ];
    const wynik = podsumuj(wyzwania, zapisy, pomiary, '2026-09-21');

    assert.equal(wynik.ukonczone, 2);
    assert.equal(wynik.postepy.length, 2);
    assert.ok(wynik.punkty > 0);
  });

  test('limit dobowy obowiązuje wspólnie dla wszystkich wyzwań', () => {
    // Osiem wyzwań po 20 punktów dziennie to nadal 100 punktów, nie 160.
    const osiem = Array.from({ length: 8 }, (_, i) => wyzwanie({ id: `w-${i}`, punkty: 20 }));
    const zapisyOsiem = osiem.map((w) => zapis({ wyzwanieId: w.id }));
    const pomiary = osiem.map((w) => pomiar('2026-09-01', 12_000, w.id));

    const wynik = podsumuj(osiem, zapisyOsiem, pomiary, '2026-09-01');
    assert.equal(wynik.punkty, 100);
  });

  test('zapis do nieznanego wyzwania jest pomijany, nie wywraca podsumowania', () => {
    const wynik = podsumuj(wyzwania, [zapis({ wyzwanieId: 'w-nieistniejace' })], [], '2026-09-10');
    assert.deepEqual(wynik.postepy, []);
  });

  test('pomiar spoza zapisów nie zwiększa punktów', () => {
    const wynik = podsumuj(
      wyzwania,
      [zapis()],
      [pomiar('2026-09-01', 480, 'w-sen')],
      '2026-09-10',
    );
    assert.equal(wynik.punkty, 0);
  });
});

describe('odznaki', () => {
  const wyzwania = [KROKI, WYZWANIE_ZESPOLOWE];

  test('pierwszy dzień z celem daje pierwszą odznakę', () => {
    const podsumowanie = podsumuj([KROKI], [zapis()], seria(1), '2026-09-01');
    const kody = przyznaneOdznaki(podsumowanie, wyzwania).map((odznaka) => odznaka.kod);

    assert.deepEqual(kody, ['pierwszy_dzien']);
  });

  test('tydzień passy i ukończenie', () => {
    const podsumowanie = podsumuj([KROKI], [zapis()], seria(8, 2), '2026-09-10');
    const kody = przyznaneOdznaki(podsumowanie, wyzwania).map((odznaka) => odznaka.kod);

    assert.ok(kody.includes('tydzien_passy'));
    assert.ok(kody.includes('wyzwanie_ukonczone'));
    assert.equal(kody.includes('piec_wyzwan'), false);
  });

  test('odznaki nie znikają po przerwaniu passy', () => {
    // Osiem dni z celem, potem dwa bez — passa bieżąca jest zerowa,
    // ale tydzień z rzędu naprawdę się wydarzył i odznaka zostaje.
    const podsumowanie = podsumuj([KROKI], [zapis()], seria(8, 2), '2026-09-10');

    assert.equal(podsumowanie.postepy[0]!.passa, 0, 'passa bieżąca powinna być przerwana');
    assert.equal(podsumowanie.najdluzszaPassa, 8);
    assert.ok(
      przyznaneOdznaki(podsumowanie, wyzwania)
        .map((odznaka) => odznaka.kod)
        .includes('tydzien_passy'),
    );
  });

  test('odznaka drużyny tylko za wyzwanie zespołowe', () => {
    const zapisZespolowy = zapis({ wyzwanieId: 'w-zespol', zespol: 'Logistyka' });
    const pomiary = dni('2026-09-01', 14).map((dzien) => pomiar(dzien, 45, 'w-zespol'));
    const podsumowanie = podsumuj([WYZWANIE_ZESPOLOWE], [zapisZespolowy], pomiary, '2026-09-14');

    const kody = przyznaneOdznaki(podsumowanie, wyzwania).map((odznaka) => odznaka.kod);
    assert.ok(kody.includes('zespolowe'));

    const indywidualne = podsumuj([KROKI], [zapis()], seria(8, 2), '2026-09-10');
    assert.equal(
      przyznaneOdznaki(indywidualne, wyzwania)
        .map((odznaka) => odznaka.kod)
        .includes('zespolowe'),
      false,
    );
  });

  test('bez aktywności nie ma odznak', () => {
    assert.deepEqual(przyznaneOdznaki(podsumuj([KROKI], [zapis()], [], '2026-09-10'), wyzwania), []);
  });
});

describe('ranking', () => {
  const osoby = (zespol: string, ile: number, punkty: number) =>
    Array.from({ length: ile }, (_, i) => ({ subjectRef: `${zespol}-${i}`, zespol, punkty }));

  test('zespół poniżej progu k nie trafia do rankingu', () => {
    const wynik = rankingZespolow([...osoby('Duzy', 12, 100), ...osoby('Maly', 4, 900)]);

    assert.deepEqual(
      wynik.wyniki.map((pozycja) => pozycja.zespol),
      ['Duzy'],
    );
    assert.equal(wynik.pominietych, 1);
    assert.equal(wynik.prog, 10);
  });

  test('pominięte zespoły nie są nazwane', () => {
    // Sama nazwa zespołu poniżej progu zawęża grupę tak samo jak wynik.
    const wynik = rankingZespolow(osoby('Maly', 3, 500));
    assert.equal(JSON.stringify(wynik).includes('Maly'), false);
  });

  test('ranking nie zawiera pozycji pojedynczych osób', () => {
    const wynik = rankingZespolow(osoby('Duzy', 12, 100));

    for (const pozycja of wynik.wyniki) {
      assert.deepEqual(Object.keys(pozycja).sort(), ['osob', 'sredniaPunktow', 'zespol']);
    }
    assert.equal(JSON.stringify(wynik).includes('Duzy-0'), false);
  });

  test('mierzy średnią, nie sumę — inaczej wygrywałby największy zespół', () => {
    const wynik = rankingZespolow([...osoby('Duzy', 30, 100), ...osoby('Sredni', 10, 300)]);

    assert.equal(wynik.wyniki[0]!.zespol, 'Sredni');
  });

  test('własna pozycja to liczby, nie lista', () => {
    const punkty = [
      { subjectRef: 'psd-001', punkty: 120 },
      { subjectRef: 'psd-002', punkty: 300 },
      { subjectRef: 'psd-003', punkty: 90 },
    ];
    const wynik = pozycjaWlasna('psd-001', punkty);

    assert.deepEqual(wynik, { pozycja: 2, uczestnikow: 3 });
  });

  test('osoba spoza stawki nie dostaje pozycji', () => {
    assert.equal(pozycjaWlasna('psd-999', [{ subjectRef: 'psd-001', punkty: 10 }]), undefined);
  });

  test('remis daje tę samą pozycję', () => {
    const punkty = [
      { subjectRef: 'a', punkty: 100 },
      { subjectRef: 'b', punkty: 100 },
      { subjectRef: 'c', punkty: 50 },
    ];

    assert.equal(pozycjaWlasna('a', punkty)?.pozycja, 1);
    assert.equal(pozycjaWlasna('b', punkty)?.pozycja, 1);
    assert.equal(pozycjaWlasna('c', punkty)?.pozycja, 3);
  });
});

describe('kwalifikacja a postęp', () => {
  test('ocena nie wpływa na liczenie postępu już rozpoczętego wyzwania', () => {
    // Kwalifikacja jest bramką przy zapisie; wynik już zebranych dni
    // nie znika, gdy ocena się zmieni.
    void ocena;
    const wynik = postep(KROKI, zapis(), seria(4), '2026-09-04');
    assert.equal(wynik.dniZaliczone, 4);
  });
});
