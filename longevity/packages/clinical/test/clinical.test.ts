import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assess, syntheticIntake, type Assessment } from '@longevity/core';

import {
  BrakUzasadnieniaError,
  czyPilnyDozwolony,
  dokumentZlecenia,
  grafik,
  KonsultacjaNierozpoczetaError,
  odnotujNiestawiennictwo,
  odnotujOdbycie,
  odrzuc,
  odwolaj,
  OKNO_ODWOLANIA_H,
  przygotujPropozycje,
  PusteZlecenieError,
  PustaNotatkaError,
  TerminMinalError,
  TerminPilnyNiedostepnyError,
  TerminZajetyError,
  widokTerminarza,
  zapiszNotatke,
  zarezerwuj,
  zatwierdz,
  ZlecenieJuzRozpatrzoneError,
  ZlecenieNiezatwierdzoneError,
  ZlyStatusKonsultacjiError,
  type Konsultacja,
  type Termin,
} from '../src/index.ts';

const TERAZ = '2026-10-05T09:00';
const ORG = 'org-alfa';

const termin = (id: string, start: string, rodzaj: Termin['rodzaj'] = 'planowy'): Termin => ({
  id,
  organizationId: ORG,
  clinicianId: 'lek-1',
  start,
  minut: 30,
  rodzaj,
});

const PLANOWY = termin('t-1', '2026-10-08T10:00');
const PILNY = termin('t-pilny', '2026-10-06T08:00', 'pilny');
const MINIONY = termin('t-stary', '2026-10-01T10:00');

const rezerwacja = (nadpisania: Partial<Parameters<typeof zarezerwuj>[1]> = {}) =>
  zarezerwuj([], {
    termin: PLANOWY,
    participantId: 'u-101',
    subjectRef: 'psd-8fa2',
    kategoria: 'ZIELONA',
    teraz: TERAZ,
    ...nadpisania,
  });

describe('pula pilna', () => {
  test('kategoria CZERWONA otwiera termin pilny', () => {
    assert.equal(czyPilnyDozwolony('CZERWONA'), true);
    assert.equal(czyPilnyDozwolony('ŻÓŁTA'), false);
    assert.equal(czyPilnyDozwolony('ZIELONA'), false);
  });

  test('zapis planowy nie zajmie terminu pilnego', () => {
    // Gdyby mógł, pula znikałaby pierwszego dnia i osoba z zatrzymanym planem
    // trafiałaby na koniec kolejki.
    assert.throws(
      () => rezerwacja({ termin: PILNY }),
      TerminPilnyNiedostepnyError,
    );
  });

  test('kategoria CZERWONA rezerwuje termin pilny', () => {
    const konsultacja = rezerwacja({ termin: PILNY, kategoria: 'CZERWONA' });
    assert.equal(konsultacja.status, 'zarezerwowana');
  });

  test('widok terminarza pokazuje powód niedostępności zamiast ukrywać termin', () => {
    const widok = widokTerminarza([PLANOWY, PILNY], [], 'ZIELONA', TERAZ);

    assert.equal(widok.length, 2, 'terminy zamknięte zniknęły z listy');
    const pilny = widok.find((pozycja) => pozycja.termin.id === 't-pilny')!;
    assert.equal(pilny.dostepny, false);
    assert.match(pilny.powod ?? '', /czerwoną kategorią/);
  });

  test('terminarz nie pokazuje terminów minionych', () => {
    const widok = widokTerminarza([PLANOWY, MINIONY], [], 'ZIELONA', TERAZ);
    assert.deepEqual(
      widok.map((pozycja) => pozycja.termin.id),
      ['t-1'],
    );
  });
});

