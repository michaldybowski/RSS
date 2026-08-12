/**
 * Progi dopłat z regulaminu ZFŚS (specyfikacja 13).
 *
 * Progi różnią się między zakładami — regulamin ZFŚS jest aktem wewnętrznym
 * pracodawcy, nie ustawą. Dlatego pochodzą z bazy w Notion, per organizacja,
 * z datą obowiązywania.
 *
 * Interpretacja progu: wartość oznacza **górną granicę dochodu**, dla której
 * przysługuje dana dopłata. Uczestnik trafia do pierwszego progu, którego nie
 * przekracza. Dochód powyżej wszystkich progów daje najniższą dopłatę z tabeli.
 */

import type { Grosze } from './money.ts';
import type { ProgZfss } from './types.ts';

export interface DopasowanyProg {
  doplataPct: number;
  progDochodowyGr: Grosze;
}

/** Progi obowiązujące danego dnia — najświeższy zestaw nie późniejszy niż data. */
export function obowiazujaceProgi(
  progi: readonly ProgZfss[],
  organizationId: string,
  na: string,
): readonly ProgZfss[] {
  const dlaOrganizacji = progi.filter(
    (prog) => prog.organizationId === organizationId && prog.obowiazujeOd <= na,
  );

  if (dlaOrganizacji.length === 0) return [];

  const najnowszaData = dlaOrganizacji
    .map((prog) => prog.obowiazujeOd)
    .reduce((a, b) => (a > b ? a : b));

  return dlaOrganizacji
    .filter((prog) => prog.obowiazujeOd === najnowszaData)
    .slice()
    .sort((a, b) => a.progDochodowyGr - b.progDochodowyGr);
}

export function dopasujProg(
  progi: readonly ProgZfss[],
  organizationId: string,
  dochodGr: Grosze,
  na: string,
): DopasowanyProg | undefined {
  const obowiazujace = obowiazujaceProgi(progi, organizationId, na);
  if (obowiazujace.length === 0) return undefined;

  const trafiony = obowiazujace.find((prog) => dochodGr <= prog.progDochodowyGr);
  const wybrany = trafiony ?? obowiazujace[obowiazujace.length - 1]!;

  return { doplataPct: wybrany.doplataPct, progDochodowyGr: wybrany.progDochodowyGr };
}
