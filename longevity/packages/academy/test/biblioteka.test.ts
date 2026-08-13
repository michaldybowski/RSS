import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  filary,
  FILARY_SKLADOWEJ,
  katalog,
  materialPoId,
  minutyKatalogu,
  ostrzezenia,
  proponowane,
} from '../src/index.ts';
import { flaga, KATALOG, material, ocena } from './fixtures.ts';

describe('katalog', () => {
  test('nieopublikowane i wycofane nie trafiają do katalogu', () => {
    const widoczne = katalog(KATALOG).map((pozycja) => pozycja.id);

    assert.equal(widoczne.includes('m-szkic'), false);
    assert.equal(widoczne.includes('m-wycofany'), false);
  });

  test('filtr pakietu odcina treści spoza planu uczestnika', () => {
    const widoczne = katalog(KATALOG, { pakiet: 'pro' }).map((pozycja) => pozycja.id);
    assert.equal(widoczne.includes('m-prime'), false);
    assert.ok(widoczne.includes('m-sen'));
  });

  test('filtr po filarze i typie', () => {
    assert.deepEqual(
      katalog(KATALOG, { filar: 'Ruch' }).map((pozycja) => pozycja.id),
      ['m-ruch', 'm-hiit'],
    );
    assert.deepEqual(
      katalog(KATALOG, { typ: 'webinar' }).map((pozycja) => pozycja.id),
      ['m-hiit'],
    );
  });

  test('wyszukiwanie po frazie ignoruje wielkość liter i szuka też w opisie', () => {
    assert.deepEqual(
      katalog(KATALOG, { fraza: 'ROZGRZEWKA' }).map((pozycja) => pozycja.id),
      ['m-ruch'],
    );
    assert.deepEqual(
      katalog(KATALOG, { fraza: 'makroskładników' }).map((pozycja) => pozycja.id),
      ['m-zywienie'],
    );
  });

  test('pusta fraza nie zawęża katalogu', () => {
    assert.equal(katalog(KATALOG, { fraza: '   ' }).length, katalog(KATALOG).length);
  });

  test('filary pochodzą wyłącznie z materiałów widocznych', () => {
    // „Stres" jest tylko przy materiale wycofanym — filtr po nim dawałby
    // pustą listę i wyglądał jak awaria wyszukiwarki.
    assert.deepEqual(filary(KATALOG), ['Regeneracja', 'Ruch', 'Sen', 'Żywienie']);
  });

  test('czas katalogu liczy tylko widoczne materiały', () => {
    assert.equal(minutyKatalogu(KATALOG), 12 + 8 + 40 + 15 + 30);
  });

  test('materiał odnajduje się po identyfikatorze, także wycofany', () => {
    // Wycofany znika z katalogu, ale musi dać się odczytać — inaczej ścieżka
    // z takim modułem nie umiałaby powiedzieć, czego brakuje.
    assert.equal(materialPoId(KATALOG, 'm-wycofany')?.tytul, 'Materiał wycofany');
  });
});

describe('ostrzeżenia', () => {
  test('materiał o wysokiej intensywności ostrzega przy fladze wysiłkowej', () => {
    const wynik = ostrzezenia(
      material({ intensywnosc: 'wysoka' }),
      ocena([flaga('FLAG_CHEST_PAIN')]),
    );

    assert.equal(wynik.length, 1);
    assert.equal(wynik[0]!.kod, 'wysilek_przeciwwskazany');
    assert.match(wynik[0]!.tresc, /konsultacji z lekarzem/);
  });

  test('ostrzeżenie nie jest blokadą — materiał zostaje w katalogu', () => {
    // Wyzwanie się wykonuje, więc je blokujemy. Artykuł się czyta, więc go
    // oznaczamy: odcięcie od wiedzy o własnym stanie byłoby odwrotnością celu.
    const widoczne = katalog(KATALOG).map((pozycja) => pozycja.id);
    assert.ok(widoczne.includes('m-hiit'));
  });

  test('kategoria CZERWONA daje ostrzeżenie także bez flagi wysiłkowej', () => {
    const wynik = ostrzezenia(material({ intensywnosc: 'wysoka' }), ocena([], 'CZERWONA'));

    assert.equal(wynik.length, 1);
    assert.equal(wynik[0]!.kod, 'kategoria_ryzyka');
  });

  test('flaga wysiłkowa ma pierwszeństwo przed komunikatem o kategorii', () => {
    const wynik = ostrzezenia(
      material({ intensywnosc: 'wysoka' }),
      ocena([flaga('FLAG_SYNCOPE')], 'CZERWONA'),
    );

    assert.equal(wynik.length, 1, 'dwa ostrzeżenia o tym samym byłyby szumem');
    assert.equal(wynik[0]!.kod, 'wysilek_przeciwwskazany');
  });

  test('materiał o niskiej intensywności nie ostrzega nigdy', () => {
    assert.deepEqual(ostrzezenia(material(), ocena([flaga('FLAG_CHEST_PAIN')], 'CZERWONA')), []);
  });
});

describe('propozycje', () => {
  test('trafiają w filary odpowiadające najsłabszym składowym', () => {
    const wynik = proponowane(KATALOG, ocena([], 'ZIELONA', { odżywianie: 30, sen: 35 }), {
      pakiet: 'pro',
    });

    assert.deepEqual(
      [...wynik.map((pozycja) => pozycja.id)].sort(),
      ['m-sen', 'm-zywienie'],
    );
  });

  test('każda składowa Health Score ma przypisany filar', () => {
    // Brak wpisu oznaczałby, że dla kogoś z najsłabszym wynikiem w tej
    // składowej biblioteka milcząco nie ma propozycji.
    for (const [skladowa, filaryS] of Object.entries(FILARY_SKLADOWEJ)) {
      assert.ok(filaryS.length > 0, skladowa);
    }
  });

  test('gdy nic nie pasuje, propozycje nie są puste', () => {
    const wynik = proponowane(KATALOG, ocena(), { pakiet: 'prime', ile: 2 });
    assert.ok(wynik.length > 0);
  });

  test('propozycje respektują filtr pakietu', () => {
    const wynik = proponowane(KATALOG, ocena(), { pakiet: 'pro', ile: 10 });
    assert.equal(
      wynik.some((pozycja) => pozycja.id === 'm-prime'),
      false,
    );
  });

  test('mapowanie można nadpisać, gdy redakcja zmieni nazwy filarów', () => {
    // Dwie najsłabsze składowe to `sen` i `profilaktyka`; ta druga nie ma
    // materiałów, więc o wyniku decyduje wyłącznie nadpisany wpis dla snu.
    const slaby = ocena([], 'ZIELONA', { sen: 10, profilaktyka: 20 });

    assert.deepEqual(
      proponowane(KATALOG, slaby, { ile: 5 }).map((pozycja) => pozycja.id),
      ['m-sen'],
    );

    assert.deepEqual(
      proponowane(KATALOG, slaby, {
        mapowanie: { ...FILARY_SKLADOWEJ, sen: ['Ruch'] },
        ile: 5,
      }).map((pozycja) => pozycja.id),
      ['m-ruch', 'm-hiit'],
    );
  });
});