describe('rezerwacja', () => {
  test('zajęty termin nie przyjmuje drugiej rezerwacji', () => {
    const pierwsza = rezerwacja();
    assert.throws(
      () =>
        zarezerwuj([pierwsza], {
          termin: PLANOWY,
          participantId: 'u-102',
          subjectRef: 'psd-inny',
          kategoria: 'ZIELONA',
          teraz: TERAZ,
        }),
      TerminZajetyError,
    );
  });

  test('odwołana rezerwacja zwalnia termin', () => {
    const pierwsza = rezerwacja();
    const odwolana = odwolaj(pierwsza, PLANOWY, TERAZ);

    assert.doesNotThrow(() =>
      zarezerwuj([odwolana], {
        termin: PLANOWY,
        participantId: 'u-102',
        subjectRef: 'psd-inny',
        kategoria: 'ZIELONA',
        teraz: TERAZ,
      }),
    );
  });

  test('termin miniony nie przyjmuje rezerwacji', () => {
    assert.throws(() => rezerwacja({ termin: MINIONY }), TerminMinalError);
  });

  test('powód rezerwacji jest opcjonalny i przycinany', () => {
    assert.equal('powod' in rezerwacja({ powod: '   ' }), false);
    assert.equal(rezerwacja({ powod: '  wyniki badań  ' }).powod, 'wyniki badań');
  });

  test('rezerwacja nie niesie zgody na udostępnienie karty', () => {
    // To dwie osobne decyzje. Konsultacja nie zawiera pola, którym dałoby się
    // udzielić zgody „przy okazji" umawiania wizyty.
    assert.equal(
      Object.keys(rezerwacja()).some((klucz) => /zgod/iu.test(klucz)),
      false,
    );
  });
});

describe('odwołanie', () => {
  test('odwołanie z wyprzedzeniem nie jest oznaczane jako późne', () => {
    const odwolana = odwolaj(rezerwacja(), PLANOWY, TERAZ);

    assert.equal(odwolana.status, 'odwolana');
    assert.equal(odwolana.poznoOdwolana, undefined);
  });

  test('odwołanie w oknie granicznym jest odnotowane, ale bez sankcji', () => {
    const tuzPrzed = '2026-10-08T00:00';
    const odwolana = odwolaj(rezerwacja(), PLANOWY, tuzPrzed);

    assert.equal(OKNO_ODWOLANIA_H, 24);
    assert.equal(odwolana.poznoOdwolana, true);
    assert.equal(
      Object.keys(odwolana).some((klucz) => /oplat|kar/iu.test(klucz)),
      false,
      'późne odwołanie nie pociąga opłaty',
    );
  });

  test('odwołanej konsultacji nie da się odwołać ponownie', () => {
    const odwolana = odwolaj(rezerwacja(), PLANOWY, TERAZ);
    assert.throws(() => odwolaj(odwolana, PLANOWY, TERAZ), ZlyStatusKonsultacjiError);
  });
});

describe('rozliczenie konsultacji', () => {
  test('nie da się oznaczyć odbycia przed rozpoczęciem', () => {
    assert.throws(() => odnotujOdbycie(rezerwacja(), PLANOWY, TERAZ), KonsultacjaNierozpoczetaError);
  });

  test('po rozpoczęciu odbycie i niestawiennictwo są dostępne', () => {
    const po = '2026-10-08T10:30';

    assert.equal(odnotujOdbycie(rezerwacja(), PLANOWY, po).status, 'odbyta');
    assert.equal(
      odnotujNiestawiennictwo(rezerwacja(), PLANOWY, po).status,
      'niestawiennictwo',
    );
  });

  test('grafik lekarza obejmuje jeden dzień i jest posortowany', () => {
    const wczesny = termin('t-a', '2026-10-08T08:00');
    const inny = termin('t-b', '2026-10-09T08:00');
    const cudzy: Termin = { ...termin('t-c', '2026-10-08T07:00'), clinicianId: 'lek-2' };

    const konsultacje: Konsultacja[] = [PLANOWY, wczesny, inny, cudzy].map((t) =>
      zarezerwuj([], {
        termin: t,
        participantId: 'u-101',
        subjectRef: 'psd-8fa2',
        kategoria: 'ZIELONA',
        teraz: TERAZ,
      }),
    );

    const dzien = grafik(konsultacje, [PLANOWY, wczesny, inny, cudzy], 'lek-1', '2026-10-08');

    assert.deepEqual(
      dzien.map((pozycja) => pozycja.termin.id),
      ['t-a', 't-1'],
    );
  });
});

