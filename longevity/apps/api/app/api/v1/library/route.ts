import { katalog, ostrzezenia, type FiltrBiblioteki, type TypMaterialu } from '@longevity/academy';

import { zKontem } from '../../../../lib/auth.ts';
import { MATERIALY, OCENA, PAKIET_UCZESTNIKA } from '../../../../lib/dane.ts';
import { ok } from '../../../../lib/odpowiedzi.ts';

const TYPY: readonly string[] = ['lekcja', 'webinar', 'podcast', 'artykul', 'ebook', 'zeszyt'];

/**
 * Biblioteka treści z cache Notion.
 *
 * Jedyny punkt końcowy w tym API, który zwraca treść wspólną dla wszystkich —
 * i mimo to nie jest publiczny: filtr pakietu decyduje o tym, co uczestnik ma
 * opłacone. Ostrzeżenia są liczone per osoba i dlatego odpowiedź nie nadaje się
 * do pamięci podręcznej współdzielonej.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, () => {
    const zapytanie = new URL(request.url).searchParams;
    const filar = zapytanie.get('filar');
    const typ = zapytanie.get('typ');
    const fraza = zapytanie.get('fraza');

    const filtr: FiltrBiblioteki = {
      pakiet: PAKIET_UCZESTNIKA,
      ...(filar !== null && filar !== '' ? { filar } : {}),
      ...(typ !== null && TYPY.includes(typ) ? { typ: typ as TypMaterialu } : {}),
      ...(fraza !== null && fraza !== '' ? { fraza } : {}),
    };

    return ok(
      {
        materialy: katalog(MATERIALY, filtr).map((material) => ({
          id: material.id,
          tytul: material.tytul,
          typ: material.typ,
          opis: material.opis,
          czasTrwaniaMin: material.czasTrwaniaMin,
          filary: material.filary,
          maSprawdzian: material.quizId !== undefined,
          ostrzezenia: ostrzezenia(material, OCENA),
        })),
      },
      { wrazliwe: true },
    );
  });
}
