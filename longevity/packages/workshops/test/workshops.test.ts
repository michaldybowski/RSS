import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { AccessDeniedError, type Actor } from '@longevity/access';

import {
  doPowiadomienia,
  frekwencja,
  listaDlaTrenera,
  ObecnoscPrzedRozpoczeciemError,
  obloznosc,
  odnotujObecnosc,
  odwolaj,
  rozliczTrenera,
  UczestnikSpozaListyError,
  wypisz,
  zapisz,
  type DaneOsobowe,
  type Obecnosc,
  type StanZapisow,
  type Warsztat,
} from '../src/index.ts';

const ORG = 'zaklad-polnoc';

const WARSZTAT: Warsztat = {
  id: 'w-1',
  notionId: 'notion-1',
  temat: 'Ergonomia stanowiska',
  start: '2026-09-15T09:00:00.000Z',
  czasTrwaniaMin: 90,
  organizationId: ORG,
  trenerId: 't-1',
  miejsc: 3,
  status: 'zaplanowany',
  dopuscBezZapisu: false,
};

const trener = (id: string, org = ORG): Actor => ({
  userId: id,
  grants: [{ role: 'trener', organizationId: org }],
});

const OSOBY: DaneOsobowe[] = [
  { participantId: 'psd-0001', imie: 'Anna', nazwisko: 'Kowalska' },
  { participantId: 'psd-0002', imie: 'Piotr', nazwisko: 'Nowak' },
  { participantId: 'psd-0003', imie: 'Anna', nazwisko: 'Zielińska' },
  { participantId: 'psd-0004', imie: 'Marek', nazwisko: 'Wójcik' },
];

const PRZED = '2026-09-10T08:00:00.000Z';
const PO_STARCIE = '2026-09-15T09:30:00.000Z';

function zapiszWielu(ids: readonly string[], warsztat = WARSZTAT): StanZapisow {
  let stan: StanZapisow = { zapisy: [] };
  ids.forEach((id, index) => {
    const wynik = zapisz(stan, warsztat, id, `2026-09-1${index}T08:00:00.000Z`);
    stan = wynik.stan;
  });
  return stan;
}

describe('zapisy', () => {
  test('pierwsze zgłoszenia zajmują miejsca', () => {
    const stan = zapiszWielu(['psd-0001', 'psd-0002']);
    const zajete = obloznosc(WARSZTAT, stan.zapisy);

    assert.equal(zajete.zapisani, 2);
    assert.equal(zajete.wolneMiejsca, 1);
    assert.equal(zajete.pelny, false);
  });

  test('po wyczerpaniu miejsc trafia się na listę rezerwową', () => {
    const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003']);
    const wynik = zapisz(stan, WARSZTAT, 'psd-0004', PRZED);

    assert.equal(wynik.wynik.kind, 'lista_rezerwowa');
    if (wynik.wynik.kind === 'lista_rezerwowa') assert.equal(wynik.wynik.pozycja, 1);
  });

  test('powtórny zapis jest odrzucany', () => {
    const stan = zapiszWielu(['psd-0001']);
    const wynik = zapisz(stan, WARSZTAT, 'psd-0001', PRZED);

    assert.equal(wynik.wynik.kind, 'odrzucony');
    if (wynik.wynik.kind === 'odrzucony') assert.equal(wynik.wynik.powod, 'juz_zapisany');
  });

  test('zapisy zamykają się z chwilą rozpoczęcia', () => {
    const wynik = zapisz({ zapisy: [] }, WARSZTAT, 'psd-0001', PO_STARCIE);

    assert.equal(wynik.wynik.kind, 'odrzucony');
    if (wynik.wynik.kind === 'odrzucony') assert.equal(wynik.wynik.powod, 'zapisy_zamkniete');
  });

  test('na odwołany warsztat nie da się zapisać', () => {
    const wynik = zapisz({ zapisy: [] }, odwolaj(WARSZTAT), 'psd-0001', PRZED);

    assert.equal(wynik.wynik.kind, 'odrzucony');
    if (wynik.wynik.kind === 'odrzucony') assert.equal(wynik.wynik.powod, 'warsztat_odwolany');
  });

  test('operacje nie mutują poprzedniego stanu', () => {
    const stan = zapiszWielu(['psd-0001']);
    zapisz(stan, WARSZTAT, 'psd-0002', PRZED);
    assert.equal(stan.zapisy.length, 1);
  });
});

