/**
 * Marketplace — dane demonstracyjne, PROTOTYP.
 *
 * W produkcji partnerzy i oferty pochodzą z bazy „Partnerzy marketplace"
 * w Notion (@longevity/notion-sync). Partner w negocjacjach jest tu celowo:
 * bez niego nie widać, że katalog go nie pokazuje.
 */

import type { Oferta, Partner } from '@longevity/marketplace';

import { NOW } from './config.ts';

export const PARTNERZY: readonly Partner[] = [
  {
    id: 'p-lab',
    nazwa: 'Laboratorium Alfa',
    kategoria: 'diagnostyka',
    opis: 'Sieć punktów pobrań w całym mieście.',
    url: 'https://example.org/lab-alfa',
    prowizjaPct: 10,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-klub',
    nazwa: 'Klub Ruchu Beta',
    kategoria: 'sport',
    opis: 'Zajęcia grupowe i siłownia.',
    prowizjaPct: 15,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-spa',
    nazwa: 'Strefa Regeneracji',
    kategoria: 'regeneracja',
    opis: 'Sauna, masaż, krioterapia.',
    prowizjaPct: 12,
    statusUmowy: 'podpisana',
  },
  {
    // Umowa w negocjacjach — oferta nie pojawi się w katalogu.
    id: 'p-suple',
    nazwa: 'Suplementy Gamma',
    kategoria: 'suplementy',
    opis: 'Producent suplementów diety.',
    prowizjaPct: 25,
    statusUmowy: 'negocjacje',
  },
];

export const OFERTY: readonly Oferta[] = [
  {
    id: 'o-panel',
    partnerId: 'p-lab',
    nazwa: 'Panel Bazowy Longevity',
    opis: 'Pakiet badań zgodny z Panelem Bazowym programu.',
    cenaNettoGr: 39_000,
    stawkaVat: 'zw',
    pakiety: ['light', 'pro', 'enterprise'],
  },
  {
    id: 'o-sklad',
    partnerId: 'p-lab',
    nazwa: 'Analiza składu ciała',
    opis: 'Pomiar bioimpedancyjny z omówieniem wyniku.',
    cenaNettoGr: 9_000,
    stawkaVat: '23',
    pakiety: ['light', 'pro', 'enterprise'],
  },
  {
    id: 'o-karnet',
    partnerId: 'p-klub',
    nazwa: 'Karnet miesięczny',
    opis: 'Wejścia bez limitu, zajęcia grupowe w cenie.',
    cenaNettoGr: 14_900,
    stawkaVat: '23',
    pakiety: ['pro', 'enterprise'],
  },
  {
    id: 'o-sauna',
    partnerId: 'p-spa',
    nazwa: 'Karnet na saunę',
    opis: 'Dziesięć wejść, sauna fińska i parowa.',
    cenaNettoGr: 24_000,
    stawkaVat: '23',
    pakiety: ['pro', 'enterprise'],
    // Sauna przy nadciśnieniu i podejrzeniu bezdechu wymaga rozmowy z lekarzem.
    przeciwwskazania: ['FLAG_HYPERTENSION', 'FLAG_APNEA_SUSPECT'],
  },
  {
    id: 'o-suple',
    partnerId: 'p-suple',
    nazwa: 'Zestaw witamin',
    opis: 'Oferta partnera w negocjacjach.',
    cenaNettoGr: 12_000,
    stawkaVat: '23',
    pakiety: ['light', 'pro', 'enterprise'],
  },
];

/** Wyprowadzone z NOW — inaczej zmiana daty prototypu rozjeżdża demo. */
export const TERAZ_MARKETPLACE = NOW.toISOString();
