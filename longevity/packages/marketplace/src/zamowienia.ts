/**
 * Zamówienia i to, co trafia do partnera.
 *
 * Partner realizuje usługę i musi wiedzieć, co sprzedał i komu wydać —
 * ale „komu" znaczy tu **pseudonim albo kod odbioru**, nie człowieka.
 * Laboratorium nie potrzebuje wiedzieć, że klient jest w programie z powodu
 * podwyższonej glukozy, a sklep sportowy nie potrzebuje nazwy pracodawcy.
 *
 * Ładunek dla partnera przechodzi przez ten sam skaner nazw pól, co ładunek
 * dla modelu językowego (@longevity/model-payload) — z jednym odstępstwem
 * opisanym przy `assertBezDanychOsobowych`.
 */

import { percentOf, type Grosze } from '@longevity/billing';
import { FORBIDDEN_KEYS } from '@longevity/model-payload';

import type { Oferta, Partner, Zamowienie } from './types.ts';

export class NieaktywnyPartnerError extends Error {
  constructor(partnerId: string, status: string) {
    super(`Partner ${partnerId} ma status umowy "${status}" — zamówienie nie może powstać.`);
    this.name = 'NieaktywnyPartnerError';
  }
}

export class ZlyStatusZamowieniaError extends Error {
  constructor(status: string, oczekiwany: string) {
    super(`Zamówienie ma status "${status}", a operacja wymaga statusu "${oczekiwany}".`);
    this.name = 'ZlyStatusZamowieniaError';
  }
}

export class DaneOsoboweWLadunkuError extends Error {
  constructor(pole: string) {
    super(
      `Ładunek dla partnera zawiera pole "${pole}". Partner dostaje pseudonim ` +
        'i przedmiot zamówienia — nie tożsamość i nie pracodawcę.',
    );
    this.name = 'DaneOsoboweWLadunkuError';
  }
}

export function zloz(
  oferta: Oferta,
  partner: Partner,
  subjectRef: string,
  teraz: string,
): Zamowienie {
  if (partner.statusUmowy !== 'podpisana') {
    throw new NieaktywnyPartnerError(partner.id, partner.statusUmowy);
  }

  return {
    id: `zam-${oferta.id}-${teraz.slice(0, 10)}`,
    ofertaId: oferta.id,
    partnerId: partner.id,
    subjectRef,
    kwotaNettoGr: oferta.cenaNettoGr,
    stawkaVat: oferta.stawkaVat,
    // Stawkę prowizji zamrażamy na zamówieniu. Zmiana warunków umowy
    // w przyszłym miesiącu nie może przeliczyć transakcji sprzed zmiany.
    prowizjaPct: partner.prowizjaPct,
    prowizjaGr: percentOf(oferta.cenaNettoGr, partner.prowizjaPct),
    zlozone: teraz,
    status: 'zlozone',
  };
}

export function oznaczZrealizowane(zamowienie: Zamowienie, teraz: string): Zamowienie {
  if (zamowienie.status !== 'zlozone') {
    throw new ZlyStatusZamowieniaError(zamowienie.status, 'zlozone');
  }
  return { ...zamowienie, status: 'zrealizowane', zrealizowane: teraz };
}

export function anuluj(zamowienie: Zamowienie, powod: string, teraz: string): Zamowienie {
  if (zamowienie.status !== 'zlozone') {
    throw new ZlyStatusZamowieniaError(zamowienie.status, 'zlozone');
  }
  return {
    ...zamowienie,
    status: 'anulowane',
    anulowane: teraz,
    ...(powod.trim() !== '' ? { powodAnulowania: powod.trim() } : {}),
  };
}

export interface LadunekPartnera {
  zamowienieId: string;
  /** Kod do okazania przy odbiorze. Nie jest identyfikatorem osoby. */
  kodOdbioru: string;
  pozycja: string;
  kwotaNettoGr: Grosze;
  stawkaVat: Oferta['stawkaVat'];
  zlozone: string;
}

/**
 * Sprawdzenie nazw pól ładunku.
 *
 * Korzystamy z listy zakazanych nazw z @longevity/model-payload, ale **nie**
 * z tamtejszego wzorca zakazującego pełnych dat. Tam data urodzenia była
 * zbędna, bo wystarczał wiek. Tutaj data złożenia zamówienia jest treścią
 * transakcji, a data bez tożsamości nikogo nie wskazuje.
 */
export function assertBezDanychOsobowych(ladunek: Readonly<Record<string, unknown>>): void {
  for (const [klucz, wartosc] of Object.entries(ladunek)) {
    if (FORBIDDEN_KEYS.includes(klucz.toLowerCase())) throw new DaneOsoboweWLadunkuError(klucz);

    if (typeof wartosc === 'string') {
      if (/[\w.+-]+@[\w-]+\.[\w.]+/u.test(wartosc)) throw new DaneOsoboweWLadunkuError(klucz);
      if (/\b\d{11}\b/u.test(wartosc)) throw new DaneOsoboweWLadunkuError(klucz);
    }
  }
}

/** Co partner dostaje o zamówieniu. Nic ponad to. */
export function ladunekDlaPartnera(zamowienie: Zamowienie, oferta: Oferta): LadunekPartnera {
  const ladunek: LadunekPartnera = {
    zamowienieId: zamowienie.id,
    kodOdbioru: zamowienie.subjectRef,
    pozycja: oferta.nazwa,
    kwotaNettoGr: zamowienie.kwotaNettoGr,
    stawkaVat: zamowienie.stawkaVat,
    zlozone: zamowienie.zlozone,
  };

  assertBezDanychOsobowych(ladunek as unknown as Record<string, unknown>);
  return ladunek;
}
