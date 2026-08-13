import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatPln } from '@longevity/billing';
import type { Assessment, RedFlag, RiskCategory } from '@longevity/core';

import {
  anuluj,
  assertBezDanychOsobowych,
  DaneOsoboweWLadunkuError,
  KATEGORIE,
  katalogOfert,
  ladunekDlaPartnera,
  NieaktywnyPartnerError,
  OPIS_KATEGORII,
  ostrzezeniaOferty,
  oznaczZrealizowane,
  rozliczOkres,
  rozliczPartnera,
  ujawnienieProwizji,
  widoczniPartnerzy,
  zloz,
  ZlyStatusZamowieniaError,
  type KategoriaPartnera,
  type Oferta,
  type Partner,
} from '../src/index.ts';

const TERAZ = '2026-10-12T10:00:00.000Z';

const partner = (nadpisania: Partial<Partner> = {}): Partner => ({
  id: 'p-lab',
  nazwa: 'Laboratorium Alfa',
  kategoria: 'diagnostyka',
  opis: 'Sieć punktów pobrań.',
  prowizjaPct: 10,
  statusUmowy: 'podpisana',
  ...nadpisania,
});

const oferta = (nadpisania: Partial<Oferta> = {}): Oferta => ({
  id: 'o-panel',
  partnerId: 'p-lab',
  nazwa: 'Panel Bazowy Longevity',
  opis: 'Pakiet badań z Panelu Bazowego.',
  cenaNettoGr: 39_000,
  stawkaVat: 'zw',
  pakiety: ['light', 'pro', 'enterprise'],
  ...nadpisania,
});

function flaga(code: string): RedFlag {
  return { code, level: 'ŻÓŁTA', message: `Komunikat dla ${code}.`, rulesetVersion: '0.1.0-draft' };
}

function ocena(flags: readonly RedFlag[] = [], riskCategory: RiskCategory = 'ZIELONA'): Assessment {
  return {
    derived: { bmi: 24, bmr: 1600, tdee: 2200 },
    flags,
    riskCategory,
    healthScore: { overall: 70, components: [], scoringVersion: '1.0.0' },
    generatePlan: true,
    constraints: [],
    rulesetVersion: '0.1.0-draft',
    mode: 'synthetic',
  };
}

describe('widoczność partnerów', () => {
  test('tylko podpisana umowa wpuszcza partnera do katalogu', () => {
    const wszyscy = [
      partner(),
      partner({ id: 'p-neg', statusUmowy: 'negocjacje' }),
      partner({ id: 'p-zaw', statusUmowy: 'zawieszona' }),
    ];

    assert.deepEqual(
      widoczniPartnerzy(wszyscy).map((pozycja) => pozycja.id),
      ['p-lab'],
    );
  });

  test('oferta partnera w negocjacjach nie trafia do katalogu', () => {
    const katalog = katalogOfert(
      [oferta(), oferta({ id: 'o-inna', partnerId: 'p-neg' })],
      [partner(), partner({ id: 'p-neg', statusUmowy: 'negocjacje' })],
    );

    assert.deepEqual(
      katalog.map((pozycja) => pozycja.oferta.id),
      ['o-panel'],
    );
  });

  test('filtr pakietu odcina oferty spoza planu uczestnika', () => {
    const katalog = katalogOfert(
      [oferta(), oferta({ id: 'o-prime', pakiety: ['prime'] })],
      [partner()],
      { pakiet: 'pro' },
    );

    assert.deepEqual(
      katalog.map((pozycja) => pozycja.oferta.id),
      ['o-panel'],
    );
  });

  test('każda kategoria ma nazwę do pokazania', () => {
    const pelne: Record<KategoriaPartnera, true> = {
      diagnostyka: true,
      sport: true,
      zywienie: true,
      suplementy: true,
      regeneracja: true,
      sprzet: true,
    };

    for (const kategoria of Object.keys(pelne) as KategoriaPartnera[]) {
      assert.ok(OPIS_KATEGORII[kategoria].length > 0, kategoria);
      assert.ok(KATEGORIE.includes(kategoria));
    }
  });
});

describe('prowizja jest jawna', () => {
  test('każda pozycja katalogu niesie zdanie o prowizji', () => {
    const katalog = katalogOfert([oferta()], [partner()]);

    assert.equal(katalog.length, 1);
    assert.match(katalog[0]!.ujawnienieProwizji, /10% prowizji/);
  });

  test('ujawnienie mówi też, że prowizja nie wpływa na dobór', () => {
    assert.match(ujawnienieProwizji(partner()), /nie wpływa na to, co widzisz/);
  });
});

