import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  dopasujProg,
  formatPln,
  koniecOkresu,
  LINIE,
  MoneyError,
  obowiazujacaPozycja,
  percentOf,
  podsumujPrzebieg,
  rozlicz,
  vatAmount,
  assertGrosze,
  type Obciazenie,
  type PozycjaKatalogu,
  type ProgZfss,
  type Uczestnik,
} from '../src/index.ts';

const ORG = 'org-x';

const KATALOG: PozycjaKatalogu[] = [
  { kod: 'pro-a', nazwa: 'Pakiet Pro — ryczałt', cenaNettoGr: 12_000, vat: 'zw', linia: 'A', obowiazujeOd: '2026-01-01' },
  { kod: 'klub-b', nazwa: 'Karnet klubowy', cenaNettoGr: 20_000, vat: '8', linia: 'B', obowiazujeOd: '2026-01-01' },
  { kod: 'med-c', nazwa: 'Pakiet diagnostyczny', cenaNettoGr: 45_000, vat: '23', linia: 'C', obowiazujeOd: '2026-01-01' },
  { kod: 'gmina-g', nazwa: 'Warsztat gminny', cenaNettoGr: 80_000, vat: '0', linia: 'G', obowiazujeOd: '2026-01-01' },
  { kod: 'prow-m', nazwa: 'Prowizja marketplace', cenaNettoGr: 5_000, vat: '23', linia: 'M', obowiazujeOd: '2026-01-01' },
];

const PROGI: ProgZfss[] = [
  { organizationId: ORG, progDochodowyGr: 300_000, doplataPct: 80, obowiazujeOd: '2026-01-01' },
  { organizationId: ORG, progDochodowyGr: 500_000, doplataPct: 50, obowiazujeOd: '2026-01-01' },
  { organizationId: ORG, progDochodowyGr: 800_000, doplataPct: 20, obowiazujeOd: '2026-01-01' },
];

const UCZESTNICY: Uczestnik[] = [
  { participantId: 'u-1', organizationId: ORG, dochodGr: 250_000 },
  { participantId: 'u-2', organizationId: ORG, dochodGr: 600_000 },
  { participantId: 'u-3', organizationId: ORG, dochodGr: 1_200_000 },
];

const obciazenie = (participantId: string, kod: string, ilosc = 1): Obciazenie => ({
  participantId,
  organizationId: ORG,
  kodPozycji: kod,
  ilosc,
});

function przebieg(obciazenia: Obciazenie[], okres = '2026-09') {
  return rozlicz({ okres, obciazenia, katalog: KATALOG, uczestnicy: UCZESTNICY, progiZfss: PROGI });
}

describe('arytmetyka na groszach', () => {
  test('kwoty muszą być całkowite', () => {
    assert.throws(() => assertGrosze(12.5), MoneyError);
    assert.throws(() => assertGrosze(-100), MoneyError);
    assert.equal(assertGrosze(12_345), 12_345);
  });

  test('VAT liczony i zaokrąglany do grosza', () => {
    assert.equal(vatAmount(10_000, '23'), 2_300);
    assert.equal(vatAmount(3_333, '23'), 767);
    assert.equal(vatAmount(10_000, '8'), 800);
  });

  test('zwolnienie i stawka zerowa dają zerowy podatek', () => {
    assert.equal(vatAmount(99_999, 'zw'), 0);
    assert.equal(vatAmount(99_999, '0'), 0);
  });

  test('sumowanie pozycji nie gubi groszy', () => {
    // Klasyczna pułapka liczb zmiennoprzecinkowych: 0,1 + 0,2 ≠ 0,3.
    const pozycje = Array.from({ length: 1000 }, () => vatAmount(1_007, '23'));
    assert.equal(pozycje.reduce((a, b) => a + b, 0), 232_000);
  });

  test('połówka grosza zaokrąglana w górę', () => {
    // 10 gr przy stawce 5% to dokładnie pół grosza podatku. Mnożenie przez
    // ułamek dziesiętny potrafi tu dać 0,49999… i zaokrąglić w dół.
    assert.equal(vatAmount(10, '5'), 1);
    assert.equal(vatAmount(30, '5'), 2);
  });

  test('podatek liczony od pozycji, nie od sumy dokumentu', () => {
    // Trzy pozycje po 1007 gr: 3 × 232 = 696, podczas gdy podatek od sumy
    // 3021 gr wyniósłby 695. Różnica jest realna i wybór musi być jawny.
    const odPozycji = 3 * vatAmount(1_007, '23');
    const odSumy = vatAmount(3 * 1_007, '23');
    assert.equal(odPozycji, 696);
    assert.equal(odSumy, 695);
  });

  test('udział procentowy zaokrąglany do grosza', () => {
    assert.equal(percentOf(10_001, 50), 5_001);
    assert.throws(() => percentOf(100, 150), MoneyError);
  });

  test('formatowanie kwoty', () => {
    assert.equal(formatPln(123_456), '1234,56 zł');
    assert.equal(formatPln(5), '0,05 zł');
  });
});

