import { przegladKatalogu } from '@longevity/challenges';

import { zKontem } from '../../../../lib/auth.ts';
import { OCENA, PAKIET_UCZESTNIKA, WYZWANIA } from '../../../../lib/dane.ts';
import { ok } from '../../../../lib/odpowiedzi.ts';
import { zapisyWyzwan } from '../../../../lib/stan.ts';

/**
 * Katalog wyzwań z decyzją kwalifikacyjną przy każdej pozycji.
 *
 * Wyzwania niedostępne są w odpowiedzi razem z powodem, a nie odfiltrowane.
 * Klient, który dostaje krótszą listę bez wyjaśnienia, może tylko pokazać
 * pustkę — a uczestnik ma prawo wiedzieć, dlaczego czegoś nie widzi.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, () => {
    const zapisane = new Set(zapisyWyzwan().map((zapis) => zapis.wyzwanieId));

    return ok(
      {
        wyzwania: przegladKatalogu(WYZWANIA, {
          ocena: OCENA,
          pakiet: PAKIET_UCZESTNIKA,
        }).map(({ wyzwanie, kwalifikacja }) => ({
          id: wyzwanie.id,
          nazwa: wyzwanie.nazwa,
          typ: wyzwanie.typ,
          metryka: wyzwanie.metryka,
          cel: wyzwanie.cel,
          czasTrwaniaDni: wyzwanie.czasTrwaniaDni,
          punkty: wyzwanie.punkty,
          zapisany: zapisane.has(wyzwanie.id),
          dozwolone: kwalifikacja.dozwolone,
          powod: kwalifikacja.dozwolone ? null : kwalifikacja.powod,
        })),
      },
      { wrazliwe: true },
    );
  });
}
