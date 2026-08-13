/**
 * Rozliczenie prowizji — linia M z sekcji 13 specyfikacji.
 *
 * Faktura prowizyjna idzie do partnera, nie do pracodawcy i nie do uczestnika.
 * Dwie decyzje warte nazwania:
 *
 * 1. **Prowizja należy się za zamówienie zrealizowane.** Zamówienie złożone
 *    i anulowane nie generuje przychodu — fakturowanie go byłoby liczeniem
 *    pieniędzy, których nikt nie zapłacił.
 *
 * 2. **Zestawienie nie zawiera pseudonimów uczestników.** Partner zna swoje
 *    zamówienia z własnego systemu; faktura ma pokazać podstawę kwoty,
 *    a nie budować po drodze listy klientów programu. Typ pozycji nie ma
 *    pola na uczestnika — tak samo jak nota zbiorcza w rozliczeniach z ZFŚS.
 */

import { sum, vatAmount, type Grosze, type VatRate } from '@longevity/billing';

import type { Partner, Zamowienie } from './types.ts';

export interface PozycjaProwizji {
  zamowienieId: string;
  podstawaNettoGr: Grosze;
  prowizjaPct: number;
  prowizjaGr: Grosze;
}

export interface FakturaProwizyjna {
  partnerId: string;
  partnerNazwa: string;
  okres: string;
  pozycje: readonly PozycjaProwizji[];
  nettoGr: Grosze;
  stawkaVat: VatRate;
  vatGr: Grosze;
  bruttoGr: Grosze;
  /** Zamówienia pominięte, bo nie zostały zrealizowane. */
  pominietych: number;
}

export interface OpcjeRozliczenia {
  okres: string;
  /**
   * Stawka VAT usługi pośrednictwa. Parametr, nie stała — tak samo jak
   * w cenniku (decyzja 4): stawkę ustala księgowość, nie kod.
   */
  stawkaVat: VatRate;
}

function wOkresie(zamowienie: Zamowienie, okres: string): boolean {
  return (zamowienie.zrealizowane ?? '').startsWith(okres);
}

export function rozliczPartnera(
  partner: Partner,
  zamowienia: readonly Zamowienie[],
  opcje: OpcjeRozliczenia,
): FakturaProwizyjna {
  const partnera = zamowienia.filter((zamowienie) => zamowienie.partnerId === partner.id);

  const rozliczalne = partnera.filter(
    (zamowienie) => zamowienie.status === 'zrealizowane' && wOkresie(zamowienie, opcje.okres),
  );

  const pozycje: PozycjaProwizji[] = rozliczalne.map((zamowienie) => ({
    zamowienieId: zamowienie.id,
    podstawaNettoGr: zamowienie.kwotaNettoGr,
    // Stawka z zamówienia, nie bieżąca z umowy — warunki mogły się zmienić
    // po transakcji, a faktura opisuje to, co się wtedy wydarzyło.
    prowizjaPct: zamowienie.prowizjaPct,
    prowizjaGr: zamowienie.prowizjaGr,
  }));

  const nettoGr = sum(pozycje.map((pozycja) => pozycja.prowizjaGr));
  const vatGr = vatAmount(nettoGr, opcje.stawkaVat);

  return {
    partnerId: partner.id,
    partnerNazwa: partner.nazwa,
    okres: opcje.okres,
    pozycje,
    nettoGr,
    stawkaVat: opcje.stawkaVat,
    vatGr,
    bruttoGr: nettoGr + vatGr,
    pominietych: partnera.length - rozliczalne.length,
  };
}

export interface PodsumowanieProwizji {
  faktury: readonly FakturaProwizyjna[];
  lacznieNettoGr: Grosze;
  lacznieBruttoGr: Grosze;
}

export function rozliczOkres(
  partnerzy: readonly Partner[],
  zamowienia: readonly Zamowienie[],
  opcje: OpcjeRozliczenia,
): PodsumowanieProwizji {
  const faktury = partnerzy
    .map((partner) => rozliczPartnera(partner, zamowienia, opcje))
    // Faktura na zero złotych to dokument, którego nikt nie chce wystawiać
    // ani księgować.
    .filter((faktura) => faktura.pozycje.length > 0);

  return {
    faktury,
    lacznieNettoGr: sum(faktury.map((faktura) => faktura.nettoGr)),
    lacznieBruttoGr: sum(faktury.map((faktura) => faktura.bruttoGr)),
  };
}
