/**
 * Schemat certyfikacji i audyty — dane syntetyczne.
 *
 * Schemat odwzorowuje strukturę bazy „Schemat certyfikacji" w Notion:
 * domeny z wagami, kryteria z wagą, wymogiem dowodu i mapowaniem na wskaźnik
 * ESRS S1. Centrum Audytu i Certyfikacji rozwija go tam, nie w kodzie.
 */

import type { Audyt, SchematCertyfikacji } from '@longevity/audit';

export const TERAZ = '2026-09-24T10:00:00.000Z';

export const AUDYTORZY = [
  { id: 'aud-welenc', imie: 'Paweł Welenc', organizationId: 'zaklad-polnoc' },
  { id: 'aud-druga', imie: 'Iwona Druga', organizationId: 'zaklad-polnoc' },
] as const;

export const ORGANIZACJE: Readonly<Record<string, string>> = {
  'zaklad-polnoc': 'Zakład Północ',
  'zaklad-poludnie': 'Zakład Południe',
};

export const SCHEMAT: SchematCertyfikacji = {
  id: 'pd-2026',
  wersja: '1.0.0',
  nazwa: 'Pracodawca Długowieczności',
  obowiazujeOd: '2026-01-01',
  domeny: [
    { kod: 'ergonomia', nazwa: 'Ergonomia stanowisk', waga: 3 },
    { kod: 'powietrze', nazwa: 'Jakość powietrza i oświetlenie', waga: 2 },
    { kod: 'regeneracja', nazwa: 'Strefy regeneracji', waga: 2 },
    { kod: 'organizacja', nazwa: 'Organizacja pracy', waga: 3 },
  ],
  kryteria: [
    { id: 'e1', domenaKod: 'ergonomia', tresc: 'Stanowiska z regulacją wysokości na co najmniej połowie miejsc biurowych', waga: 3, dowodWymagany: true, wskaznikESRS: 'S1-14' },
    { id: 'e2', domenaKod: 'ergonomia', tresc: 'Ocena ergonomiczna stanowisk wykonana w ostatnich 24 miesiącach', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-14' },
    { id: 'e3', domenaKod: 'ergonomia', tresc: 'Szkolenie z ergonomii dla nowych pracowników', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-13' },
    { id: 'e4', domenaKod: 'ergonomia', tresc: 'Możliwość pracy na stojąco przy stanowiskach siedzących', waga: 1, dowodWymagany: false },

    { id: 'p1', domenaKod: 'powietrze', tresc: 'Pomiar stężenia CO2 w pomieszczeniach biurowych', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-14' },
    { id: 'p2', domenaKod: 'powietrze', tresc: 'Wentylacja mechaniczna z wymianą powietrza zgodną z normą', waga: 2, dowodWymagany: true },
    { id: 'p3', domenaKod: 'powietrze', tresc: 'Natężenie oświetlenia zgodne z PN-EN 12464-1', waga: 1, dowodWymagany: true },

    { id: 'r1', domenaKod: 'regeneracja', tresc: 'Wydzielona strefa cichej pracy lub odpoczynku', waga: 2, dowodWymagany: false },
    { id: 'r2', domenaKod: 'regeneracja', tresc: 'Dostęp do wody pitnej na każdym piętrze', waga: 1, dowodWymagany: false },
    { id: 'r3', domenaKod: 'regeneracja', tresc: 'Pomieszczenie do spożywania posiłków poza stanowiskiem pracy', waga: 2, dowodWymagany: false },

    { id: 'o1', domenaKod: 'organizacja', tresc: 'Polityka przerw regeneracyjnych ujęta w regulaminie pracy', waga: 3, dowodWymagany: true, wskaznikESRS: 'S1-1' },
    { id: 'o2', domenaKod: 'organizacja', tresc: 'Możliwość elastycznego rozpoczynania pracy', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-1' },
    { id: 'o3', domenaKod: 'organizacja', tresc: 'Zakaz kontaktu służbowego poza godzinami pracy', waga: 2, dowodWymagany: true, wskaznikESRS: 'S1-1' },
    { id: 'o4', domenaKod: 'organizacja', tresc: 'Badanie satysfakcji pracowników co najmniej raz w roku', waga: 1, dowodWymagany: true, wskaznikESRS: 'S1-13' },
  ],
};

export const AUDYTY: readonly Audyt[] = [
  {
    id: 'a-polnoc-2026',
    organizationId: 'zaklad-polnoc',
    schematId: SCHEMAT.id,
    schematWersja: SCHEMAT.wersja,
    audytorId: 'aud-welenc',
    status: 'w_toku',
    rozpoczety: '2026-09-22T09:00:00.000Z',
  },
  {
    id: 'a-poludnie-2026',
    organizationId: 'zaklad-poludnie',
    schematId: SCHEMAT.id,
    schematWersja: SCHEMAT.wersja,
    audytorId: 'aud-druga',
    status: 'w_toku',
    rozpoczety: '2026-09-23T09:00:00.000Z',
  },
];

export const OCENY = [
  { wartosc: 'spelnione', etykieta: 'spełnione' },
  { wartosc: 'czesciowo', etykieta: 'częściowo' },
  { wartosc: 'niespelnione', etykieta: 'niespełnione' },
  { wartosc: 'nie_dotyczy', etykieta: 'nie dotyczy' },
] as const;

export const OPIS_POZIOMU: Readonly<Record<string, string>> = {
  zloty: 'złoty',
  srebrny: 'srebrny',
  brazowy: 'brązowy',
  brak: 'poniżej progu',
};

export function audytorPoId(id: string): (typeof AUDYTORZY)[number] | undefined {
  return AUDYTORZY.find((audytor) => audytor.id === id);
}

export function audytPoId(id: string): Audyt | undefined {
  return AUDYTY.find((audyt) => audyt.id === id);
}

export function nazwaOrganizacji(id: string): string {
  return ORGANIZACJE[id] ?? id;
}
