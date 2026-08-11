import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  InMemoryCacheStore,
  rejectedRecords,
  synchronize,
  TransientNotionError,
  type SourceCode,
  type SyncMode,
} from '../src/index.ts';
import {
  bibliotekaPage,
  cennikPage,
  DATA_SOURCE_IDS,
  FakeNotion,
  fakeClock,
  number,
  select,
  text,
} from './fakes.ts';

const PELNA: SyncMode = { kind: 'pelna' };

function setup() {
  const reader = new FakeNotion();
  const store = new InMemoryCacheStore();
  const clock = fakeClock();

  const run = (mode: SyncMode = PELNA, sources: readonly SourceCode[] = ['cennik']) =>
    synchronize({
      reader,
      store,
      dataSourceIds: DATA_SOURCE_IDS,
      mode,
      sources,
      clock,
      rateLimit: { minIntervalMs: 350, baseBackoffMs: 100 },
    });

  return { reader, store, clock, run };
}

describe('import podstawowy', () => {
  test('nowe rekordy trafiają do cache', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);

    const report = await run();
    const source = report.sources[0]!;

    assert.equal(source.fetched, 2);
    assert.equal(source.created, 2);
    assert.equal(source.rejected, 0);
    assert.equal(store.active('cennik').length, 2);
  });

  test('dane są sparsowane, nie przepisane surowo', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await run();

    const record = store.active('cennik')[0]!;
    assert.equal(record.data.pakiet, 'pro');
    assert.equal(record.data.cenaNetto, 1200);
    assert.equal(record.data.stawkaVat, 'zw');
    assert.equal(record.data.linia, 'A');
  });

  test('powtórny import bez zmian nic nie zapisuje', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);

    await run();
    const drugi = (await run()).sources[0]!;

    assert.equal(drugi.unchanged, 2);
    assert.equal(drugi.created, 0);
    assert.equal(drugi.updated, 0);
  });

  test('zmiana samej daty edycji nie generuje zapisu', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await run();

    // Ktoś otworzył stronę w Notion i nic nie zmienił.
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', {}, { lastEditedTime: '2026-07-25T10:00:00.000Z' })]);
    const drugi = (await run()).sources[0]!;

    assert.equal(drugi.unchanged, 1);
    assert.equal(drugi.updated, 0);
  });

  test('realna zmiana treści aktualizuje rekord', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await run();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', { 'Cena netto': number(1400) })]);
    const drugi = (await run()).sources[0]!;

    assert.equal(drugi.updated, 1);
    assert.equal(store.active('cennik')[0]!.data.cenaNetto, 1400);
  });
});

describe('walidacja przy imporcie', () => {
  test('rekord z brakiem wymaganego pola jest odrzucany, nie importowany częściowo', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('ok'), cennikPage('zly', { 'Cena netto': number(null) })]);

    const report = await run();
    const source = report.sources[0]!;

    assert.equal(source.created, 1);
    assert.equal(source.rejected, 1);
    assert.equal(store.active('cennik').length, 1);
  });

  test('wartość spoza listy jest odrzucana', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('zly', { Linia: select('X') })]);

    const report = await run();
    assert.equal(report.sources[0]!.rejected, 1);
    assert.match(rejectedRecords(report)[0]!.error!, /spoza listy/u);
  });

  test('zły typ właściwości jest zgłaszany, nie ignorowany', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('zly', { 'Cena netto': text('1200') })]);

    const report = await run();
    assert.match(rejectedRecords(report)[0]!.error!, /ma typ text, oczekiwano number/u);
  });

  test('błędny rekord trafia do logu z identyfikatorem strony', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('zly', { Pakiet: select(null) })]);

    await run();
    const wpis = store.log.find((entry) => entry.status === 'blad');

    assert.ok(wpis);
    assert.equal(wpis.notionId, 'zly');
    assert.equal(wpis.action, 'odrzucony');
  });

  test('adres bez protokołu jest odrzucany', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.biblioteka, [
      bibliotekaPage('b1', { 'Link do mediów': { type: 'url', value: 'media.example.org' } }),
    ]);

    const report = await run(PELNA, ['biblioteka']);
    assert.equal(report.sources[0]!.rejected, 1);
  });
});

