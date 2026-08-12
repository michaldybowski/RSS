/**
 * Wyliczenie wyniku audytu.
 *
 * Trzy decyzje, które trzeba było podjąć jawnie:
 *
 * 1. **„Nie dotyczy" wypada z mianownika**, a nie liczy się jako zero. Zakład
 *    bez stołówki nie ma przegrywać na kryterium dotyczącym stołówki.
 * 2. **Ocena częściowa to pół punktu.** Alternatywa — zero albo jeden — zmusza
 *    audytora do zaokrąglania w głowie i znika z zapisu.
 * 3. **Domena bez ocenionych kryteriów nie wchodzi do wyniku ogólnego.** Wagi
 *    pozostałych są normalizowane, żeby suma dalej dawała sto procent.
 */

import type {
  Kryterium,
  OcenaKryterium,
  PoziomCertyfikatu,
  SchematCertyfikacji,
  Ustalenie,
  WynikAudytu,
  WynikDomeny,
} from './types.ts';

const PUNKTY: Readonly<Record<OcenaKryterium, number | null>> = {
  spelnione: 1,
  czesciowo: 0.5,
  niespelnione: 0,
  nie_dotyczy: null,
};

export const PROGI_POZIOMU: readonly { poziom: Exclude<PoziomCertyfikatu, 'brak'>; od: number }[] = [
  { poziom: 'zloty', od: 85 },
  { poziom: 'srebrny', od: 70 },
  { poziom: 'brazowy', od: 55 },
];

export function poziomDlaWyniku(wynikProcent: number): PoziomCertyfikatu {
  return PROGI_POZIOMU.find((prog) => wynikProcent >= prog.od)?.poziom ?? 'brak';
}

export function ocen(
  schemat: SchematCertyfikacji,
  ustalenia: readonly Ustalenie[],
): WynikAudytu {
  const wgKryterium = new Map(ustalenia.map((ustalenie) => [ustalenie.kryteriumId, ustalenie]));

  const bezOceny: string[] = [];
  const bezDowodu: string[] = [];
  const domeny: WynikDomeny[] = [];

  for (const domena of schemat.domeny) {
    const kryteria = schemat.kryteria.filter((kryterium) => kryterium.domenaKod === domena.kod);

    let zdobyte = 0;
    let mozliwe = 0;
    let ocenionych = 0;
    let pominietych = 0;

    for (const kryterium of kryteria) {
      const ustalenie = wgKryterium.get(kryterium.id);

      if (ustalenie === undefined) {
        bezOceny.push(kryterium.id);
        continue;
      }

      if (wymagaDowodu(kryterium, ustalenie)) bezDowodu.push(kryterium.id);

      const punkty = PUNKTY[ustalenie.ocena];
      if (punkty === null) {
        pominietych += 1;
        continue;
      }

      ocenionych += 1;
      zdobyte += punkty * kryterium.waga;
      mozliwe += kryterium.waga;
    }

    domeny.push({
      kod: domena.kod,
      nazwa: domena.nazwa,
      wynikProcent: mozliwe === 0 ? 0 : Math.round((zdobyte / mozliwe) * 100),
      ocenionych,
      pominietych,
    });
  }

  // Domeny bez ocenionych kryteriów nie wchodzą do średniej — inaczej zakład,
  // w którym cała domena jest „nie dotyczy", dostawałby za nią zero.
  const liczone = domeny.filter((domena) => domena.ocenionych > 0);
  const wagi = new Map(schemat.domeny.map((domena) => [domena.kod, domena.waga]));
  const sumaWag = liczone.reduce((total, domena) => total + (wagi.get(domena.kod) ?? 0), 0);

  const wynikProcent =
    sumaWag === 0
      ? 0
      : Math.round(
          liczone.reduce(
            (total, domena) => total + domena.wynikProcent * (wagi.get(domena.kod) ?? 0),
            0,
          ) / sumaWag,
        );

  return {
    wynikProcent,
    poziom: poziomDlaWyniku(wynikProcent),
    domeny,
    bezOceny,
    bezDowodu,
  };
}

/** Ocena pozytywna na kryterium wymagającym dowodu musi mieć załącznik. */
export function wymagaDowodu(kryterium: Kryterium, ustalenie: Ustalenie): boolean {
  if (!kryterium.dowodWymagany) return false;
  if (ustalenie.ocena !== 'spelnione' && ustalenie.ocena !== 'czesciowo') return false;
  return ustalenie.dowodKey === undefined || ustalenie.dowodKey === '';
}

/** Zestawienie wg wskaźników ESRS S1 — wejście do sprawozdawczości CSRD. */
export function wgESRS(
  schemat: SchematCertyfikacji,
  ustalenia: readonly Ustalenie[],
): readonly { wskaznik: string; spelnione: number; wszystkie: number }[] {
  const wgKryterium = new Map(ustalenia.map((ustalenie) => [ustalenie.kryteriumId, ustalenie]));
  const zestawienie = new Map<string, { spelnione: number; wszystkie: number }>();

  for (const kryterium of schemat.kryteria) {
    if (kryterium.wskaznikESRS === undefined) continue;

    const ustalenie = wgKryterium.get(kryterium.id);
    if (ustalenie === undefined || ustalenie.ocena === 'nie_dotyczy') continue;

    const wpis = zestawienie.get(kryterium.wskaznikESRS) ?? { spelnione: 0, wszystkie: 0 };
    wpis.wszystkie += 1;
    if (ustalenie.ocena === 'spelnione') wpis.spelnione += 1;
    zestawienie.set(kryterium.wskaznikESRS, wpis);
  }

  return [...zestawienie.entries()]
    .map(([wskaznik, wartosci]) => ({ wskaznik, ...wartosci }))
    .sort((a, b) => (a.wskaznik < b.wskaznik ? -1 : 1));
}