describe('dane zdrowotne nie napędzają sprzedaży', () => {
  test('katalog nie zmienia się wraz z oceną — bo jej nie widzi', () => {
    // Regułę wymusza sygnatura: `katalogOfert` nie przyjmuje oceny. Test
    // sprawdza, że nie da się jej przemycić także w czasie wykonania —
    // przekazana bokiem nie ma żadnego wpływu na wynik.
    const wejscie = [oferta(), oferta({ id: 'o-b', nazwa: 'Sauna' })];
    const bezOceny = katalogOfert(wejscie, [partner()]);

    const zOcena = (katalogOfert as unknown as (...args: unknown[]) => unknown)(
      wejscie,
      [partner()],
      {},
      ocena([flaga('FLAG_HYPERTENSION')], 'CZERWONA'),
    );

    assert.deepEqual(zOcena, bezOceny);
  });

  test('sortowanie jest po kategorii i nazwie, nie po dopasowaniu', () => {
    const katalog = katalogOfert(
      [
        oferta({ id: 'o-z', nazwa: 'Zestaw wagowy', partnerId: 'p-sprzet' }),
        oferta({ id: 'o-a', nazwa: 'Analiza składu ciała' }),
      ],
      [partner(), partner({ id: 'p-sprzet', kategoria: 'sprzet' })],
    );

    assert.deepEqual(
      katalog.map((pozycja) => pozycja.oferta.id),
      ['o-a', 'o-z'],
    );
  });

  test('ocena może wyłącznie ostrzec', () => {
    const sauna = oferta({ id: 'o-sauna', nazwa: 'Sauna', przeciwwskazania: ['FLAG_HYPERTENSION'] });

    const zFlaga = ostrzezeniaOferty(sauna, ocena([flaga('FLAG_HYPERTENSION')]));
    assert.equal(zFlaga.length, 1);
    assert.match(zFlaga[0]!.tresc, /Skonsultuj/);

    assert.deepEqual(ostrzezeniaOferty(sauna, ocena([flaga('FLAG_CRP_HIGH')])), []);
    assert.deepEqual(ostrzezeniaOferty(oferta(), ocena([flaga('FLAG_HYPERTENSION')])), []);
  });

  test('ostrzeżenie nie usuwa oferty z katalogu', () => {
    const sauna = oferta({ id: 'o-sauna', przeciwwskazania: ['FLAG_HYPERTENSION'] });
    const katalog = katalogOfert([sauna], [partner()]);

    assert.equal(katalog.length, 1);
  });
});

describe('zamówienie', () => {
  test('prowizja liczona przy złożeniu i zamrożona na zamówieniu', () => {
    const zamowienie = zloz(oferta(), partner(), 'psd-8fa2', TERAZ);

    assert.equal(zamowienie.kwotaNettoGr, 39_000);
    assert.equal(zamowienie.prowizjaPct, 10);
    assert.equal(zamowienie.prowizjaGr, 3_900);
    assert.equal(formatPln(zamowienie.prowizjaGr), '39,00 zł');
  });

  test('zmiana stawki w umowie nie przelicza starego zamówienia', () => {
    const stare = zloz(oferta(), partner({ prowizjaPct: 10 }), 'psd-8fa2', TERAZ);
    const nowe = zloz(oferta(), partner({ prowizjaPct: 15 }), 'psd-8fa2', TERAZ);

    assert.equal(stare.prowizjaGr, 3_900);
    assert.equal(nowe.prowizjaGr, 5_850);
  });

  test('partner bez podpisanej umowy nie przyjmuje zamówienia', () => {
    assert.throws(
      () => zloz(oferta(), partner({ statusUmowy: 'zawieszona' }), 'psd-8fa2', TERAZ),
      NieaktywnyPartnerError,
    );
  });

  test('zrealizowanego zamówienia nie da się anulować', () => {
    const zrealizowane = oznaczZrealizowane(zloz(oferta(), partner(), 'psd-8fa2', TERAZ), TERAZ);

    assert.throws(() => anuluj(zrealizowane, 'pomyłka', TERAZ), ZlyStatusZamowieniaError);
  });

  test('anulowanie zapisuje powód, gdy podany', () => {
    const anulowane = anuluj(zloz(oferta(), partner(), 'psd-8fa2', TERAZ), '  rezygnacja  ', TERAZ);

    assert.equal(anulowane.status, 'anulowane');
    assert.equal(anulowane.powodAnulowania, 'rezygnacja');
  });
});

