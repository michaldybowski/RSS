/**
 * Rankingi.
 *
 * Ranking imienny jest ujawnieniem danych o zdrowiu. Z liczby kroków koleżanki
 * z działu da się wnioskować o jej kondycji, chorobie i nieobecności — a to,
 * że sama się zapisała do wyzwania, nie jest zgodą na taki wniosek.
 *
 * Stąd dwie reguły:
 *  - ranking **zespołowy** pokazuje wyłącznie zespoły nie mniejsze niż próg
 *    k-anonimowości, ten sam co w dashboardzie HR (@longevity/analytics);
 *  - ranking **indywidualny** nie istnieje jako lista. Uczestnik może poznać
 *    własną pozycję i liczbę uczestników, i nic poza tym.
 *
 * Typ `WynikZespolu` nie ma pola na uczestnika. Tak samo jak nota zbiorcza
 * w rozliczeniach — brak pola jest tu zabezpieczeniem, nie przeoczeniem.
 */

import { PROG_K } from '@longevity/analytics';

export interface PunktyUczestnika {
  subjectRef: string;
  punkty: number;
  zespol?: string;
}

export interface WynikZespolu {
  zespol: string;
  osob: number;
  sredniaPunktow: number;
}

export interface RankingZespolow {
  wyniki: readonly WynikZespolu[];
  /** Ile zespołów pominięto z powodu progu. Bez nazw — nazwa też zawęża. */
  pominietych: number;
  prog: number;
}

export function rankingZespolow(
  punkty: readonly PunktyUczestnika[],
  prog: number = PROG_K,
): RankingZespolow {
  const wgZespolu = new Map<string, number[]>();

  for (const pozycja of punkty) {
    if (pozycja.zespol === undefined) continue;
    const lista = wgZespolu.get(pozycja.zespol) ?? [];
    lista.push(pozycja.punkty);
    wgZespolu.set(pozycja.zespol, lista);
  }

  const wyniki: WynikZespolu[] = [];
  let pominietych = 0;

  for (const [zespol, wartosci] of wgZespolu) {
    if (wartosci.length < prog) {
      pominietych += 1;
      continue;
    }

    wyniki.push({
      zespol,
      osob: wartosci.length,
      // Średnia, nie suma — inaczej ranking mierzyłby wielkość zespołu.
      sredniaPunktow: Math.round(wartosci.reduce((a, b) => a + b, 0) / wartosci.length),
    });
  }

  return {
    wyniki: wyniki.sort((a, b) => b.sredniaPunktow - a.sredniaPunktow),
    pominietych,
    prog,
  };
}

export interface PozycjaWlasna {
  pozycja: number;
  uczestnikow: number;
}

/**
 * Własna pozycja w stawce. Zwraca liczby, nigdy listy — funkcja, która
 * zwracałaby posortowaną tablicę, byłaby rankingiem imiennym o jedno
 * `map` od publikacji.
 */
export function pozycjaWlasna(
  subjectRef: string,
  punkty: readonly PunktyUczestnika[],
): PozycjaWlasna | undefined {
  const wlasne = punkty.find((pozycja) => pozycja.subjectRef === subjectRef);
  if (wlasne === undefined) return undefined;

  const lepszych = punkty.filter((pozycja) => pozycja.punkty > wlasne.punkty).length;

  return { pozycja: lepszych + 1, uczestnikow: punkty.length };
}
