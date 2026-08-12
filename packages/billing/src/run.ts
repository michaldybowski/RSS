/**
 * Przebieg rozliczeniowy: obciążenia → dokumenty.
 *
 * Silnik dobiera typ dokumentu z linii finansowej pozycji katalogu, a nie
 * z ustawienia przy obciążeniu — dzięki temu nie da się wystawić faktury
 * za świadczenie finansowane z ZFŚS ani noty za usługę komercyjną.
 */

import { koniecOkresu, obowiazujacaPozycja } from './catalog.ts';
import { grossAmount, percentOf, sum, vatAmount, type Grosze } from './money.ts';
import { dopasujProg } from './zfss.ts';
import { LINIE } from './types.ts';
import type {
  Dokument,
  DokumentProsty,
  Linia,
  NotaImienna,
  NotaZbiorcza,
  Obciazenie,
  OstrzezenieRozliczenia,
  PozycjaDokumentu,
  PozycjaKatalogu,
  ProgZfss,
  Uczestnik,
  WynikRozliczenia,
} from './types.ts';

export interface PrzebiegInput {
  okres: string;
  obciazenia: readonly Obciazenie[];
  katalog: readonly PozycjaKatalogu[];
  uczestnicy: readonly Uczestnik[];
  progiZfss: readonly ProgZfss[];
}

interface Rozwiniete {
  obciazenie: Obciazenie;
  pozycja: PozycjaKatalogu;
}

export function rozlicz(input: PrzebiegInput): WynikRozliczenia {
  const wystawiono = koniecOkresu(input.okres);
  const ostrzezenia: OstrzezenieRozliczenia[] = [];
  const pominiete: Obciazenie[] = [];
  const rozwiniete: Rozwiniete[] = [];

  for (const obciazenie of input.obciazenia) {
    const pozycja = obowiazujacaPozycja(input.katalog, obciazenie.kodPozycji, wystawiono);

    if (pozycja === undefined) {
      pominiete.push(obciazenie);
      ostrzezenia.push({
        kod: 'brak_pozycji',
        komunikat: `Brak pozycji katalogu "${obciazenie.kodPozycji}" obowiązującej ${wystawiono}.`,
        kontekst: obciazenie.kodPozycji,
      });
      continue;
    }

    if (pozycja.przedInterpretacja === true) {
      ostrzezenia.push({
        kod: 'stawka_przed_interpretacja',
        komunikat: `Pozycja "${pozycja.kod}" ma stawkę ustawioną przed interpretacją KIS.`,
        kontekst: pozycja.kod,
      });
    }

    rozwiniete.push({ obciazenie, pozycja });
  }

  const dokumenty: Dokument[] = [];
  const licznik = new Map<string, number>();

  const numer = (typ: string, organizationId: string): string => {
    const klucz = `${typ}:${organizationId}`;
    const kolejny = (licznik.get(klucz) ?? 0) + 1;
    licznik.set(klucz, kolejny);
    return `${prefiks(typ)}/${input.okres}/${organizationId}/${String(kolejny).padStart(3, '0')}`;
  };

  for (const linia of ['A', 'B', 'C', 'G', 'M'] as const) {
    const wLinii = rozwiniete.filter((item) => item.pozycja.linia === linia);
    if (wLinii.length === 0) continue;

    if (linia === 'B') {
      dokumenty.push(...notyImienne(wLinii, input, wystawiono, numer, ostrzezenia));
      continue;
    }

    dokumenty.push(...zbiorcze(linia, wLinii, input.okres, wystawiono, numer));
  }

  return { okres: input.okres, dokumenty, ostrzezenia, pominieteObciazenia: pominiete };
}

function prefiks(typ: string): string {
  switch (typ) {
    case 'nota_zbiorcza':
      return 'NZ';
    case 'nota_imienna':
      return 'NI';
    case 'faktura':
      return 'FV';
    case 'rozliczenie_grantowe':
      return 'RG';
    default:
      return 'FP';
  }
}

function pozycjaDokumentu(item: Rozwiniete): PozycjaDokumentu {
  const nettoGr = item.pozycja.cenaNettoGr * item.obciazenie.ilosc;
  const vatGr = vatAmount(nettoGr, item.pozycja.vat);

  return {
    kod: item.pozycja.kod,
    nazwa: item.pozycja.nazwa,
    ilosc: item.obciazenie.ilosc,
    cenaJednostkowaNettoGr: item.pozycja.cenaNettoGr,
    nettoGr,
    vat: item.pozycja.vat,
    vatGr,
    bruttoGr: nettoGr + vatGr,
  };
}

function sumy(pozycje: readonly PozycjaDokumentu[]): {
  sumaNettoGr: Grosze;
  sumaVatGr: Grosze;
  sumaBruttoGr: Grosze;
} {
  return {
    sumaNettoGr: sum(pozycje.map((p) => p.nettoGr)),
    sumaVatGr: sum(pozycje.map((p) => p.vatGr)),
    sumaBruttoGr: sum(pozycje.map((p) => p.bruttoGr)),
  };
}

