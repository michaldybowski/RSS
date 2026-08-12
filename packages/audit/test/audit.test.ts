import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { AccessDeniedError, type Actor } from '@longevity/access';

import {
  AudytZamknietyError,
  BrakPodstawyCertyfikatuError,
  NiekompletnyAudytError,
  ocen,
  poziomDlaWyniku,
  sprawdzGotowosc,
  wgESRS,
  wydajCertyfikat,
  zamknijAudyt,
  zapiszUstalenia,
  zweryfikuj,
  type Audyt,
  type Certyfikat,
  type SchematCertyfikacji,
  type Ustalenie,
  type WpisUstalenia,
} from '../src/index.ts';

const ORG = 'zaklad-polnoc';

const SCHEMAT: SchematCertyfikacji = {
  id: 'pd-2026',
  wersja: '1.0.0',
  nazwa: 'Pracodawca Długowieczności',
  obowiazujeOd: '2026-01-01',
  domeny: [
    { kod: 'ergonomia', nazwa: 'Ergonomia stanowisk', waga: 3 },
    { kod: 'powietrze', nazwa: 'Jakość powietrza', waga: 2 },
    { kod: 'regeneracja', nazwa: 'Strefy regeneracji', waga: 1 },
  ],
  kryteria: [
    { id: 'e1', domenaKod: 'ergonomia', tresc: 'Regulowane stanowiska', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-14' },
    { id: 'e2', domenaKod: 'ergonomia', tresc: 'Szkolenie z ergonomii', waga: 1, dowodWymagany: true, wskaznikESRS: 'S1-13' },
    { id: 'p1', domenaKod: 'powietrze', tresc: 'Pomiar CO2', waga: 1, dowodWymagany: true, wskaznikESRS: 'S1-14' },
    { id: 'p2', domenaKod: 'powietrze', tresc: 'Wentylacja mechaniczna', waga: 1, dowodWymagany: false },
    { id: 'r1', domenaKod: 'regeneracja', tresc: 'Wydzielona strefa cichej pracy', waga: 1, dowodWymagany: false },
  ],
};

const AUDYT: Audyt = {
  id: 'a-1',
  organizationId: ORG,
  schematId: 'pd-2026',
  schematWersja: '1.0.0',
  audytorId: 'aud-1',
  status: 'w_toku',
  rozpoczety: '2026-09-01T09:00:00.000Z',
};

const audytor = (id: string, org = ORG): Actor => ({
  userId: id,
  grants: [{ role: 'audytor', organizationId: org }],
});

const TERAZ = '2026-09-10T12:00:00.000Z';

/** Zapis zawsze w imieniu aud-1 — inaczej test „obcy audytor" podstawiałby
 *  właściwego prowadzącego i nie sprawdzałby niczego. */
function ustal(wpisy: readonly WpisUstalenia[], audyt = AUDYT): readonly Ustalenie[] {
  return zapiszUstalenia(audytor('aud-1'), audyt, [], wpisy, TERAZ);
}

const KOMPLET: WpisUstalenia[] = [
  { kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'dow/e1.pdf' },
  { kryteriumId: 'e2', ocena: 'czesciowo', dowodKey: 'dow/e2.pdf' },
  { kryteriumId: 'p1', ocena: 'spelnione', dowodKey: 'dow/p1.pdf' },
  { kryteriumId: 'p2', ocena: 'niespelnione' },
  { kryteriumId: 'r1', ocena: 'spelnione' },
];

describe('zapis ustaleń', () => {
  test('tylko audytor prowadzący', () => {
    assert.throws(() => ustal(KOMPLET, { ...AUDYT, audytorId: 'aud-2' }), AccessDeniedError);
  });

  test('audytor z innej organizacji nie zapisze ustaleń', () => {
    assert.throws(
      () => zapiszUstalenia(audytor('aud-1', 'zaklad-poludnie'), AUDYT, [], KOMPLET, TERAZ),
      AccessDeniedError,
    );
  });

  test('zamknięty audyt nie przyjmuje zmian', () => {
    const zamkniety: Audyt = { ...AUDYT, status: 'zamkniety', zamkniety: TERAZ };
    assert.throws(() => ustal(KOMPLET, zamkniety), AudytZamknietyError);
  });

  test('ponowny zapis zastępuje wcześniejsze ustalenie', () => {
    const pierwsze = ustal([{ kryteriumId: 'e1', ocena: 'niespelnione' }]);
    const drugie = zapiszUstalenia(
      audytor('aud-1'),
      AUDYT,
      pierwsze,
      [{ kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'dow/e1.pdf' }],
      TERAZ,
    );

    assert.equal(drugie.length, 1);
    assert.equal(drugie[0]?.ocena, 'spelnione');
  });

  test('ustalenia innego audytu zostają nietknięte', () => {
    const obce: Ustalenie[] = [
      { audytId: 'a-9', kryteriumId: 'e1', ocena: 'spelnione', odnotowal: 'aud-9', at: TERAZ },
    ];
    const wynik = zapiszUstalenia(audytor('aud-1'), AUDYT, obce, KOMPLET, TERAZ);

    assert.ok(wynik.some((ustalenie) => ustalenie.audytId === 'a-9'));
  });
});

describe('wyliczenie wyniku', () => {
  test('„nie dotyczy" wypada z mianownika, a nie liczy się jako zero', () => {
    // Zakład bez stołówki nie ma przegrywać na kryterium o stołówce.
    const zNieDotyczy = ocen(SCHEMAT, ustal([
      { kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'd' },
      { kryteriumId: 'e2', ocena: 'nie_dotyczy' },
    ]));

    const ergonomia = zNieDotyczy.domeny.find((domena) => domena.kod === 'ergonomia');
    assert.equal(ergonomia?.wynikProcent, 100);
    assert.equal(ergonomia?.pominietych, 1);
  });

  test('ocena częściowa daje pół punktu', () => {
    const wynik = ocen(SCHEMAT, ustal([
      { kryteriumId: 'p1', ocena: 'czesciowo', dowodKey: 'd' },
      { kryteriumId: 'p2', ocena: 'czesciowo' },
    ]));

    assert.equal(wynik.domeny.find((domena) => domena.kod === 'powietrze')?.wynikProcent, 50);
  });

  test('kryteria ważone wewnątrz domeny', () => {
    // e1 ma wagę 2, e2 wagę 1 — spełnione tylko e1 daje 67%, nie 50%.
    const wynik = ocen(SCHEMAT, ustal([
      { kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'd' },
      { kryteriumId: 'e2', ocena: 'niespelnione' },
    ]));

    assert.equal(wynik.domeny.find((domena) => domena.kod === 'ergonomia')?.wynikProcent, 67);
  });

  test('domeny ważone w wyniku ogólnym', () => {
    const wynik = ocen(SCHEMAT, ustal(KOMPLET));
    // ergonomia 83% × 3, powietrze 50% × 2, regeneracja 100% × 1 → 449/6 ≈ 75%
    assert.equal(wynik.wynikProcent, 75);
  });

  test('domena bez ocenionych kryteriów nie wchodzi do wyniku ogólnego', () => {
    const wynik = ocen(SCHEMAT, ustal([
      { kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'd' },
      { kryteriumId: 'e2', ocena: 'spelnione', dowodKey: 'd' },
      { kryteriumId: 'p1', ocena: 'nie_dotyczy' },
      { kryteriumId: 'p2', ocena: 'nie_dotyczy' },
    ]));

    assert.equal(wynik.wynikProcent, 100);
  });

  test('brak ustaleń nie daje dzielenia przez zero', () => {
    const wynik = ocen(SCHEMAT, []);
    assert.equal(wynik.wynikProcent, 0);
    assert.equal(wynik.bezOceny.length, 5);
  });

  test('progi poziomów', () => {
    assert.equal(poziomDlaWyniku(90), 'zloty');
    assert.equal(poziomDlaWyniku(85), 'zloty');
    assert.equal(poziomDlaWyniku(84), 'srebrny');
    assert.equal(poziomDlaWyniku(60), 'brazowy');
    assert.equal(poziomDlaWyniku(54), 'brak');
  });
});

describe('wymóg dowodu', () => {
  test('ocena pozytywna bez dowodu jest zgłaszana', () => {
    const wynik = ocen(SCHEMAT, ustal([{ kryteriumId: 'e1', ocena: 'spelnione' }]));
    assert.deepEqual(wynik.bezDowodu, ['e1']);
  });

  test('ocena negatywna nie wymaga dowodu', () => {
    const wynik = ocen(SCHEMAT, ustal([{ kryteriumId: 'e1', ocena: 'niespelnione' }]));
    assert.deepEqual(wynik.bezDowodu, []);
  });

  test('ocena częściowa też wymaga dowodu', () => {
    const wynik = ocen(SCHEMAT, ustal([{ kryteriumId: 'e1', ocena: 'czesciowo' }]));
    assert.deepEqual(wynik.bezDowodu, ['e1']);
  });

  test('kryterium bez wymogu dowodu przechodzi bez załącznika', () => {
    const wynik = ocen(SCHEMAT, ustal([{ kryteriumId: 'r1', ocena: 'spelnione' }]));
    assert.deepEqual(wynik.bezDowodu, []);
  });
});

describe('zamknięcie audytu', () => {
  test('niekompletny audyt nie da się zamknąć', () => {
    const czesciowe = ustal([{ kryteriumId: 'e1', ocena: 'spelnione', dowodKey: 'd' }]);
    assert.throws(
      () => zamknijAudyt(audytor('aud-1'), SCHEMAT, AUDYT, czesciowe, TERAZ),
      NiekompletnyAudytError,
    );
  });

  test('brak dowodu blokuje zamknięcie', () => {
    const bezDowodu = ustal(
      KOMPLET.map(({ dowodKey, ...reszta }) => (reszta.kryteriumId === 'e1' ? reszta : { ...reszta, ...(dowodKey !== undefined ? { dowodKey } : {}) })),
    );
    assert.throws(
      () => zamknijAudyt(audytor('aud-1'), SCHEMAT, AUDYT, bezDowodu, TERAZ),
      NiekompletnyAudytError,
    );
  });

  test('komplet ustaleń pozwala zamknąć', () => {
    const wynik = zamknijAudyt(audytor('aud-1'), SCHEMAT, AUDYT, ustal(KOMPLET), TERAZ);

    assert.equal(wynik.audyt.status, 'zamkniety');
    assert.equal(wynik.audyt.zamkniety, TERAZ);
    assert.equal(wynik.wynik.wynikProcent, 75);
  });

  test('gotowość wskazuje konkretne kryteria i powód', () => {
    const czesciowe = ustal([{ kryteriumId: 'e1', ocena: 'spelnione' }]);
    const gotowosc = sprawdzGotowosc(SCHEMAT, AUDYT, czesciowe);

    assert.equal(gotowosc.gotowy, false);
    assert.ok(gotowosc.brakujace.some((pozycja) => pozycja.powod === 'brak_dowodu'));
    assert.ok(gotowosc.brakujace.some((pozycja) => pozycja.powod === 'brak_oceny'));
    assert.ok(gotowosc.brakujace.every((pozycja) => pozycja.kryterium.tresc.length > 5));
  });
});

describe('certyfikat', () => {
  const zamkniety = zamknijAudyt(audytor('aud-1'), SCHEMAT, AUDYT, ustal(KOMPLET), TERAZ).audyt;

  test('wydawany tylko z zamkniętego audytu', () => {
    assert.throws(
      () => wydajCertyfikat(SCHEMAT, AUDYT, ustal(KOMPLET), 1, TERAZ),
      BrakPodstawyCertyfikatuError,
    );
  });

  test('wynik poniżej progu nie daje certyfikatu', () => {
    const slabe = ustal(SCHEMAT.kryteria.map((kryterium) => ({ kryteriumId: kryterium.id, ocena: 'niespelnione' as const })));
    const zamknietySlaby = zamknijAudyt(audytor('aud-1'), SCHEMAT, AUDYT, slabe, TERAZ).audyt;

    assert.throws(
      () => wydajCertyfikat(SCHEMAT, zamknietySlaby, slabe, 1, TERAZ),
      BrakPodstawyCertyfikatuError,
    );
  });

  test('certyfikat niesie poziom, wynik i termin ważności', () => {
    const certyfikat = wydajCertyfikat(SCHEMAT, zamkniety, ustal(KOMPLET), 7, TERAZ);

    assert.equal(certyfikat.numer, 'PD/2026/0007');
    assert.equal(certyfikat.poziom, 'srebrny');
    assert.equal(certyfikat.wynikProcent, 75);
    assert.equal(certyfikat.wydany, '2026-09-10');
    assert.equal(certyfikat.waznyDo, '2028-09-10');
  });
});

describe('weryfikacja publiczna', () => {
  const certyfikat: Certyfikat = {
    numer: 'PD/2026/0007',
    organizationId: ORG,
    audytId: 'a-1',
    poziom: 'srebrny',
    wynikProcent: 75,
    wydany: '2026-09-10',
    waznyDo: '2028-09-10',
    status: 'wazny',
  };

  test('nieznany numer daje jednoznaczną odpowiedź', () => {
    const wynik = zweryfikuj([certyfikat], 'PD/2026/9999', '2026-10-01');
    assert.equal(wynik.znaleziony, false);
    assert.equal(wynik.poziom, undefined);
  });

  test('ważny certyfikat', () => {
    const wynik = zweryfikuj([certyfikat], 'PD/2026/0007', '2027-01-01');
    assert.equal(wynik.status, 'wazny');
    assert.equal(wynik.poziom, 'srebrny');
  });

  test('po terminie status zmienia się bez ingerencji', () => {
    const wynik = zweryfikuj([certyfikat], 'PD/2026/0007', '2028-09-11');
    assert.equal(wynik.status, 'wygasly');
  });

  test('cofnięcie ma pierwszeństwo przed terminem', () => {
    const wynik = zweryfikuj([{ ...certyfikat, status: 'cofniety' }], 'PD/2026/0007', '2027-01-01');
    assert.equal(wynik.status, 'cofniety');
  });

  test('weryfikacja nie ujawnia ustaleń z audytu', () => {
    const wynik = zweryfikuj([certyfikat], 'PD/2026/0007', '2027-01-01');
    const serialized = JSON.stringify(wynik);

    assert.ok(!serialized.includes('ergonomia'));
    assert.ok(!serialized.includes('a-1'));
    assert.ok(!serialized.includes(ORG));
  });
});

describe('mapowanie na ESRS', () => {
  test('zestawienie grupuje kryteria po wskaźniku', () => {
    const zestawienie = wgESRS(SCHEMAT, ustal(KOMPLET));
    const s114 = zestawienie.find((pozycja) => pozycja.wskaznik === 'S1-14');

    assert.equal(s114?.wszystkie, 2);
    assert.equal(s114?.spelnione, 2);
  });

  test('kryteria bez wskaźnika i „nie dotyczy" są pomijane', () => {
    const zestawienie = wgESRS(SCHEMAT, ustal([
      { kryteriumId: 'e1', ocena: 'nie_dotyczy' },
      { kryteriumId: 'r1', ocena: 'spelnione' },
    ]));

    assert.deepEqual(zestawienie, []);
  });
});