describe('cennik z datami obowiązywania', () => {
  const zPodwyzka: PozycjaKatalogu[] = [
    ...KATALOG,
    { kod: 'pro-a', nazwa: 'Pakiet Pro — ryczałt', cenaNettoGr: 14_000, vat: 'zw', linia: 'A', obowiazujeOd: '2026-09-01' },
  ];

  test('sierpień bierze cenę sprzed podwyżki', () => {
    assert.equal(obowiazujacaPozycja(zPodwyzka, 'pro-a', '2026-08-31')?.cenaNettoGr, 12_000);
  });

  test('wrzesień bierze cenę po podwyżce', () => {
    assert.equal(obowiazujacaPozycja(zPodwyzka, 'pro-a', '2026-09-30')?.cenaNettoGr, 14_000);
  });

  test('pozycja spoza katalogu nie istnieje', () => {
    assert.equal(obowiazujacaPozycja(KATALOG, 'nieistniejaca', '2026-09-30'), undefined);
  });

  test('koniec okresu liczony poprawnie, także dla lutego', () => {
    assert.equal(koniecOkresu('2026-09'), '2026-09-30');
    assert.equal(koniecOkresu('2026-02'), '2026-02-28');
    assert.equal(koniecOkresu('2028-02'), '2028-02-29');
    assert.throws(() => koniecOkresu('2026-13'));
  });
});

describe('progi ZFŚS', () => {
  test('uczestnik trafia do pierwszego progu, którego nie przekracza', () => {
    assert.equal(dopasujProg(PROGI, ORG, 250_000, '2026-09-30')?.doplataPct, 80);
    assert.equal(dopasujProg(PROGI, ORG, 400_000, '2026-09-30')?.doplataPct, 50);
    assert.equal(dopasujProg(PROGI, ORG, 700_000, '2026-09-30')?.doplataPct, 20);
  });

  test('dochód dokładnie na progu należy do tego progu', () => {
    assert.equal(dopasujProg(PROGI, ORG, 300_000, '2026-09-30')?.doplataPct, 80);
  });

  test('dochód powyżej wszystkich progów daje najniższą dopłatę', () => {
    assert.equal(dopasujProg(PROGI, ORG, 5_000_000, '2026-09-30')?.doplataPct, 20);
  });

  test('progi innej organizacji nie mają zastosowania', () => {
    assert.equal(dopasujProg(PROGI, 'org-y', 250_000, '2026-09-30'), undefined);
  });

  test('nowsza tabela progów zastępuje starszą w całości', () => {
    const zNowa: ProgZfss[] = [
      ...PROGI,
      { organizationId: ORG, progDochodowyGr: 400_000, doplataPct: 90, obowiazujeOd: '2026-07-01' },
    ];
    // Od lipca obowiązuje wyłącznie nowy zestaw — stare progi nie dokładają się.
    assert.equal(dopasujProg(zNowa, ORG, 250_000, '2026-09-30')?.doplataPct, 90);
    assert.equal(dopasujProg(zNowa, ORG, 250_000, '2026-06-30')?.doplataPct, 80);
  });
});

describe('dobór dokumentu z linii finansowej', () => {
  test('każda linia ma jeden typ dokumentu i jednego odbiorcę', () => {
    assert.equal(LINIE.A.dokument, 'nota_zbiorcza');
    assert.equal(LINIE.B.dokument, 'nota_imienna');
    assert.equal(LINIE.C.dokument, 'faktura');
    assert.equal(LINIE.G.dokument, 'rozliczenie_grantowe');
    assert.equal(LINIE.M.dokument, 'faktura_prowizyjna');
  });

  test('typ wynika z pozycji katalogu, nie z obciążenia', () => {
    const wynik = przebieg([obciazenie('u-1', 'med-c')]);
    assert.equal(wynik.dokumenty[0]?.typ, 'faktura');
    assert.equal(wynik.dokumenty[0]?.linia, 'C');
  });

  test('obciążenia z różnych linii nie trafiają na jeden dokument', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'pro-a'),
      obciazenie('u-1', 'med-c'),
      obciazenie('u-1', 'prow-m'),
    ]);

    assert.equal(wynik.dokumenty.length, 3);
    assert.deepEqual(
      wynik.dokumenty.map((d) => d.linia).sort(),
      ['A', 'C', 'M'],
    );
  });
});