describe('wypisanie i lista rezerwowa', () => {
  test('zwolnione miejsce awansuje pierwszą osobę z rezerwy', () => {
    const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003', 'psd-0004']);
    const wynik = wypisz(stan, WARSZTAT, 'psd-0002', PRZED);

    assert.equal(wynik.wynik.kind, 'wypisany');
    if (wynik.wynik.kind === 'wypisany') assert.equal(wynik.wynik.awansowany, 'psd-0004');
    assert.equal(obloznosc(WARSZTAT, wynik.stan.zapisy).zapisani, 3);
  });

  test('wypisanie osoby z rezerwy nikogo nie awansuje', () => {
    const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003', 'psd-0004']);
    const wynik = wypisz(stan, WARSZTAT, 'psd-0004', PRZED);

    assert.equal(wynik.wynik.kind, 'wypisany');
    if (wynik.wynik.kind === 'wypisany') assert.equal(wynik.wynik.awansowany, undefined);
  });

  test('awans zachowuje kolejność zgłoszeń', () => {
    let stan: StanZapisow = { zapisy: [] };
    for (const [index, id] of ['psd-0001', 'psd-0002', 'psd-0003', 'psd-0004'].entries()) {
      stan = zapisz(stan, WARSZTAT, id, `2026-09-0${index + 1}T08:00:00.000Z`).stan;
    }
    stan = zapisz(stan, WARSZTAT, 'psd-0005', '2026-09-05T08:00:00.000Z').stan;

    const po = wypisz(stan, WARSZTAT, 'psd-0001', PRZED);
    if (po.wynik.kind === 'wypisany') assert.equal(po.wynik.awansowany, 'psd-0004');
  });

  test('wypisanie osoby niezapisanej jest odrzucane', () => {
    const wynik = wypisz({ zapisy: [] }, WARSZTAT, 'psd-0009', PRZED);
    assert.equal(wynik.wynik.kind, 'odrzucony');
  });

  test('odwołanie zachowuje zapisy, żeby było kogo powiadomić', () => {
    const stan = zapiszWielu(['psd-0001', 'psd-0002']);
    const odwolany = odwolaj(WARSZTAT);

    assert.equal(odwolany.status, 'odwolany');
    assert.deepEqual(doPowiadomienia(stan, WARSZTAT.id), ['psd-0001', 'psd-0002']);
  });
});

describe('obecności', () => {
  const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003']);

  test('odnotować może wyłącznie trener prowadzący', () => {
    assert.throws(
      () =>
        odnotujObecnosc(trener('t-2'), WARSZTAT, stan.zapisy, [], [{ participantId: 'psd-0001', obecny: true }], PO_STARCIE),
      AccessDeniedError,
    );
  });

  test('trener z innej organizacji nie odnotuje obecności', () => {
    assert.throws(
      () =>
        odnotujObecnosc(
          trener('t-1', 'zaklad-poludnie'),
          WARSZTAT,
          stan.zapisy,
          [],
          [{ participantId: 'psd-0001', obecny: true }],
          PO_STARCIE,
        ),
      AccessDeniedError,
    );
  });

  test('nie da się odnotować obecności przed rozpoczęciem', () => {
    // Lista wypełniona z góry nie jest listą obecności, tylko listą zapisów.
    assert.throws(
      () =>
        odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, [], [{ participantId: 'psd-0001', obecny: true }], PRZED),
      ObecnoscPrzedRozpoczeciemError,
    );
  });

  test('osoba spoza listy jest odrzucana, gdy warsztat tego nie dopuszcza', () => {
    assert.throws(
      () =>
        odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, [], [{ participantId: 'psd-0009', obecny: true }], PO_STARCIE),
      UczestnikSpozaListyError,
    );
  });

  test('wejście bez zapisu jest możliwe, gdy warsztat na to pozwala', () => {
    const otwarty = { ...WARSZTAT, dopuscBezZapisu: true };
    const wynik = odnotujObecnosc(
      trener('t-1'),
      otwarty,
      stan.zapisy,
      [],
      [{ participantId: 'psd-0009', obecny: true }],
      PO_STARCIE,
    );

    assert.equal(wynik.obecnosci.length, 1);
  });

  test('poprawka zastępuje wpis i zostawia ślad', () => {
    const pierwsze = odnotujObecnosc(
      trener('t-1'),
      WARSZTAT,
      stan.zapisy,
      [],
      [{ participantId: 'psd-0001', obecny: false }],
      PO_STARCIE,
    );

    const poprawka = odnotujObecnosc(
      trener('t-1'),
      WARSZTAT,
      stan.zapisy,
      pierwsze.obecnosci,
      [{ participantId: 'psd-0001', obecny: true }],
      PO_STARCIE,
    );

    assert.equal(poprawka.obecnosci.length, 1);
    assert.equal(poprawka.obecnosci[0]?.obecny, true);
    assert.deepEqual(poprawka.poprawione, ['psd-0001']);
  });

  test('powtórzenie tej samej odpowiedzi nie jest poprawką', () => {
    const pierwsze = odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, [], [{ participantId: 'psd-0001', obecny: true }], PO_STARCIE);
    const drugie = odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, pierwsze.obecnosci, [{ participantId: 'psd-0001', obecny: true }], PO_STARCIE);

    assert.deepEqual(drugie.poprawione, []);
  });

  test('obecności innych warsztatów zostają nietknięte', () => {
    const obce: Obecnosc[] = [
      { warsztatId: 'w-9', participantId: 'psd-0007', obecny: true, odnotowalTrenerId: 't-9', at: PO_STARCIE },
    ];
    const wynik = odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, obce, [{ participantId: 'psd-0001', obecny: true }], PO_STARCIE);

    assert.ok(wynik.obecnosci.some((obecnosc) => obecnosc.warsztatId === 'w-9'));
  });
});

