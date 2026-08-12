import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  doRealizacji,
  INSTRUKCJE_REALIZACJI,
  NieuprawnionyOdbiorError,
  NiezgodnyPodmiotError,
  oznaczZrealizowany,
  przygotujEksport,
  stanWniosku,
  terminRealizacji,
  TERMIN_REALIZACJI_DNI,
  type Prawo,
  type Rekord,
  type WniosekOsoby,
  type ZbiorPodmiotu,
} from '../src/index.ts';

const TOKEN = 'token-odbioru-0123456789';

const rekord = (id: string, rodzaj: Rekord['rodzaj'], dane: Record<string, unknown>): Rekord => ({
  id,
  rodzaj,
  utworzono: '2026-02-01',
  dane,
});

function zbior(overrides: Partial<ZbiorPodmiotu> = {}): ZbiorPodmiotu {
  return {
    subjectRef: 'psd-001',
    uczestnictwo: { od: '2026-01-15' },
    tozsamosc: {
      userId: 'u-1',
      email: 'anna@example.org',
      imie: 'Anna',
      nazwisko: 'Kowalska',
      dataUrodzenia: '1984-03-12',
    },
    rekordy: [
      rekord('r-1', 'kwestionariusz', { d1_choroby_przewlekle: ['cukrzyca_t2'] }),
      rekord('r-2', 'wyniki_badan', { hba1c: 6.9 }),
      rekord('r-3', 'plan', { dniTreningowe: 3 }),
      rekord('r-4', 'audit_log', { akcja: 'logowanie' }),
    ],
    ...overrides,
  };
}

const wniosek = (overrides: Partial<WniosekOsoby> = {}): WniosekOsoby => ({
  id: 'w-1',
  subjectRef: 'psd-001',
  prawo: 'dostep',
  zlozony: '2026-09-01',
  ...overrides,
});

describe('termin realizacji', () => {
  test('trzydzieści dni od złożenia', () => {
    assert.equal(TERMIN_REALIZACJI_DNI, 30);
    assert.equal(terminRealizacji(wniosek({ zlozony: '2026-09-01' })), '2026-10-01');
  });

  test('termin przechodzi przez koniec roku', () => {
    assert.equal(terminRealizacji(wniosek({ zlozony: '2026-12-20' })), '2027-01-19');
  });

  test('wniosek po terminie jest zaległy, nie „w toku"', () => {
    const w = wniosek({ zlozony: '2026-09-01' });
    assert.equal(stanWniosku(w, '2026-09-30'), 'przyjety');
    assert.equal(stanWniosku(w, '2026-10-01'), 'przyjety');
    assert.equal(stanWniosku(w, '2026-10-02'), 'zalegly');
  });

  test('realizacja zamyka wniosek niezależnie od daty', () => {
    const w = oznaczZrealizowany(wniosek({ zlozony: '2026-01-01' }), '2026-01-10');
    assert.equal(stanWniosku(w, '2027-01-01'), 'zrealizowany');
    assert.equal(w.zrealizowany, '2026-01-10');
  });

  test('kolejka jest ułożona wg terminu, nie wg daty złożenia', () => {
    const kolejka = doRealizacji(
      [
        wniosek({ id: 'w-2', zlozony: '2026-09-10' }),
        wniosek({ id: 'w-3', zlozony: '2026-08-01' }),
        oznaczZrealizowany(wniosek({ id: 'w-4', zlozony: '2026-07-01' }), '2026-07-05'),
      ],
      '2026-09-20',
    );

    assert.deepEqual(
      kolejka.map((w) => w.id),
      ['w-3', 'w-2'],
    );
  });
});

