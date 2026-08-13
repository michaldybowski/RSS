/**
 * Raport szkoleniowy dla pracodawcy (ESRS S1-13).
 *
 * CSRD wymaga podania średniej liczby godzin szkoleniowych na pracownika.
 * Wymaga **średniej**, a nie listy — i to jest cały ten plik: pracodawca
 * dostaje liczbę zbiorczą, chronioną tym samym progiem k-anonimowości,
 * co dashboard HR.
 *
 * Bez progu raport z zespołu czteroosobowego byłby informacją o tym, ile
 * uczy się każda z czterech osób — a z tego, czego się uczy, wynika, co jej
 * dolega. Dlatego typ wyniku nie ma pola na uczestnika.
 */

import { PROG_K } from '@longevity/analytics';

export interface NaukaUczestnika {
  subjectRef: string;
  minuty: number;
  ukonczoneSciezki: number;
}

export interface RaportSzkoleniowy {
  osob: number;
  /** ESRS S1-13: średnia liczba godzin szkoleniowych na osobę. */
  sredniaGodzin: number;
  lacznieGodzin: number;
  ukonczonychSciezek: number;
  /** Odsetek osób, które ukończyły co najmniej jedną ścieżkę, w pełnych 5 pp. */
  odsetekZUkonczona: number;
}

export type WynikRaportu =
  | { dostepny: true; raport: RaportSzkoleniowy }
  | { dostepny: false; powod: string; prog: number };

function godziny(minuty: number): number {
  return Math.round((minuty / 60) * 10) / 10;
}

export function raportSzkoleniowy(
  nauka: readonly NaukaUczestnika[],
  prog: number = PROG_K,
): WynikRaportu {
  if (nauka.length < prog) {
    return {
      dostepny: false,
      powod:
        `Grupa liczy ${nauka.length} osób, próg wynosi ${prog}. Zestawienie zostało ` +
        'wstrzymane, bo przy tej liczebności agregat wskazuje pojedyncze osoby.',
      prog,
    };
  }

  const minuty = nauka.reduce((suma, pozycja) => suma + pozycja.minuty, 0);
  const zUkonczona = nauka.filter((pozycja) => pozycja.ukonczoneSciezki > 0).length;

  return {
    dostepny: true,
    raport: {
      osob: nauka.length,
      sredniaGodzin: godziny(minuty / nauka.length),
      lacznieGodzin: godziny(minuty),
      ukonczonychSciezek: nauka.reduce((suma, pozycja) => suma + pozycja.ukonczoneSciezki, 0),
      // Zaokrąglenie do 5 pp — ta sama zasada co w dashboardzie HR: dokładny
      // odsetek przy znanej liczebności grupy odtwarza liczbę osób.
      odsetekZUkonczona: Math.round(((zUkonczona / nauka.length) * 100) / 5) * 5,
    },
  };
}
