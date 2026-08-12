import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPotwierdzone,
  BrakPotwierdzeniaZapowiedziError,
  czyPusta,
  InMemoryCacheStore,
  roznice,
  synchronize,
  wymagaPotwierdzenia,
  zapowiedz,
  ZRODLA_KRYTYCZNE,
  type SourceCode,
  type SyncMode,
} from '../src/index.ts';
import { cennikPage, DATA_SOURCE_IDS, FakeNotion, fakeClock, number, select } from './fakes.ts';

const PELNA: SyncMode = { kind: 'pelna' };

function setup() {
  const reader = new FakeNotion();
  const store = new InMemoryCacheStore();
  const clock = fakeClock();
  const rateLimit = { minIntervalMs: 350, baseBackoffMs: 100 };

  const podglad = (mode: SyncMode = PELNA, sources: readonly SourceCode[] = ['cennik']) =>
    zapowiedz({ reader, store, dataSourceIds: DATA_SOURCE_IDS, mode, sources, clock, rateLimit });

  const przebieg = (mode: SyncMode = PELNA, sources: readonly SourceCode[] = ['cennik']) =>
    synchronize({ reader, store, dataSourceIds: DATA_SOURCE_IDS, mode, sources, clock, rateLimit });

  return { reader, store, podglad, przebieg };
}

describe('zapowiedź nie dotyka magazynu', () => {
  test('po zapowiedzi cache jest pusty', async () => {
    const { reader, store, podglad } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);

    const [wynik] = await podglad();

    assert.equal(wynik!.zmiany.length, 2);
    assert.equal(store.list('cennik').length, 0, 'zapowiedź zapisała rekordy do cache');
    assert.equal(store.log.length, 0, 'zapowiedź dopisała się do logu');
  });

  test('dwie zapowiedzi z rzędu dają ten sam wynik', async () => {
    // Gdyby zapowiedź cokolwiek zapisywała, druga pokazałaby „bez zmian".
    const { reader, podglad } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);

    const pierwsza = await podglad();
    const druga = await podglad();

    assert.deepEqual(druga, pierwsza);
  });
});

describe('rodzaje zmian', () => {
  test('nowy, zmieniony i bez zmian', async () => {
    const { reader, podglad, przebieg } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);
    await przebieg();

    reader.set(DATA_SOURCE_IDS.cennik, [
      cennikPage('p1'),
      cennikPage('p2', { 'Cena netto': number(1500) }),
      cennikPage('p3'),
    ]);

    const [wynik] = await podglad();

    assert.equal(wynik!.bezZmian, 1);
    assert.deepEqual(
      wynik!.zmiany.map((zmiana) => [zmiana.notionId, zmiana.rodzaj]).sort(),
      [
        ['p2', 'zmieniony'],
        ['p3', 'nowy'],
      ],
    );
  });

  test('zmiana ceny jest pokazana jako wartość przed i po', async () => {
    const { reader, podglad, przebieg } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await przebieg();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', { 'Cena netto': number(9900) })]);
    const [wynik] = await podglad();

    assert.deepEqual(wynik!.zmiany[0]!.roznice, [
      { pole: 'cenaNetto', przed: 1200, po: 9900 },
    ]);
  });

  test('rekord odrzucony niesie powód, nie różnicę', async () => {
    const { reader, podglad } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', { Linia: select('Z') })]);

    const [wynik] = await podglad();
    const zmiana = wynik!.zmiany[0]!;

    assert.equal(zmiana.rodzaj, 'odrzucony');
    assert.equal(zmiana.roznice.length, 0);
    assert.match(zmiana.blad ?? '', /Linia/);
  });

  test('pełna zapowiedź wykrywa zniknięcie rekordu', async () => {
    const { reader, podglad, przebieg } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);
    await przebieg();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    const [wynik] = await podglad();

    assert.equal(wynik!.wykrywaZnikniecia, true);
    assert.deepEqual(wynik!.zmiany, [{ notionId: 'p2', rodzaj: 'zniknal', roznice: [] }]);
  });

  test('przyrostowa zapowiedź nie zgłasza zniknięć', async () => {
    // „Nie przyszło" znaczy w trybie przyrostowym „nie zmieniło się".
    // Pokazanie tego jako zniknięcia namówiłoby administratora na kasowanie.
    const { reader, podglad, przebieg } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);
    await przebieg();

    reader.set(DATA_SOURCE_IDS.cennik, []);
    const [wynik] = await podglad({ kind: 'przyrostowa', since: '2026-07-01T00:00:00.000Z' });

    assert.equal(wynik!.wykrywaZnikniecia, false);
    assert.equal(wynik!.zmiany.length, 0);
    assert.equal(czyPusta([wynik!]), true);
  });

  test('strona w koszu Notion jest zniknięciem, nie zmianą', async () => {
    const { reader, podglad, przebieg } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await przebieg();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', {}, { archived: true })]);
    const [wynik] = await podglad();

    assert.deepEqual(wynik!.zmiany, [{ notionId: 'p1', rodzaj: 'zniknal', roznice: [] }]);
  });
});

describe('źródła krytyczne', () => {
  test('cennik i progi ZFŚS wymagają potwierdzenia', () => {
    assert.deepEqual([...ZRODLA_KRYTYCZNE].sort(), ['cennik', 'progi_zfss']);
    assert.equal(wymagaPotwierdzenia('cennik'), true);
    assert.equal(wymagaPotwierdzenia('progi_zfss'), true);
    assert.equal(wymagaPotwierdzenia('biblioteka'), false);
  });

  test('zapowiedź oznacza źródło krytyczne', async () => {
    const { reader, podglad } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);

    const [wynik] = await podglad();
    assert.equal(wynik!.wymagaPotwierdzenia, true);
  });

  test('brak potwierdzenia blokuje przebieg na źródle krytycznym', () => {
    assert.throws(
      () => assertPotwierdzone(['cennik', 'biblioteka'], ['biblioteka']),
      BrakPotwierdzeniaZapowiedziError,
    );
  });

  test('potwierdzenie jednego źródła nie przepuszcza drugiego', () => {
    assert.throws(() => assertPotwierdzone(['cennik', 'progi_zfss'], ['cennik']), {
      name: 'BrakPotwierdzeniaZapowiedziError',
      source: 'progi_zfss',
    });
  });

  test('źródła treści przechodzą bez potwierdzenia', () => {
    assert.doesNotThrow(() => assertPotwierdzone(['biblioteka', 'filary', 'wyzwania'], []));
  });
});

describe('różnice', () => {
  test('pole usunięte jest różnicą', () => {
    assert.deepEqual(roznice({ a: 1, b: 2 }, { a: 1 }), [{ pole: 'b', przed: 2, po: undefined }]);
  });

  test('wartości równe co do treści nie są różnicą', () => {
    assert.deepEqual(roznice({ tagi: ['a', 'b'] }, { tagi: ['a', 'b'] }), []);
  });

  test('kolejność w tablicy ma znaczenie', () => {
    // Kolejność pakietów w Notion bywa znacząca (pierwszy = domyślny),
    // więc zmiana kolejności musi być widoczna, a nie wyciszona.
    assert.equal(roznice({ tagi: ['a', 'b'] }, { tagi: ['b', 'a'] }).length, 1);
  });
});
