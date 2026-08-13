import { dostepneSciezki, postepSciezki } from '@longevity/academy';

import { zKontem } from '../../../../../lib/auth.ts';
import { MATERIALY, PAKIET_UCZESTNIKA, SCIEZKI } from '../../../../../lib/dane.ts';
import { ok } from '../../../../../lib/odpowiedzi.ts';
import { zaliczeniaUczestnika } from '../../../../../lib/stan.ts';

/**
 * Ścieżki Akademii z postępem uczestnika.
 *
 * Postęp liczy się po stronie serwera, bo to on zna reguły: moduł otwiera się
 * po zaliczeniu poprzedniego, a moduł z materiałem wycofanym wypada z mianownika.
 * Klient, który liczyłby procent sam, po pierwszym wycofaniu treści w Notion
 * pokazywałby ścieżkę, której nie da się ukończyć.
 *
 * Historia nauki jest daną o osobie — co ktoś czyta, mówi o tym, na co choruje.
 * Dlatego odpowiedź jest oznaczona jako wrażliwa i nie wraca do Notion.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, () => {
    const zaliczenia = zaliczeniaUczestnika();

    return ok(
      {
        sciezki: dostepneSciezki(SCIEZKI, PAKIET_UCZESTNIKA).map((sciezka) => {
          const postep = postepSciezki(sciezka, MATERIALY, zaliczenia);

          return {
            id: sciezka.id,
            nazwa: sciezka.nazwa,
            opis: sciezka.opis,
            procent: postep.procent,
            ukonczona: postep.ukonczona,
            wymaganych: postep.wymaganych,
            zaliczonychObowiazkowych: postep.zaliczonychObowiazkowych,
            pominietych: postep.pominietych,
            minutyNauki: postep.minutyNauki,
            nastepnyMaterialId: postep.nastepny?.modul.materialId ?? null,
            moduly: postep.pozycje.map((pozycja) => ({
              materialId: pozycja.modul.materialId,
              // Tytuł jedzie także dla modułu niedostępnego. Bez niego klient
              // pokazałby identyfikator z bazy zamiast nazwy pominiętej treści.
              tytul: pozycja.material?.tytul ?? 'Materiał niedostępny',
              obowiazkowy: pozycja.modul.obowiazkowy,
              stan: pozycja.stan,
              maSprawdzian: pozycja.material?.quizId !== undefined,
              sposobZaliczenia: pozycja.zaliczenie?.sposob ?? null,
            })),
          };
        }),
      },
      { wrazliwe: true },
    );
  });
}
