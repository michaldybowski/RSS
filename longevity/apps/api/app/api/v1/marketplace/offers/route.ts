import { isActive } from '@longevity/consent';
import { KATEGORIE, katalogOfert, ostrzezeniaOferty, type KategoriaPartnera } from '@longevity/marketplace';

import { zKontem } from '../../../../../lib/auth.ts';
import { OCENA, OFERTY, PAKIET_UCZESTNIKA, PARTNERZY } from '../../../../../lib/dane.ts';
import { ok } from '../../../../../lib/odpowiedzi.ts';
import { rejestrZgod } from '../../../../../lib/stan.ts';

/**
 * Katalog ofert partnerów.
 *
 * Kolejność wynika z `katalogOfert` i nie zależy od oceny zdrowia — to jest
 * właśnie ta reguła, którą API musi utrzymać tak samo jak portal: prowizja
 * nie może zależeć od tego, jak komuś wyszły badania. Ocena wchodzi do
 * odpowiedzi wyłącznie jako `ostrzezenia`, czyli tam, gdzie może coś
 * **ograniczyć**, i nigdzie indziej.
 *
 * Ujawnienie prowizji jedzie przy każdej pozycji i nie jest polem opcjonalnym.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, () => {
    const zapytanie = new URL(request.url).searchParams;
    const kategoria = zapytanie.get('kategoria');

    const zeZgoda = isActive(rejestrZgod(), 'dane_zdrowotne');

    const pozycje = katalogOfert(OFERTY, PARTNERZY, {
      pakiet: PAKIET_UCZESTNIKA,
      ...(kategoria !== null && KATEGORIE.includes(kategoria as KategoriaPartnera)
        ? { kategoria: kategoria as KategoriaPartnera }
        : {}),
    });

    return ok(
      {
        oferty: pozycje.map(({ oferta, partner, ujawnienieProwizji }) => ({
          id: oferta.id,
          nazwa: oferta.nazwa,
          opis: oferta.opis,
          cenaNettoGr: oferta.cenaNettoGr,
          stawkaVat: oferta.stawkaVat,
          partner: { id: partner.id, nazwa: partner.nazwa, kategoria: partner.kategoria },
          ujawnienieProwizji,
          // Bez zgody na dane zdrowotne nie liczymy ostrzeżeń — nie mamy z czego.
          // Pusta tablica przy `ostrzezeniaPoliczone: false` znaczy „nie wiemy",
          // a nie „nie ma przeciwwskazań"; to dwie różne informacje.
          ostrzezenia: zeZgoda ? ostrzezeniaOferty(oferta, OCENA) : [],
        })),
        ostrzezeniaPoliczone: zeZgoda,
      },
      { wrazliwe: true },
    );
  });
}