describe('linia A — zakaz danych imiennych', () => {
  test('nota zbiorcza podaje liczbę uczestników, nie ich listę', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'pro-a'),
      obciazenie('u-2', 'pro-a'),
      obciazenie('u-3', 'pro-a'),
    ]);

    const nota = wynik.dokumenty.find((d) => d.linia === 'A');
    assert.ok(nota);
    assert.equal(nota.typ, 'nota_zbiorcza');
    if (nota.typ === 'nota_zbiorcza') assert.equal(nota.liczbaUczestnikow, 3);
  });

  test('w serializacji noty zbiorczej nie ma żadnego identyfikatora uczestnika', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'pro-a'),
      obciazenie('u-2', 'pro-a'),
      obciazenie('u-3', 'pro-a'),
    ]);

    const nota = wynik.dokumenty.find((d) => d.linia === 'A')!;
    const serialized = JSON.stringify(nota);

    for (const uczestnik of UCZESTNICY) {
      assert.ok(!serialized.includes(uczestnik.participantId), `wyciek ${uczestnik.participantId}`);
    }
  });

  test('katalog deklaruje, że linia A nie dopuszcza danych imiennych', () => {
    assert.equal(LINIE.A.daneImienne, false);
    assert.equal(LINIE.B.daneImienne, true);
  });

  test('identyczne pozycje są scalane w jeden wiersz', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'pro-a'),
      obciazenie('u-2', 'pro-a'),
      obciazenie('u-3', 'pro-a'),
    ]);

    const nota = wynik.dokumenty.find((d) => d.linia === 'A')!;
    assert.equal(nota.pozycje.length, 1);
    assert.equal(nota.pozycje[0]?.ilosc, 3);
    assert.equal(nota.sumaNettoGr, 36_000);
  });
});

describe('linia B — noty imienne z dopłatą', () => {
  test('dopłata liczona wg progu zakładu', () => {
    const wynik = przebieg([obciazenie('u-1', 'klub-b')]);
    const nota = wynik.dokumenty.find((d) => d.linia === 'B');

    assert.ok(nota && nota.typ === 'nota_imienna');
    if (nota.typ === 'nota_imienna') {
      // 200 zł netto + 8% VAT = 216 zł brutto; dopłata 80% = 172,80 zł.
      assert.equal(nota.sumaBruttoGr, 21_600);
      assert.equal(nota.doplataPct, 80);
      assert.equal(nota.doplataGr, 17_280);
      assert.equal(nota.doZaplatyGr, 4_320);
    }
  });

  test('różne progi dają różne dopłaty dla tej samej usługi', () => {
    const wynik = przebieg([obciazenie('u-1', 'klub-b'), obciazenie('u-3', 'klub-b')]);
    const noty = wynik.dokumenty.filter((d) => d.typ === 'nota_imienna');

    assert.equal(noty.length, 2);
    const udzialy = noty.map((n) => (n.typ === 'nota_imienna' ? n.doplataPct : 0)).sort();
    assert.deepEqual(udzialy, [20, 80]);
  });

  test('dopłata i część własna sumują się do kwoty brutto', () => {
    const wynik = przebieg([obciazenie('u-2', 'klub-b', 3)]);
    const nota = wynik.dokumenty.find((d) => d.typ === 'nota_imienna');

    assert.ok(nota && nota.typ === 'nota_imienna');
    if (nota.typ === 'nota_imienna') {
      assert.equal(nota.doplataGr + nota.doZaplatyGr, nota.sumaBruttoGr);
    }
  });

  test('brak dochodu pomija notę i zgłasza ostrzeżenie', () => {
    const wynik = rozlicz({
      okres: '2026-09',
      obciazenia: [obciazenie('u-9', 'klub-b')],
      katalog: KATALOG,
      uczestnicy: [{ participantId: 'u-9', organizationId: ORG }],
      progiZfss: PROGI,
    });

    assert.equal(wynik.dokumenty.length, 0);
    assert.equal(wynik.ostrzezenia[0]?.kod, 'brak_dochodu');
  });

  test('brak progów dla organizacji pomija notę zamiast zgadywać dopłatę', () => {
    const wynik = rozlicz({
      okres: '2026-09',
      obciazenia: [obciazenie('u-1', 'klub-b')],
      katalog: KATALOG,
      uczestnicy: UCZESTNICY,
      progiZfss: [],
    });

    assert.equal(wynik.dokumenty.length, 0);
    assert.equal(wynik.ostrzezenia[0]?.kod, 'brak_progu_zfss');
  });
});