describe('notatka lekarza', () => {
  const odbyta = odnotujOdbycie(rezerwacja(), PLANOWY, '2026-10-08T10:30');

  test('powstaje wyłącznie do konsultacji odbytej', () => {
    assert.throws(
      () => zapiszNotatke(rezerwacja(), 'treść', [], 'lek-1', TERAZ),
      ZlyStatusKonsultacjiError,
    );
  });

  test('pusta notatka jest odrzucana', () => {
    assert.throws(() => zapiszNotatke(odbyta, '   ', [], 'lek-1', TERAZ), PustaNotatkaError);
  });

  test('zalecenia puste są pomijane, treść przycinana', () => {
    const notatka = zapiszNotatke(
      odbyta,
      '  Kontrola za trzy miesiące.  ',
      ['Sen 7 godzin', '  ', ''],
      'lek-1',
      TERAZ,
    );

    assert.equal(notatka.tresc, 'Kontrola za trzy miesiące.');
    assert.deepEqual(notatka.zalecenia, ['Sen 7 godzin']);
    assert.equal(notatka.autorId, 'lek-1');
  });
});

describe('zlecenie badań', () => {
  const intake = syntheticIntake({ ageYears: 44, sex: 'K' });
  const ocena: Assessment = assess(intake, { mode: 'synthetic', now: new Date(TERAZ) });
  const propozycja = () => przygotujPropozycje(intake, ocena, 'kons-1', 'u-101', TERAZ);

  test('propozycja powstaje z reguł i niesie powód przy każdej pozycji', () => {
    const zlecenie = propozycja();

    assert.equal(zlecenie.status, 'propozycja');
    assert.ok(zlecenie.pozycje.length > 5);
    assert.ok(zlecenie.pozycje.every((pozycja) => pozycja.powod.length > 10));
  });

  test('badanie z dwóch panelów jest jedną pozycją', () => {
    const nazwy = propozycja().pozycje.map((pozycja) => pozycja.badanie);
    assert.equal(new Set(nazwy).size, nazwy.length);
  });

  test('propozycji nie da się wydrukować', () => {
    // To jest sedno: platforma proponuje, dokument podpisuje lekarz.
    assert.throws(() => dokumentZlecenia(propozycja()), ZlecenieNiezatwierdzoneError);
  });

  test('lekarz może usunąć pozycje przed podpisem', () => {
    const zlecenie = propozycja();
    const usuwane = zlecenie.pozycje[0]!.badanie;

    const podpisane = zatwierdz(zlecenie, {
      lekarzId: 'lek-1',
      teraz: TERAZ,
      usun: [usuwane],
    });

    assert.equal(podpisane.status, 'zatwierdzone');
    assert.equal(
      podpisane.pozycje.some((pozycja) => pozycja.badanie === usuwane),
      false,
    );
    assert.deepEqual(podpisane.usuniete, [usuwane]);
  });

  test('nie da się zatwierdzić pustego zlecenia', () => {
    const zlecenie = propozycja();
    assert.throws(
      () =>
        zatwierdz(zlecenie, {
          lekarzId: 'lek-1',
          teraz: TERAZ,
          usun: zlecenie.pozycje.map((pozycja) => pozycja.badanie),
        }),
      PusteZlecenieError,
    );
  });

  test('dokument powstaje dopiero po podpisie i wskazuje lekarza', () => {
    const podpisane = zatwierdz(propozycja(), { lekarzId: 'lek-1', teraz: TERAZ });
    const dokument = dokumentZlecenia(podpisane);

    assert.equal(dokument.wystawil, 'lek-1');
    assert.match(dokument.zastrzezenie, /decyzja i podpis należą do lekarza/);
  });

  test('odrzucenie wymaga uzasadnienia', () => {
    assert.throws(() => odrzuc(propozycja(), 'lek-1', '  ', TERAZ), BrakUzasadnieniaError);
  });

  test('odrzucone zlecenie niesie powód dla uczestnika', () => {
    const odrzucone = odrzuc(propozycja(), 'lek-1', 'Badania wykonane miesiąc temu.', TERAZ);

    assert.equal(odrzucone.status, 'odrzucone');
    assert.equal(odrzucone.uzasadnienieOdrzucenia, 'Badania wykonane miesiąc temu.');
    assert.throws(() => dokumentZlecenia(odrzucone), ZlecenieNiezatwierdzoneError);
  });

  test('rozpatrzonego zlecenia nie da się rozpatrzyć drugi raz', () => {
    const podpisane = zatwierdz(propozycja(), { lekarzId: 'lek-1', teraz: TERAZ });

    assert.throws(
      () => zatwierdz(podpisane, { lekarzId: 'lek-2', teraz: TERAZ }),
      ZlecenieJuzRozpatrzoneError,
    );
    assert.throws(() => odrzuc(podpisane, 'lek-2', 'powód', TERAZ), ZlecenieJuzRozpatrzoneError);
  });
});
