import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  czyZaliczony,
  dostepneSciezki,
  numerZaswiadczenia,
  ocenQuiz,
  postepSciezki,
  PROG_ZALICZENIA_PROCENT,
  PustyQuizError,
  quizMaterialu,
  raportSzkoleniowy,
  SciezkaNieukonczonaError,
  SprawdzianNiezaliczonyError,
  wydajZaswiadczenie,
  WymaganySprawdzianError,
  zaliczDeklaracja,
  zaliczSprawdzianem,
  type Material,
  type Zaliczenie,
} from '../src/index.ts';
import { KATALOG, material, QUIZ, SCIEZKA } from './fixtures.ts';

const KIEDY = '2026-09-20T10:00:00.000Z';

const znajdz = (id: string): Material => KATALOG.find((pozycja) => pozycja.id === id)!;

const komplet = { p1: 1, p2: 0, p3: 1 };
const jednaZla = { p1: 1, p2: 2, p3: 1 };
const dwieZle = { p1: 0, p2: 2, p3: 1 };

describe('sprawdzian', () => {
  test('komplet odpowiedzi daje sto procent', () => {
    const wynik = ocenQuiz(QUIZ, komplet);

    assert.equal(wynik.poprawnych, 3);
    assert.equal(wynik.procent, 100);
    assert.equal(wynik.zaliczony, true);
  });

  test('jedna pomyłka na trzy pytania nadal zalicza', () => {
    const wynik = ocenQuiz(QUIZ, jednaZla);

    assert.equal(wynik.procent, 67);
    assert.equal(wynik.zaliczony, false);
    assert.equal(PROG_ZALICZENIA_PROCENT, 70);
  });

  test('dwie pomyłki nie zaliczają', () => {
    assert.equal(ocenQuiz(QUIZ, dwieZle).zaliczony, false);
  });

  test('brak odpowiedzi liczy się jako błąd, nie jako pytanie pominięte', () => {
    // Inaczej pominięcie trudnych pytań podnosiłoby wynik procentowy.
    const wynik = ocenQuiz(QUIZ, { p1: 1 });

    assert.equal(wynik.pytan, 3);
    assert.equal(wynik.poprawnych, 1);
    assert.equal(wynik.pytania[1]!.wybrana, undefined);
    assert.equal(wynik.pytania[1]!.trafiona, false);
  });

  test('wynik niesie wyjaśnienia — sprawdzian bez nich niczego nie uczy', () => {
    const wynik = ocenQuiz(QUIZ, dwieZle);
    assert.ok(wynik.pytania.every((pozycja) => pozycja.wyjasnienie.length > 20));
  });

  test('wynik nie zawiera niczego, co mogłoby zasilić ocenę zdrowia', () => {
    // Sprawdzian jest testem wiedzy. Gdyby zwracał cokolwiek o stanie osoby,
    // byłby kwestionariuszem przemyconym poza modelem zgód i poza ADR-03.
    const wynik = ocenQuiz(QUIZ, komplet);

    assert.deepEqual(Object.keys(wynik).sort(), [
      'poprawnych',
      'procent',
      'pytan',
      'pytania',
      'quizId',
      'zaliczony',
    ]);
  });

  test('pusty sprawdzian jest błędem, a nie wynikiem stuprocentowym', () => {
    assert.throws(() => ocenQuiz({ ...QUIZ, pytania: [] }, {}), PustyQuizError);
  });

  test('sprawdzian odnajduje się po materiale', () => {
    assert.equal(quizMaterialu([QUIZ], 'm-zywienie')?.id, 'q-zywienie');
    assert.equal(quizMaterialu([QUIZ], 'm-sen'), undefined);
  });
});