describe('utrwalanie stawki na dokumencie', () => {
  test('dokument niesie stawkę z chwili wystawienia', () => {
    const wynik = przebieg([obciazenie('u-1', 'med-c')]);
    assert.equal(wynik.dokumenty[0]?.pozycje[0]?.vat, '23');
  });

  test('późniejsza zmiana stawki w cenniku nie zmienia dokumentu z sierpnia', () => {
    const zmieniony: PozycjaKatalogu[] = [
      ...KATALOG,
      { kod: 'med-c', nazwa: 'Pakiet diagnostyczny', cenaNettoGr: 45_000, vat: 'zw', linia: 'C', obowiazujeOd: '2026-09-01' },
    ];

    const sierpien = rozlicz({
      okres: '2026-08',
      obciazenia: [obciazenie('u-1', 'med-c')],
      katalog: zmieniony,
      uczestnicy: UCZESTNICY,
      progiZfss: PROGI,
    });
    const wrzesien = rozlicz({
      okres: '2026-09',
      obciazenia: [obciazenie('u-1', 'med-c')],
      katalog: zmieniony,
      uczestnicy: UCZESTNICY,
      progiZfss: PROGI,
    });

    assert.equal(sierpien.dokumenty[0]?.pozycje[0]?.vat, '23');
    assert.equal(sierpien.dokumenty[0]?.sumaVatGr, 10_350);
    assert.equal(wrzesien.dokumenty[0]?.pozycje[0]?.vat, 'zw');
    assert.equal(wrzesien.dokumenty[0]?.sumaVatGr, 0);
  });

  test('stawka sprzed interpretacji KIS podnosi ostrzeżenie', () => {
    const wynik = rozlicz({
      okres: '2026-09',
      obciazenia: [obciazenie('u-1', 'med-c')],
      katalog: [
        { kod: 'med-c', nazwa: 'Pakiet', cenaNettoGr: 45_000, vat: 'zw', linia: 'C', obowiazujeOd: '2026-01-01', przedInterpretacja: true },
      ],
      uczestnicy: UCZESTNICY,
      progiZfss: PROGI,
    });

    assert.equal(wynik.ostrzezenia[0]?.kod, 'stawka_przed_interpretacja');
    assert.equal(wynik.dokumenty.length, 1);
  });
});

describe('przebieg rozliczeniowy', () => {
  test('numeracja jest przewidywalna i rozdzielona typem', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'klub-b'),
      obciazenie('u-2', 'klub-b'),
      obciazenie('u-1', 'med-c'),
    ]);

    const numery = wynik.dokumenty.map((d) => d.numer).sort();
    assert.deepEqual(numery, [
      'FV/2026-09/org-x/001',
      'NI/2026-09/org-x/001',
      'NI/2026-09/org-x/002',
    ]);
  });

  test('nieznana pozycja katalogu jest pomijana z odnotowaniem', () => {
    const wynik = przebieg([obciazenie('u-1', 'nieistniejaca'), obciazenie('u-1', 'med-c')]);

    assert.equal(wynik.dokumenty.length, 1);
    assert.equal(wynik.pominieteObciazenia.length, 1);
    assert.equal(wynik.ostrzezenia[0]?.kod, 'brak_pozycji');
  });

  test('suma kontrolna rozbita na linie', () => {
    const wynik = przebieg([
      obciazenie('u-1', 'pro-a'),
      obciazenie('u-1', 'med-c'),
      obciazenie('u-1', 'klub-b'),
    ]);

    const sumy = podsumujPrzebieg(wynik);
    assert.equal(sumy.A, 12_000);
    assert.equal(sumy.C, 55_350);
    assert.equal(sumy.B, 21_600);
    assert.equal(sumy.G, 0);
  });

  test('przebieg jest deterministyczny', () => {
    const obciazenia = [obciazenie('u-2', 'klub-b'), obciazenie('u-1', 'klub-b')];
    assert.deepEqual(przebieg(obciazenia), przebieg(obciazenia));
  });

  test('pusty przebieg nie tworzy dokumentów ani ostrzeżeń', () => {
    const wynik = przebieg([]);
    assert.deepEqual(wynik.dokumenty, []);
    assert.deepEqual(wynik.ostrzezenia, []);
  });
});
