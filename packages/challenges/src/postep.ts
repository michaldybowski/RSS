/**
 * Postęp w wyzwaniu.
 *
 * Ukończenie nie wymaga kompletu dni. Próg 80% jest decyzją, nie ustępstwem:
 * warunek „każdego dnia bez wyjątku" premiuje ludzi, którym nic nie wypadło,
 * a nie ludzi, którzy zmienili nawyk. Kto ma gorszy tydzień i wraca, ten
 * właśnie robi to, o co w programie chodzi.
 */

import { celOsiagniety, dniTrwania, pomiaryWyzwania, roznicaDni } from './pomiary.ts';
import { najdluzszaPassa, passa, premiaZaUkonczenie, punktyOkresu } from './punkty.ts';
import type { Pomiar, Wyzwanie, Zapis } from './types.ts';

export const PROG_UKONCZENIA_PROCENT = 80;

export interface Postep {
  wyzwanieId: string;
  nazwa: string;
  dniZaliczone: number;
  /** Dni, które upłynęły — nie więcej niż czas trwania wyzwania. */
  dniMinelo: number;
  dniWyzwania: number;
  /** Procent dni zaliczonych względem całego wyzwania. */
  procent: number;
  /** Passa bieżąca, liczona wstecz od dziś. */
  passa: number;
  /** Najdłuższa passa w historii wyzwania — podstawa odznak. */
  najdluzszaPassa: number;
  punkty: number;
  ukonczone: boolean;
  zakonczone: boolean;
  /** Ile dni z celem brakuje do progu ukończenia. */
  brakujeDoUkonczenia: number;
}

export function postep(
  wyzwanie: Wyzwanie,
  zapis: Zapis,
  pomiary: readonly Pomiar[],
  dzisiaj: string,
): Postep {
  const wlasne = pomiaryWyzwania(pomiary, wyzwanie.id);
  const dniZaliczone = wlasne.filter((pomiar) => celOsiagniety(wyzwanie, pomiar.wartosc)).length;
  const dniMinelo = dniTrwania(wyzwanie, zapis.od, dzisiaj);
  const zakonczone = roznicaDni(zapis.od, dzisiaj) + 1 >= wyzwanie.czasTrwaniaDni;

  const wymagane = Math.ceil((wyzwanie.czasTrwaniaDni * PROG_UKONCZENIA_PROCENT) / 100);
  const ukonczone = dniZaliczone >= wymagane;

  const punkty =
    punktyOkresu([wyzwanie], wlasne) + (ukonczone ? premiaZaUkonczenie(wyzwanie) : 0);

  return {
    wyzwanieId: wyzwanie.id,
    nazwa: wyzwanie.nazwa,
    dniZaliczone,
    dniMinelo,
    dniWyzwania: wyzwanie.czasTrwaniaDni,
    procent: Math.round((dniZaliczone / wyzwanie.czasTrwaniaDni) * 100),
    passa: passa(wyzwanie, wlasne, dzisiaj, zapis.od),
    najdluzszaPassa: najdluzszaPassa(wyzwanie, wlasne, zapis.od, dzisiaj),
    punkty,
    ukonczone,
    zakonczone,
    brakujeDoUkonczenia: Math.max(0, wymagane - dniZaliczone),
  };
}

export interface PodsumowanieUczestnika {
  punkty: number;
  ukonczone: number;
  /** Najdłuższa passa osiągnięta kiedykolwiek, w którymkolwiek wyzwaniu. */
  najdluzszaPassa: number;
  postepy: readonly Postep[];
}

export function podsumuj(
  wyzwania: readonly Wyzwanie[],
  zapisy: readonly Zapis[],
  pomiary: readonly Pomiar[],
  dzisiaj: string,
): PodsumowanieUczestnika {
  const wgId = new Map(wyzwania.map((wyzwanie) => [wyzwanie.id, wyzwanie]));

  const postepy = zapisy
    .map((zapis) => {
      const wyzwanie = wgId.get(zapis.wyzwanieId);
      return wyzwanie === undefined ? undefined : postep(wyzwanie, zapis, pomiary, dzisiaj);
    })
    .filter((pozycja): pozycja is Postep => pozycja !== undefined);

  // Punkty dzienne liczymy raz, na wszystkich wyzwaniach naraz — inaczej
  // limit dobowy działałby osobno w każdym wyzwaniu i przestałby być limitem.
  const zapisaneId = new Set(zapisy.map((zapis) => zapis.wyzwanieId));
  const punktyDzienne = punktyOkresu(
    wyzwania.filter((wyzwanie) => zapisaneId.has(wyzwanie.id)),
    pomiary,
  );
  const premie = postepy
    .filter((pozycja) => pozycja.ukonczone)
    .reduce((suma, pozycja) => suma + premiaZaUkonczenie(wgId.get(pozycja.wyzwanieId)!), 0);

  return {
    punkty: punktyDzienne + premie,
    ukonczone: postepy.filter((pozycja) => pozycja.ukonczone).length,
    najdluzszaPassa: postepy.reduce((max, pozycja) => Math.max(max, pozycja.najdluzszaPassa), 0),
    postepy,
  };
}