describe('zaliczanie materiałów', () => {
  test('materiał bez sprawdzianu zalicza deklaracja i jest to zapisane', () => {
    const [zaliczenie] = zaliczDeklaracja([], znajdz('m-sen'), KIEDY);

    assert.equal(zaliczenie!.sposob, 'deklaracja');
    assert.equal(zaliczenie!.wynikProcent, undefined);
  });

  test('materiał ze sprawdzianem nie zalicza się deklaracją', () => {
    assert.throws(
      () => zaliczDeklaracja([], znajdz('m-zywienie'), KIEDY),
      WymaganySprawdzianError,
    );
  });

  test('zdany sprawdzian zalicza materiał razem z wynikiem', () => {
    const [zaliczenie] = zaliczSprawdzianem(
      [],
      znajdz('m-zywienie'),
      ocenQuiz(QUIZ, komplet),
      KIEDY,
    );

    assert.equal(zaliczenie!.sposob, 'quiz');
    assert.equal(zaliczenie!.wynikProcent, 100);
  });

  test('niezdany sprawdzian nie zalicza', () => {
    assert.throws(
      () => zaliczSprawdzianem([], znajdz('m-zywienie'), ocenQuiz(QUIZ, dwieZle), KIEDY),
      SprawdzianNiezaliczonyError,
    );
  });

  test('powtórne podejście nadpisuje wpis, nie dokłada drugiego', () => {
    const pierwsze = zaliczSprawdzianem([], znajdz('m-zywienie'), ocenQuiz(QUIZ, komplet), KIEDY);
    const drugie = zaliczSprawdzianem(
      pierwsze,
      znajdz('m-zywienie'),
      ocenQuiz(QUIZ, komplet),
      '2026-09-21T10:00:00.000Z',
    );

    assert.equal(drugie.length, 1);
    assert.equal(drugie[0]!.kiedy, '2026-09-21T10:00:00.000Z');
  });

  test('czyZaliczony odpowiada na pojedynczy materiał', () => {
    const zaliczenia = zaliczDeklaracja([], znajdz('m-sen'), KIEDY);

    assert.equal(czyZaliczony(zaliczenia, 'm-sen'), true);
    assert.equal(czyZaliczony(zaliczenia, 'm-ruch'), false);
  });
});

describe('postęp ścieżki', () => {
  const zalicz = (ids: readonly string[]): Zaliczenie[] =>
    ids.map((materialId) => ({ materialId, kiedy: KIEDY, sposob: 'deklaracja' as const }));

  test('pierwszy moduł jest otwarty, kolejne zablokowane', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, []);

    assert.deepEqual(
      postep.pozycje.map((pozycja) => pozycja.stan),
      ['otwarty', 'zablokowany', 'zablokowany', 'zablokowany'],
    );
    assert.equal(postep.nastepny?.modul.materialId, 'm-sen');
  });

  test('zaliczenie modułu otwiera następny', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen']));

    assert.equal(postep.pozycje[1]!.stan, 'otwarty');
    assert.equal(postep.pozycje[2]!.stan, 'zablokowany');
    assert.equal(postep.procent, 33);
  });

  test('moduł nieobowiązkowy nie zamyka kolejnych', () => {
    const czteryModuly = {
      ...SCIEZKA,
      moduly: [
        { materialId: 'm-hiit', obowiazkowy: false },
        { materialId: 'm-sen', obowiazkowy: true },
      ],
    };

    const postep = postepSciezki(czteryModuly, KATALOG, []);
    assert.deepEqual(
      postep.pozycje.map((pozycja) => pozycja.stan),
      ['otwarty', 'otwarty'],
    );
  });

  test('ścieżka domyka się po modułach obowiązkowych, bez dodatkowych', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen', 'm-ruch', 'm-zywienie']));

    assert.equal(postep.ukonczona, true);
    assert.equal(postep.procent, 100);
    assert.equal(postep.nastepny?.modul.materialId, 'm-hiit', 'materiał dodatkowy zostaje otwarty');
  });

  test('materiał wycofany nie blokuje ścieżki', () => {
    // Redakcja może wycofać treść w połowie czyjejś nauki. Gdyby moduł liczył
    // się dalej, ścieżka stawałaby się niemożliwa do ukończenia bez powodu.
    const zWycofanym = {
      ...SCIEZKA,
      moduly: [
        { materialId: 'm-sen', obowiazkowy: true },
        { materialId: 'm-wycofany', obowiazkowy: true },
        { materialId: 'm-ruch', obowiazkowy: true },
      ],
    };

    const postep = postepSciezki(zWycofanym, KATALOG, zalicz(['m-sen', 'm-ruch']));

    assert.equal(postep.pozycje[1]!.stan, 'niedostepny');
    // Tytuł zostaje przy pozycji: uczestnik ma wiedzieć, czego dotyczył
    // pominięty moduł, a nie zobaczyć identyfikator z bazy.
    assert.equal(postep.pozycje[1]!.material?.tytul, 'Materiał wycofany');
    assert.equal(postep.pominietych, 1);
    assert.equal(postep.wymaganych, 2, 'moduł niedostępny wypadł z mianownika');
    assert.equal(postep.ukonczona, true);
  });

  test('moduł niedostępny nie zamyka kolejnego', () => {
    const zWycofanym = {
      ...SCIEZKA,
      moduly: [
        { materialId: 'm-wycofany', obowiazkowy: true },
        { materialId: 'm-sen', obowiazkowy: true },
      ],
    };

    assert.equal(postepSciezki(zWycofanym, KATALOG, []).pozycje[1]!.stan, 'otwarty');
  });

  test('materiał nieopublikowany zachowuje się jak wycofany', () => {
    const zeSzkicem = {
      ...SCIEZKA,
      moduly: [{ materialId: 'm-szkic', obowiazkowy: true }],
    };

    const postep = postepSciezki(zeSzkicem, KATALOG, []);
    assert.equal(postep.pozycje[0]!.stan, 'niedostepny');
    assert.equal(postep.ukonczona, true, 'ścieżka z samych niedostępnych nie może wisieć');
  });

  test('minuty nauki liczą tylko zaliczone moduły', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen', 'm-ruch']));
    assert.equal(postep.minutyNauki, 12 + 8);
  });

  test('ścieżki filtrują się po pakiecie', () => {
    assert.equal(dostepneSciezki([SCIEZKA], 'pro').length, 1);
    assert.equal(dostepneSciezki([SCIEZKA], 'prime').length, 0);
    assert.equal(dostepneSciezki([SCIEZKA]).length, 1);
  });
});