describe('lista dla trenera', () => {
  const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003', 'psd-0004']);

  test('wymaga odrębnego uprawnienia', () => {
    assert.throws(() => listaDlaTrenera(trener('t-2'), WARSZTAT, stan.zapisy, OSOBY, []), AccessDeniedError);
  });

  test('pokazuje imię i inicjał, nie pełne nazwisko', () => {
    const lista = listaDlaTrenera(trener('t-1'), WARSZTAT, stan.zapisy, OSOBY, []);

    assert.equal(lista[0]?.etykieta, 'Anna K.');
    const serialized = JSON.stringify(lista);
    assert.ok(!serialized.includes('Kowalska'));
    assert.ok(!serialized.includes('Zielińska'));
  });

  test('kod uczestnika rozróżnia osoby o tym samym imieniu', () => {
    const lista = listaDlaTrenera(trener('t-1'), WARSZTAT, stan.zapisy, OSOBY, []);
    const anny = lista.filter((pozycja) => pozycja.etykieta.startsWith('Anna'));

    assert.equal(anny.length, 2);
    assert.notEqual(anny[0]?.kod, anny[1]?.kod);
  });

  test('lista obejmuje rezerwę i zachowuje kolejność', () => {
    const lista = listaDlaTrenera(trener('t-1'), WARSZTAT, stan.zapisy, OSOBY, []);

    assert.equal(lista.length, 4);
    assert.equal(lista[3]?.status, 'lista_rezerwowa');
  });

  test('wypisani nie pojawiają się na liście', () => {
    const po = wypisz(stan, WARSZTAT, 'psd-0002', PRZED);
    const lista = listaDlaTrenera(trener('t-1'), WARSZTAT, po.stan.zapisy, OSOBY, []);

    assert.ok(!lista.some((pozycja) => pozycja.participantId === 'psd-0002'));
  });
});

describe('frekwencja', () => {
  const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003']);

  test('liczona wobec zapisanych', () => {
    const wynik = odnotujObecnosc(
      trener('t-1'),
      WARSZTAT,
      stan.zapisy,
      [],
      [
        { participantId: 'psd-0001', obecny: true },
        { participantId: 'psd-0002', obecny: true },
        { participantId: 'psd-0003', obecny: false },
      ],
      PO_STARCIE,
    );

    const wynikFrekwencji = frekwencja(WARSZTAT, stan.zapisy, wynik.obecnosci);
    assert.equal(wynikFrekwencji.zapisanych, 3);
    assert.equal(wynikFrekwencji.obecnych, 2);
    assert.equal(wynikFrekwencji.udzialProcent, 67);
  });

  test('brak odnotowania jest widoczny osobno od nieobecności', () => {
    const wynik = odnotujObecnosc(trener('t-1'), WARSZTAT, stan.zapisy, [], [{ participantId: 'psd-0001', obecny: true }], PO_STARCIE);
    const wynikFrekwencji = frekwencja(WARSZTAT, stan.zapisy, wynik.obecnosci);

    assert.equal(wynikFrekwencji.bezOdnotowania, 2);
    assert.equal(wynikFrekwencji.nieobecnych, 0);
  });

  test('warsztat bez zapisanych nie dzieli przez zero', () => {
    assert.equal(frekwencja(WARSZTAT, [], []).udzialProcent, 0);
  });
});