describe('eksport zapieczętowany', () => {
  test('metadane nie zawierają treści danych', () => {
    const { metadane } = przygotujEksport(zbior(), wniosek(), '2026-09-20', TOKEN);
    const serializowane = JSON.stringify(metadane);

    // Nic z zawartości rekordów ani z tożsamości nie może przeciekać
    // do struktury, którą panel administratora renderuje.
    for (const wartosc of ['cukrzyca_t2', '6.9', 'Kowalska', 'anna@example.org', '1984-03-12']) {
      assert.equal(
        serializowane.includes(wartosc),
        false,
        `metadane pakietu ujawniają "${wartosc}"`,
      );
    }
  });

  test('metadane mówią, ile i czego jest w pakiecie', () => {
    const { metadane } = przygotujEksport(zbior(), wniosek(), '2026-09-20', TOKEN);

    assert.equal(metadane.liczbaRekordow, 4);
    assert.equal(metadane.zawieraTozsamosc, true);
    assert.deepEqual(metadane.rodzaje, [
      { rodzaj: 'audit_log', liczba: 1 },
      { rodzaj: 'kwestionariusz', liczba: 1 },
      { rodzaj: 'plan', liczba: 1 },
      { rodzaj: 'wyniki_badan', liczba: 1 },
    ]);
    assert.ok(metadane.bajtow > 0);
    assert.match(metadane.sumaKontrolna, /^[0-9a-f]{16}$/);
  });

  test('bez tokenu pakiet się nie otwiera', () => {
    const pakiet = przygotujEksport(zbior(), wniosek(), '2026-09-20', TOKEN);

    assert.throws(() => pakiet.odbierz('zgaduje-token-000'), NieuprawnionyOdbiorError);
    assert.throws(() => pakiet.odbierzJako(''), NieuprawnionyOdbiorError);
  });

  test('z tokenem osoba dostaje pełne dane', () => {
    const pakiet = przygotujEksport(zbior(), wniosek(), '2026-09-20', TOKEN);
    const otwarty = pakiet.odbierz(TOKEN);

    assert.equal(otwarty.liczbaRekordow, 4);
    assert.equal(otwarty.tozsamosc?.nazwisko, 'Kowalska');
    assert.ok(otwarty.celePrzetwarzania.length > 0, 'art. 15 wymaga opisu celów');
    assert.match(pakiet.odbierzJako(TOKEN), /cukrzyca_t2/);
  });

  test('suma kontrolna zmienia się razem z zawartością', () => {
    const a = przygotujEksport(zbior(), wniosek(), '2026-09-20', TOKEN).metadane;
    const b = przygotujEksport(
      zbior({ rekordy: [rekord('r-1', 'kwestionariusz', { d1_wiek: 41 })] }),
      wniosek(),
      '2026-09-20',
      TOKEN,
    ).metadane;

    assert.notEqual(a.sumaKontrolna, b.sumaKontrolna);
  });

  test('pakiet nie powstanie dla cudzego wniosku', () => {
    assert.throws(
      () => przygotujEksport(zbior(), wniosek({ subjectRef: 'psd-999' }), '2026-09-20', TOKEN),
      NiezgodnyPodmiotError,
    );
  });

  test('krótki token jest odrzucany przy tworzeniu, nie przy odbiorze', () => {
    // Token zgadywalny to brak zabezpieczenia — a błąd musi wyjść u tego,
    // kto go wygenerował, nie u osoby próbującej odebrać dane.
    assert.throws(() => przygotujEksport(zbior(), wniosek(), '2026-09-20', '1234'), /16 znaków/);
  });

  test('eksport osoby bez tożsamości nie udaje, że ją ma', () => {
    const { metadane } = przygotujEksport(
      zbior({ tozsamosc: undefined }),
      wniosek(),
      '2026-09-20',
      TOKEN,
    );
    assert.equal(metadane.zawieraTozsamosc, false);
  });
});

describe('instrukcje realizacji', () => {
  test('każde prawo ma opis czynności', () => {
    const prawa: Record<Prawo, true> = {
      dostep: true,
      przenoszenie: true,
      sprostowanie: true,
      usuniecie: true,
      sprzeciw_wobec_profilowania: true,
    };

    for (const prawo of Object.keys(prawa) as Prawo[]) {
      assert.ok(INSTRUKCJE_REALIZACJI[prawo].length > 30, prawo);
    }
  });

  test('sprostowanie kieruje do uczestnika, nie do administratora', () => {
    assert.match(INSTRUKCJE_REALIZACJI.sprostowanie, /uczestnik/i);
  });
});