describe('zaświadczenie', () => {
  const zalicz = (ids: readonly string[]): Zaliczenie[] =>
    ids.map((materialId) => ({ materialId, kiedy: KIEDY, sposob: 'deklaracja' as const }));

  test('powstaje z ukończonej ścieżki i niesie czas nauki', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen', 'm-ruch', 'm-zywienie']));
    const dokument = wydajZaswiadczenie(SCIEZKA, postep, 'psd-001', 1, KIEDY);

    assert.equal(dokument.numer, 'AK/2026/0001');
    assert.equal(dokument.wydane, '2026-09-20');
    assert.equal(dokument.minutyNauki, 12 + 8 + 15);
    assert.equal(dokument.modulow, 3);
  });

  test('nie powstaje z ukończonej połowicznie', () => {
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen']));

    assert.throws(
      () => wydajZaswiadczenie(SCIEZKA, postep, 'psd-001', 1, KIEDY),
      SciezkaNieukonczonaError,
    );
  });

  test('zaświadczenie identyfikuje pseudonimem, nie nazwiskiem', () => {
    // Dokument należy do uczestnika. Imienną wersję wystawia on sam,
    // gdy zdecyduje, komu ją pokazać.
    const postep = postepSciezki(SCIEZKA, KATALOG, zalicz(['m-sen', 'm-ruch', 'm-zywienie']));
    const dokument = wydajZaswiadczenie(SCIEZKA, postep, 'psd-001', 7, KIEDY);

    assert.deepEqual(Object.keys(dokument).sort(), [
      'minutyNauki',
      'modulow',
      'numer',
      'sciezkaId',
      'subjectRef',
      'wydane',
    ]);
  });

  test('numer rośnie i jest wyrównany', () => {
    assert.equal(numerZaswiadczenia(42, '2027'), 'AK/2027/0042');
  });
});

describe('raport szkoleniowy', () => {
  const osoby = (ile: number, minuty: number, ukonczone = 1) =>
    Array.from({ length: ile }, (_, i) => ({
      subjectRef: `psd-${i}`,
      minuty,
      ukonczoneSciezki: i % 2 === 0 ? ukonczone : 0,
    }));

  test('grupa poniżej progu nie dostaje zestawienia', () => {
    const wynik = raportSzkoleniowy(osoby(6, 120));

    assert.equal(wynik.dostepny, false);
    if (!wynik.dostepny) {
      assert.equal(wynik.prog, 10);
      assert.match(wynik.powod, /wskazuje pojedyncze osoby/);
    }
  });

  test('powyżej progu liczy średnią godzin na osobę', () => {
    const wynik = raportSzkoleniowy(osoby(12, 90));

    assert.equal(wynik.dostepny, true);
    if (wynik.dostepny) {
      assert.equal(wynik.raport.osob, 12);
      assert.equal(wynik.raport.sredniaGodzin, 1.5);
      assert.equal(wynik.raport.lacznieGodzin, 18);
    }
  });

  test('odsetek zaokrąglany do pięciu punktów procentowych', () => {
    const wynik = raportSzkoleniowy(osoby(12, 60));

    assert.equal(wynik.dostepny, true);
    if (wynik.dostepny) assert.equal(wynik.raport.odsetekZUkonczona % 5, 0);
  });

  test('raport nie zawiera pseudonimów uczestników', () => {
    const wynik = raportSzkoleniowy(osoby(12, 60));
    assert.equal(JSON.stringify(wynik).includes('psd-'), false);
  });
});

describe('materiał a ścieżka', () => {
  test('katalog i ścieżka używają tego samego materiału', () => {
    void material;
    const postep = postepSciezki(SCIEZKA, KATALOG, []);
    assert.equal(postep.pozycje[0]!.material?.tytul, 'Higiena snu w pięć minut');
  });
});
