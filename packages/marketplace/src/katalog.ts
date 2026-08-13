/**
 * Katalog ofert.
 *
 * Trzy reguły widoczności:
 *
 * 1. **Partner bez podpisanej umowy nie istnieje w katalogu.** Negocjacje
 *    i zawieszenie to stany robocze; oferta widoczna w trakcie negocjacji
 *    obiecuje uczestnikowi coś, czego nikt jeszcze nie gwarantuje.
 *
 * 2. **Prowizja jest ujawniona przy każdej ofercie.** Uczestnik ma wiedzieć,
 *    że program zarabia na jego zakupie. Ukrycie tego jest tym rodzajem
 *    przemilczenia, po którym cały program przestaje być wiarygodny.
 *
 * 3. **Ocena zdrowia nie dobiera ofert.** Funkcje w tym pliku nie przyjmują
 *    `Assessment` — poza `ostrzezeniaOferty`, które może wyłącznie ostrzec.
 *    Nie ma tu żadnej ścieżki, którą czerwona flaga podbijałaby sprzedaż.
 */

import type { Assessment } from '@longevity/core';

import type { KategoriaPartnera, Oferta, Partner } from './types.ts';

export const KATEGORIE: readonly KategoriaPartnera[] = [
  'diagnostyka',
  'sport',
  'zywienie',
  'suplementy',
  'regeneracja',
  'sprzet',
];

export const OPIS_KATEGORII: Readonly<Record<KategoriaPartnera, string>> = {
  diagnostyka: 'Diagnostyka',
  sport: 'Sport i ruch',
  zywienie: 'Żywienie',
  suplementy: 'Suplementy',
  regeneracja: 'Regeneracja',
  sprzet: 'Sprzęt',
};

export function widoczniPartnerzy(partnerzy: readonly Partner[]): readonly Partner[] {
  return partnerzy.filter((partner) => partner.statusUmowy === 'podpisana');
}

export interface FiltrOfert {
  kategoria?: KategoriaPartnera;
  pakiet?: string;
}

export interface PozycjaKatalogu {
  oferta: Oferta;
  partner: Partner;
  /** Zdanie do pokazania uczestnikowi. Nie jest opcjonalne. */
  ujawnienieProwizji: string;
}

export function ujawnienieProwizji(partner: Partner): string {
  return (
    `Program otrzymuje ${partner.prowizjaPct}% prowizji od tej transakcji. ` +
    'Prowizja nie wpływa na to, co widzisz w katalogu ani na Twoją ocenę zdrowia.'
  );
}

/**
 * Oferty widoczne dla uczestnika.
 *
 * Kolejność: kategoria, potem nazwa. Świadomie nie „dopasowanie" — sortowanie
 * po trafności wymagałoby danych o osobie, a od tego zaczyna się sprzedaż
 * napędzana chorobą.
 */
export function katalogOfert(
  oferty: readonly Oferta[],
  partnerzy: readonly Partner[],
  filtr: FiltrOfert = {},
): readonly PozycjaKatalogu[] {
  const widoczni = new Map(widoczniPartnerzy(partnerzy).map((partner) => [partner.id, partner]));

  return oferty
    .flatMap((oferta) => {
      const partner = widoczni.get(oferta.partnerId);
      if (partner === undefined) return [];
      if (filtr.kategoria !== undefined && partner.kategoria !== filtr.kategoria) return [];
      if (filtr.pakiet !== undefined && !oferta.pakiety.includes(filtr.pakiet)) return [];

      return [{ oferta, partner, ujawnienieProwizji: ujawnienieProwizji(partner) }];
    })
    .sort((a, b) =>
      a.partner.kategoria === b.partner.kategoria
        ? a.oferta.nazwa.localeCompare(b.oferta.nazwa, 'pl-PL')
        : a.partner.kategoria.localeCompare(b.partner.kategoria, 'pl-PL'),
    );
}

export interface OstrzezenieOferty {
  kod: string;
  tresc: string;
}

/**
 * Jedyne miejsce w tym pakiecie, które w ogóle widzi ocenę zdrowia — i jedyne
 * możliwe działanie to ostrzeżenie. Funkcja nie zwraca niczego, czym dałoby się
 * posortować katalog.
 */
export function ostrzezeniaOferty(
  oferta: Oferta,
  ocena: Assessment,
): readonly OstrzezenieOferty[] {
  const przeciwwskazania = oferta.przeciwwskazania ?? [];
  if (przeciwwskazania.length === 0) return [];

  return ocena.flags
    .filter((flaga) => przeciwwskazania.includes(flaga.code))
    .map((flaga) => ({
      kod: flaga.code,
      tresc: `${flaga.message} Skonsultuj tę usługę z lekarzem przed skorzystaniem.`,
    }));
}

export function ofertaPoId(oferty: readonly Oferta[], id: string): Oferta | undefined {
  return oferty.find((oferta) => oferta.id === id);
}

export function partnerPoId(partnerzy: readonly Partner[], id: string): Partner | undefined {
  return partnerzy.find((partner) => partner.id === id);
}