describe('archiwizacja zamiast kasowania', () => {
  test('strona w koszu Notion oznacza rekord jako zarchiwizowany', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    await run();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1', {}, { archived: true })]);
    await run();

    assert.equal(store.active('cennik').length, 0);
    assert.equal(store.list('cennik').length, 1);
    assert.equal(store.list('cennik')[0]!.status, 'archived');
  });

  test('rekord zniknięty z Notion jest archiwizowany po pełnym imporcie', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);
    await run();

    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    const report = await run();

    assert.equal(report.sources[0]!.archived, 1);
    assert.equal(store.active('cennik').length, 1);
    assert.equal(store.list('cennik').length, 2);
  });

  test('import przyrostowy NIE archiwizuje rekordów nieobecnych w wyniku', async () => {
    // To jest jedyne miejsce, w którym synchronizator mógłby wyczyścić
    // pół biblioteki: przy imporcie przyrostowym „nie było w wyniku" znaczy
    // „nie zmieniło się", a nie „zniknęło".
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1'), cennikPage('p2')]);
    await run();

    const report = await run({ kind: 'przyrostowa', since: '2026-07-24T00:00:00.000Z' });

    assert.equal(report.sources[0]!.fetched, 0);
    assert.equal(report.sources[0]!.archived, 0);
    assert.equal(store.active('cennik').length, 2);
  });
});

describe('tryb przyrostowy', () => {
  test('pobiera tylko strony zmienione po znaczniku', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [
      cennikPage('stary', {}, { lastEditedTime: '2026-07-01T10:00:00.000Z' }),
      cennikPage('nowy', { Wariant: text('miesięczny') }, { lastEditedTime: '2026-07-25T10:00:00.000Z' }),
    ]);

    const report = await run({ kind: 'przyrostowa', since: '2026-07-20T00:00:00.000Z' });

    assert.equal(report.sources[0]!.fetched, 1);
    assert.equal(report.mode, 'przyrostowa');
  });

  test('znacznik czasu jest przekazywany do zapytania', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, []);
    await run({ kind: 'przyrostowa', since: '2026-07-20T00:00:00.000Z' });

    assert.equal(reader.queries[0]?.editedSince, '2026-07-20T00:00:00.000Z');
  });

  test('import pełny nie przekazuje znacznika', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, []);
    await run();

    assert.equal(reader.queries[0]?.editedSince, undefined);
  });
});

describe('paginacja i tempo', () => {
  test('kursor jest obsługiwany do wyczerpania wyników', async () => {
    const { reader, run } = setup();
    reader.pageSize = 2;
    reader.set(
      DATA_SOURCE_IDS.cennik,
      Array.from({ length: 5 }, (_, i) => cennikPage(`p${i}`, { Wariant: text(`w${i}`) })),
    );

    const report = await run();

    assert.equal(report.sources[0]!.fetched, 5);
    assert.equal(reader.queries.length, 3);
  });

  test('między żądaniami zachowany jest odstęp', async () => {
    const { reader, clock, run } = setup();
    reader.pageSize = 1;
    reader.set(
      DATA_SOURCE_IDS.cennik,
      Array.from({ length: 4 }, (_, i) => cennikPage(`p${i}`, { Wariant: text(`w${i}`) })),
    );

    await run();

    // Cztery strony wyników plus zapytanie domykające = co najmniej 3 odstępy.
    assert.ok(clock.elapsed() >= 350 * 3, `upłynęło ${clock.elapsed()} ms`);
  });

  test('błąd przejściowy jest ponawiany', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    reader.failNext(2, new TransientNotionError('rate limited'));

    const report = await run();

    assert.equal(report.sources[0]!.created, 1);
    assert.equal(reader.queries.length, 3);
  });

  test('błąd trwały nie jest ponawiany', async () => {
    const { reader, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('p1')]);
    reader.failNext(1, new Error('nieznana baza'));

    await assert.rejects(() => run(), /nieznana baza/u);
    assert.equal(reader.queries.length, 1);
  });
});

describe('jednokierunkowość', () => {
  test('czytnik ma wyłącznie metodę odczytu', () => {
    // Rozszerzenie tego interfejsu o zapis jest zmianą architektoniczną
    // (ADR-02), a nie drobiazgiem — test to utrwala.
    const reader = new FakeNotion();
    const metody = Object.getOwnPropertyNames(Object.getPrototypeOf(reader)).filter(
      (name) => name !== 'constructor',
    );

    const zapisujace = metody.filter((name) => /^(update|create|write|delete|patch|set)/u.test(name));
    assert.deepEqual(zapisujace.filter((name) => name !== 'set' && name !== 'setPageSize'), []);
  });

  test('synchronizacja wielu źródeł nie miesza rekordów', async () => {
    const { reader, store, run } = setup();
    reader.set(DATA_SOURCE_IDS.cennik, [cennikPage('c1')]);
    reader.set(DATA_SOURCE_IDS.biblioteka, [bibliotekaPage('b1')]);

    const report = await run(PELNA, ['cennik', 'biblioteka']);

    assert.equal(report.sources.length, 2);
    assert.equal(store.active('cennik').length, 1);
    assert.equal(store.active('biblioteka').length, 1);
    assert.equal(store.active('biblioteka')[0]!.data.tytul, 'Higiena snu w 5 minut');
  });
});