/**
 * Linie A, C, G i M rozliczane są zbiorczo per organizacja. Dokument nie ma
 * pola na uczestnika — liczy tylko, ilu ich było.
 */
function zbiorcze(
  linia: Exclude<Linia, 'B'>,
  wLinii: readonly Rozwiniete[],
  okres: string,
  wystawiono: string,
  numer: (typ: string, organizationId: string) => string,
): Dokument[] {
  const opis = LINIE[linia];
  const organizacje = [...new Set(wLinii.map((item) => item.obciazenie.organizationId))].sort();

  return organizacje.map((organizationId) => {
    const dlaOrganizacji = wLinii.filter(
      (item) => item.obciazenie.organizationId === organizationId,
    );

    const pozycje = scal(dlaOrganizacji);
    const liczbaUczestnikow = new Set(
      dlaOrganizacji.map((item) => item.obciazenie.participantId),
    ).size;

    const baza = {
      numer: numer(opis.dokument, organizationId),
      linia,
      odbiorca: opis.odbiorca,
      organizationId,
      okres,
      wystawiono,
      pozycje,
      liczbaUczestnikow,
      ...sumy(pozycje),
    };

    if (linia === 'A') {
      return { ...baza, linia: 'A', typ: 'nota_zbiorcza' } satisfies NotaZbiorcza;
    }
    return { ...baza, linia, typ: opis.dokument } as DokumentProsty;
  });
}

/** Scalanie identycznych pozycji, żeby nota nie miała stu wierszy tego samego. */
function scal(items: readonly Rozwiniete[]): PozycjaDokumentu[] {
  const wg = new Map<string, Rozwiniete[]>();

  for (const item of items) {
    const klucz = `${item.pozycja.kod}:${item.pozycja.obowiazujeOd}`;
    const lista = wg.get(klucz) ?? [];
    lista.push(item);
    wg.set(klucz, lista);
  }

  return [...wg.values()].map((grupa) => {
    const ilosc = sum(grupa.map((item) => item.obciazenie.ilosc));
    const wzor = grupa[0]!;
    return pozycjaDokumentu({ pozycja: wzor.pozycja, obciazenie: { ...wzor.obciazenie, ilosc } });
  });
}

/**
 * Linia B — nota imienna dla każdego uczestnika, z dopłatą wg progu ZFŚS
 * jego zakładu. Brak dochodu lub brak progów oznacza pominięcie: zgadywanie
 * dopłaty byłoby zgadywaniem, ile pracownik ma zapłacić.
 */
function notyImienne(
  wLinii: readonly Rozwiniete[],
  input: PrzebiegInput,
  wystawiono: string,
  numer: (typ: string, organizationId: string) => string,
  ostrzezenia: OstrzezenieRozliczenia[],
): NotaImienna[] {
  const uczestnicy = new Map(input.uczestnicy.map((osoba) => [osoba.participantId, osoba]));
  const wgUczestnika = new Map<string, Rozwiniete[]>();

  for (const item of wLinii) {
    const lista = wgUczestnika.get(item.obciazenie.participantId) ?? [];
    lista.push(item);
    wgUczestnika.set(item.obciazenie.participantId, lista);
  }

  const noty: NotaImienna[] = [];

  for (const [participantId, items] of [...wgUczestnika.entries()].sort()) {
    const uczestnik = uczestnicy.get(participantId);
    const organizationId = items[0]!.obciazenie.organizationId;

    if (uczestnik?.dochodGr === undefined) {
      ostrzezenia.push({
        kod: 'brak_dochodu',
        komunikat: 'Brak zadeklarowanego dochodu — nie da się ustalić progu dopłaty.',
        kontekst: participantId,
      });
      continue;
    }

    const prog = dopasujProg(input.progiZfss, organizationId, uczestnik.dochodGr, wystawiono);

    if (prog === undefined) {
      ostrzezenia.push({
        kod: 'brak_progu_zfss',
        komunikat: `Brak progów ZFŚS dla organizacji ${organizationId} obowiązujących ${wystawiono}.`,
        kontekst: organizationId,
      });
      continue;
    }

    const pozycje = scal(items);
    const podsumowanie = sumy(pozycje);
    const doplataGr = percentOf(podsumowanie.sumaBruttoGr, prog.doplataPct);

    noty.push({
      numer: numer('nota_imienna', organizationId),
      linia: 'B',
      typ: 'nota_imienna',
      odbiorca: 'pracownik',
      organizationId,
      participantId,
      okres: input.okres,
      wystawiono,
      pozycje,
      ...podsumowanie,
      doplataPct: prog.doplataPct,
      doplataGr,
      doZaplatyGr: podsumowanie.sumaBruttoGr - doplataGr,
    });
  }

  return noty;
}

/** Suma kontrolna przebiegu — do uzgodnienia z księgowością. */
export function podsumujPrzebieg(wynik: WynikRozliczenia): Readonly<Record<Linia, Grosze>> {
  const sumy: Record<Linia, Grosze> = { A: 0, B: 0, C: 0, G: 0, M: 0 };
  for (const dokument of wynik.dokumenty) sumy[dokument.linia] += dokument.sumaBruttoGr;
  return sumy;
}

export { grossAmount };