describe('rozliczenie trenera', () => {
  const stan = zapiszWielu(['psd-0001', 'psd-0002', 'psd-0003']);
  const obecnosci = odnotujObecnosc(
    trener('t-1'),
    WARSZTAT,
    stan.zapisy,
    [],
    [
      { participantId: 'psd-0001', obecny: true },
      { participantId: 'psd-0002', obecny: true },
      { participantId: 'psd-0003', obecny: false },
    ],
    PO_STARCIE,
  ).obecnosci;

  const STAWKI = { zaWarsztatGr: 60_000, zaUczestnikaGr: 2_000, zaOdwolanyGr: 30_000 };

  test('przeprowadzony warsztat rozliczany ryczałtem i dopłatą za obecnych', () => {
    const wynik = rozliczTrenera('t-1', '2026-09', [{ warsztat: WARSZTAT }], stan.zapisy, obecnosci, STAWKI);

    assert.equal(wynik.przeprowadzonych, 1);
    assert.equal(wynik.sumaGr, 64_000);
    assert.equal(wynik.sumaOpis, '640,00 zł');
  });

  test('brak listy obecności wstrzymuje pozycję', () => {
    // Brak odnotowania nie znaczy, że warsztat się nie odbył — znaczy,
    // że nie mamy tego potwierdzonego.
    const wynik = rozliczTrenera('t-1', '2026-09', [{ warsztat: WARSZTAT }], stan.zapisy, [], STAWKI);

    assert.equal(wynik.pozycje[0]?.status, 'bez_obecnosci');
    assert.equal(wynik.sumaGr, 0);
    assert.match(wynik.pozycje[0]?.uwaga ?? '', /wstrzymana/u);
  });

  test('odwołanie w terminie jest bezkosztowe', () => {
    const wynik = rozliczTrenera(
      't-1',
      '2026-09',
      [{ warsztat: odwolaj(WARSZTAT), odwolanyAt: '2026-09-10T09:00:00.000Z' }],
      stan.zapisy,
      obecnosci,
      STAWKI,
    );

    assert.equal(wynik.pozycje[0]?.status, 'odwolany_bezplatny');
    assert.equal(wynik.sumaGr, 0);
  });

  test('odwołanie na ostatnią chwilę uruchamia rekompensatę', () => {
    const wynik = rozliczTrenera(
      't-1',
      '2026-09',
      [{ warsztat: odwolaj(WARSZTAT), odwolanyAt: '2026-09-15T02:00:00.000Z' }],
      stan.zapisy,
      obecnosci,
      STAWKI,
    );

    assert.equal(wynik.pozycje[0]?.status, 'odwolany_platny');
    assert.equal(wynik.sumaGr, 30_000);
    assert.match(wynik.pozycje[0]?.uwaga ?? '', /24 h/u);
  });

  test('warsztaty innego trenera i innego okresu są pomijane', () => {
    const obcy: Warsztat = { ...WARSZTAT, id: 'w-2', trenerId: 't-9' };
    const staryOkres: Warsztat = { ...WARSZTAT, id: 'w-3', start: '2026-08-15T09:00:00.000Z' };

    const wynik = rozliczTrenera(
      't-1',
      '2026-09',
      [{ warsztat: WARSZTAT }, { warsztat: obcy }, { warsztat: staryOkres }],
      stan.zapisy,
      obecnosci,
      STAWKI,
    );

    assert.equal(wynik.pozycje.length, 1);
    assert.equal(wynik.pozycje[0]?.warsztatId, 'w-1');
  });

  test('pozycje posortowane po dacie', () => {
    const drugi: Warsztat = { ...WARSZTAT, id: 'w-4', start: '2026-09-01T09:00:00.000Z' };
    const wynik = rozliczTrenera(
      't-1',
      '2026-09',
      [{ warsztat: WARSZTAT }, { warsztat: drugi }],
      stan.zapisy,
      obecnosci,
      STAWKI,
    );

    assert.equal(wynik.pozycje[0]?.warsztatId, 'w-4');
  });
});
