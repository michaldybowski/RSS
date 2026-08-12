/**
 * Retencja (specyfikacja 12.4).
 *
 * Trzy różne punkty odniesienia, bo trzy różne podstawy: data powstania
 * rekordu, koniec uczestnictwa i koniec roku obrotowego. Liczenie wszystkiego
 * od utworzenia dawałoby usuwanie danych osoby, która wciąż jest w programie.
 */

import type { Rekord, RodzajRekordu, Uczestnictwo, ZbiorPodmiotu } from './types.ts';

export type PunktOdniesienia =
  | 'od_utworzenia'
  | 'od_zakonczenia_uczestnictwa'
  | 'od_konca_roku_obrotowego';

export type AkcjaRetencji = 'usun' | 'agreguj_dobowo';

export interface RegulaRetencji {
  rodzaj: RodzajRekordu;
  punktOdniesienia: PunktOdniesienia;
  miesiace: number;
  akcja: AkcjaRetencji;
  podstawa: string;
}

export const POLITYKA_RETENCJI: readonly RegulaRetencji[] = [
  {
    rodzaj: 'kwestionariusz',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 36,
    akcja: 'usun',
    podstawa: 'Okres przedawnienia roszczeń',
  },
  {
    rodzaj: 'plan',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 36,
    akcja: 'usun',
    podstawa: 'Okres przedawnienia roszczeń',
  },
  {
    rodzaj: 'health_score',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 36,
    akcja: 'usun',
    podstawa: 'Okres przedawnienia roszczeń',
  },
  {
    rodzaj: 'wyniki_badan',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 36,
    akcja: 'usun',
    podstawa: 'Okres przedawnienia roszczeń',
  },
  {
    rodzaj: 'dziennik_objawow',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 12,
    akcja: 'usun',
    podstawa: 'Dane o niskiej wartości dowodowej po zakończeniu programu',
  },
  {
    // Nie usuwamy, tylko agregujemy do poziomu dobowego. Trend aktywności
    // ma wartość dla uczestnika także po dwóch latach; minutowe próbki tętna nie.
    rodzaj: 'wearables_surowe',
    punktOdniesienia: 'od_utworzenia',
    miesiace: 24,
    akcja: 'agreguj_dobowo',
    podstawa: 'Minimalizacja — surowe próbki tracą użyteczność',
  },
  {
    rodzaj: 'zgoda',
    punktOdniesienia: 'od_zakonczenia_uczestnictwa',
    miesiace: 36,
    akcja: 'usun',
    podstawa: 'Dowód legalności przetwarzania w okresie przedawnienia',
  },
  {
    rodzaj: 'audit_log',
    punktOdniesienia: 'od_utworzenia',
    miesiace: 60,
    akcja: 'usun',
    podstawa: 'Rozliczalność przetwarzania',
  },
  {
    rodzaj: 'dokument_ksiegowy',
    punktOdniesienia: 'od_konca_roku_obrotowego',
    miesiace: 60,
    akcja: 'usun',
    podstawa: 'Ustawa o rachunkowości',
  },
];

export function regulaDla(rodzaj: RodzajRekordu): RegulaRetencji | undefined {
  return POLITYKA_RETENCJI.find((regula) => regula.rodzaj === rodzaj);
}

function dodajMiesiace(data: string, miesiace: number): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number) as [number, number, number];
  const wynik = new Date(Date.UTC(rok, miesiac - 1 + miesiace, dzien));
  return wynik.toISOString().slice(0, 10);
}

function koniecRokuObrotowego(data: string): string {
  return `${data.slice(0, 4)}-12-31`;
}

/**
 * Data, po której rekord podlega działaniu retencyjnemu.
 * `undefined` oznacza, że zegar jeszcze nie ruszył — uczestnictwo trwa.
 */
export function terminRetencji(
  rekord: Rekord,
  uczestnictwo: Uczestnictwo,
): { termin: string; regula: RegulaRetencji } | undefined {
  const regula = regulaDla(rekord.rodzaj);
  if (regula === undefined) return undefined;

  switch (regula.punktOdniesienia) {
    case 'od_utworzenia':
      return { termin: dodajMiesiace(rekord.utworzono, regula.miesiace), regula };

    case 'od_zakonczenia_uczestnictwa': {
      if (uczestnictwo.do === undefined) return undefined;
      return { termin: dodajMiesiace(uczestnictwo.do, regula.miesiace), regula };
    }

    case 'od_konca_roku_obrotowego':
      return {
        termin: dodajMiesiace(koniecRokuObrotowego(rekord.utworzono), regula.miesiace),
        regula,
      };
  }
}

export interface ZadanieRetencyjne {
  rekordId: string;
  rodzaj: RodzajRekordu;
  akcja: AkcjaRetencji;
  termin: string;
  podstawa: string;
}

/** Co jest wymagalne na dany dzień. Zwraca zadania, nie wykonuje ich. */
export function wymagalne(
  rekordy: readonly Rekord[],
  uczestnictwo: Uczestnictwo,
  na: string,
): ZadanieRetencyjne[] {
  const zadania: ZadanieRetencyjne[] = [];

  for (const rekord of rekordy) {
    const wyliczony = terminRetencji(rekord, uczestnictwo);
    if (wyliczony === undefined || wyliczony.termin > na) continue;

    zadania.push({
      rekordId: rekord.id,
      rodzaj: rekord.rodzaj,
      akcja: wyliczony.regula.akcja,
      termin: wyliczony.termin,
      podstawa: wyliczony.regula.podstawa,
    });
  }

  return zadania.sort((a, b) => (a.termin < b.termin ? -1 : 1));
}

export interface WynikRetencji {
  zbior: ZbiorPodmiotu;
  wykonane: readonly ZadanieRetencyjne[];
}

/**
 * Wykonanie zadań wymagalnych na dany dzień.
 *
 * Agregacja nie jest łagodniejszym usunięciem — surowe próbki znikają tak samo
 * jak przy `usun`, zostaje po nich rekord dobowy bez zawartości pomiarowej.
 * Gdyby agregacja zachowywała `dane` oryginału, polityka retencji byłaby
 * etykietą, a nie działaniem.
 */
export function wykonajRetencje(zbior: ZbiorPodmiotu, na: string): WynikRetencji {
  const zadania = wymagalne(zbior.rekordy, zbior.uczestnictwo, na);
  const wgRekordu = new Map(zadania.map((zadanie) => [zadanie.rekordId, zadanie]));

  const rekordy: Rekord[] = [];

  for (const rekord of zbior.rekordy) {
    const zadanie = wgRekordu.get(rekord.id);
    if (zadanie === undefined) {
      rekordy.push(rekord);
      continue;
    }

    if (zadanie.akcja === 'agreguj_dobowo') {
      rekordy.push({
        id: `${rekord.id}-dobowy`,
        rodzaj: 'wearables_dobowe',
        utworzono: rekord.utworzono,
        dane: { zrodlo: rekord.id, zagregowano: na },
      });
    }
  }

  return { zbior: { ...zbior, rekordy }, wykonane: zadania };
}
