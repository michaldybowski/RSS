/**
 * Ochrona anonimowości agregatów (specyfikacja 10).
 *
 * Dwa mechanizmy, oba konieczne:
 *
 * 1. **Próg k** — grupa mniejsza niż K osób nie zwraca wyniku.
 * 2. **Dopełnienie** — jeśli filtr wycina n osób z N, to nie tylko n musi
 *    spełniać próg, ale i N − n. Inaczej przy 12 uczestnikach i filtrze
 *    obejmującym 11 z nich dwunasta osoba jest identyfikowalna przez różnicę,
 *    mimo że każda pokazana grupa formalnie próg spełnia.
 *
 * Punkt drugi jest tym, o który najczęściej rozbijają się dashboardy „anonimowe".
 */

export const PROG_K = 10;

export type SuppressionReason = 'grupa_ponizej_progu' | 'dopelnienie_ponizej_progu';

export type Suppression = { suppressed: false } | { suppressed: true; powod: SuppressionReason };

export function checkGroup(groupSize: number, totalSize: number, prog = PROG_K): Suppression {
  if (groupSize < prog) return { suppressed: true, powod: 'grupa_ponizej_progu' };

  const dopelnienie = totalSize - groupSize;
  if (dopelnienie > 0 && dopelnienie < prog) {
    return { suppressed: true, powod: 'dopelnienie_ponizej_progu' };
  }

  return { suppressed: false };
}

/**
 * Liczebność jako przedział. Dokładna liczba osób w grupie jest informacją,
 * której HR nie potrzebuje, a która w połączeniu z wiedzą o zespole potrafi
 * wskazać konkretną osobę.
 */
export function bandSize(count: number, prog = PROG_K): string {
  if (count < prog) return `poniżej ${prog}`;
  const dolna = Math.floor(count / 10) * 10;
  return `${dolna}-${dolna + 9}`;
}

/**
 * Udziały zaokrąglane do pełnych pięciu punktów procentowych. Precyzja
 * do dziesiątych części procenta pozwala odtworzyć licznik i mianownik,
 * czyli dokładną liczbę osób.
 */
export function roundShare(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((part / total) * 100) / 5) * 5;
}

/**
 * Porównanie okresów dla grup blisko progu. Zmiana wyniku grupy 11-osobowej
 * między miesiącami potrafi ujawnić jedną osobę, nawet jeśli każdy pomiar
 * z osobna próg spełnia.
 */
export function allowTrend(sizes: readonly number[], prog = PROG_K): boolean {
  const margines = prog + Math.ceil(prog / 2);
  return sizes.every((size) => size >= margines);
}