describe('ładunek dla partnera', () => {
  const zamowienie = zloz(oferta(), partner(), 'psd-8fa2', TERAZ);

  test('zawiera pseudonim i przedmiot, nic więcej', () => {
    const ladunek = ladunekDlaPartnera(zamowienie, oferta());

    assert.deepEqual(Object.keys(ladunek).sort(), [
      'kodOdbioru',
      'kwotaNettoGr',
      'pozycja',
      'stawkaVat',
      'zamowienieId',
      'zlozone',
    ]);
    assert.equal(ladunek.kodOdbioru, 'psd-8fa2');
  });

  test('nie zawiera nic o zdrowiu ani o pracodawcy', () => {
    const tekst = JSON.stringify(ladunekDlaPartnera(zamowienie, oferta()));

    for (const zakazane of ['organizationId', 'healthScore', 'kategoriaRyzyka', 'FLAG_']) {
      assert.equal(tekst.includes(zakazane), false, zakazane);
    }
  });

  test('skaner odrzuca tożsamość i adres e-mail', () => {
    assert.throws(
      () => assertBezDanychOsobowych({ nazwisko: 'Kowalska' }),
      DaneOsoboweWLadunkuError,
    );
    assert.throws(
      () => assertBezDanychOsobowych({ notatka: 'kontakt: anna@example.org' }),
      DaneOsoboweWLadunkuError,
    );
    assert.throws(
      () => assertBezDanychOsobowych({ organizationId: 'org-alfa' }),
      DaneOsoboweWLadunkuError,
    );
  });

  test('data zamówienia jest dozwolona', () => {
    // Odstępstwo od skanera ładunku dla modelu: tam data urodzenia była zbędna,
    // tu data transakcji jest jej treścią, a bez tożsamości nikogo nie wskazuje.
    assert.doesNotThrow(() => assertBezDanychOsobowych({ zlozone: '2026-10-12' }));
  });
});

describe('rozliczenie prowizji', () => {
  const zrealizowane = (id: string, kwota: number, kiedy = '2026-10-12T10:00:00.000Z') =>
    oznaczZrealizowane(
      zloz(oferta({ id, cenaNettoGr: kwota }), partner(), 'psd-8fa2', kiedy),
      kiedy,
    );

  test('faktura obejmuje wyłącznie zamówienia zrealizowane', () => {
    const zamowienia = [
      zrealizowane('o-1', 39_000),
      zloz(oferta({ id: 'o-2' }), partner(), 'psd-8fa2', TERAZ),
      anuluj(zloz(oferta({ id: 'o-3' }), partner(), 'psd-8fa2', TERAZ), 'rezygnacja', TERAZ),
    ];

    const faktura = rozliczPartnera(partner(), zamowienia, { okres: '2026-10', stawkaVat: '23' });

    assert.equal(faktura.pozycje.length, 1);
    assert.equal(faktura.pominietych, 2);
    assert.equal(faktura.nettoGr, 3_900);
  });

  test('VAT liczony od sumy prowizji', () => {
    const faktura = rozliczPartnera(partner(), [zrealizowane('o-1', 100_000)], {
      okres: '2026-10',
      stawkaVat: '23',
    });

    assert.equal(faktura.nettoGr, 10_000);
    assert.equal(faktura.vatGr, 2_300);
    assert.equal(faktura.bruttoGr, 12_300);
  });

  test('zamówienie z innego miesiąca nie wchodzi do faktury', () => {
    const faktura = rozliczPartnera(
      partner(),
      [zrealizowane('o-1', 39_000, '2026-09-30T10:00:00.000Z')],
      { okres: '2026-10', stawkaVat: '23' },
    );

    assert.equal(faktura.pozycje.length, 0);
  });

  test('faktura nie zawiera pseudonimów uczestników', () => {
    // Partner zna swoich klientów z własnego systemu. Faktura ma pokazać
    // podstawę kwoty, a nie budować listę klientów programu.
    const faktura = rozliczPartnera(partner(), [zrealizowane('o-1', 39_000)], {
      okres: '2026-10',
      stawkaVat: '23',
    });

    assert.equal(JSON.stringify(faktura).includes('psd-'), false);
    for (const pozycja of faktura.pozycje) {
      assert.deepEqual(Object.keys(pozycja).sort(), [
        'podstawaNettoGr',
        'prowizjaGr',
        'prowizjaPct',
        'zamowienieId',
      ]);
    }
  });

  test('okres bez zamówień nie tworzy faktury na zero', () => {
    const podsumowanie = rozliczOkres([partner()], [], { okres: '2026-10', stawkaVat: '23' });

    assert.deepEqual(podsumowanie.faktury, []);
    assert.equal(podsumowanie.lacznieNettoGr, 0);
  });

  test('podsumowanie sumuje faktury wielu partnerów', () => {
    const drugi = partner({ id: 'p-sport', nazwa: 'Klub Beta', kategoria: 'sport', prowizjaPct: 20 });
    const zamowienia = [
      zrealizowane('o-1', 100_000),
      oznaczZrealizowane(
        zloz(oferta({ id: 'o-2', partnerId: 'p-sport', cenaNettoGr: 50_000 }), drugi, 'psd-1', TERAZ),
        TERAZ,
      ),
    ];

    const podsumowanie = rozliczOkres([partner(), drugi], zamowienia, {
      okres: '2026-10',
      stawkaVat: '23',
    });

    assert.equal(podsumowanie.faktury.length, 2);
    assert.equal(podsumowanie.lacznieNettoGr, 10_000 + 10_000);
  });
});
