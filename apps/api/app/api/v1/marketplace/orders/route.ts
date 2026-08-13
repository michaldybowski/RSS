import { katalogOfert, ladunekDlaPartnera, ujawnienieProwizji, zloz } from '@longevity/marketplace';

import { zKontem } from '../../../../../lib/auth.ts';
import { OFERTY, PAKIET_UCZESTNIKA, PARTNERZY, TERAZ } from '../../../../../lib/dane.ts';
import { BledneZadanieError, blad, ok } from '../../../../../lib/odpowiedzi.ts';
import { AUDIT, dodajZamowienie, zamowieniaUczestnika } from '../../../../../lib/stan.ts';

export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) =>
    ok(
      {
        zamowienia: zamowieniaUczestnika()
          .filter((zamowienie) => zamowienie.subjectRef === konto.subjectRef)
          .map((zamowienie) => ({
            id: zamowienie.id,
            ofertaId: zamowienie.ofertaId,
            partnerId: zamowienie.partnerId,
            kwotaNettoGr: zamowienie.kwotaNettoGr,
            stawkaVat: zamowienie.stawkaVat,
            prowizjaGr: zamowienie.prowizjaGr,
            prowizjaPct: zamowienie.prowizjaPct,
            status: zamowienie.status,
            zlozone: zamowienie.zlozone,
          })),
      },
      { wrazliwe: true },
    ),
  );
}

/**
 * Złożenie zamówienia u partnera.
 *
 * Oferty szukamy **w katalogu**, a nie w pełnej tablicy ofert. Dzięki temu
 * oferta partnera w negocjacjach i oferta spoza pakietu dają to samo 404,
 * co oferta nieistniejąca — bramka widoczności z `katalogOfert` obowiązuje
 * też przy zapisie, a nie tylko przy wyświetlaniu listy.
 *
 * W odpowiedzi wraca `ladunekPartnera`: dokładnie to, co partner o tym
 * zamówieniu zobaczy. Uczestnik, który kupuje badania, ma prawo wiedzieć,
 * że laboratorium dostanie kod odbioru i nazwę pozycji — a nie jego nazwisko.
 */
export function POST(request: Request): Promise<Response> {
  return zKontem(request, async (konto) => {
    const cialo: unknown = await request.json().catch(() => undefined);
    const ofertaId = (cialo as { ofertaId?: unknown } | undefined)?.ofertaId;
    if (typeof ofertaId !== 'string' || ofertaId === '') {
      throw new BledneZadanieError('Pole "ofertaId" jest wymagane.');
    }

    const pozycja = katalogOfert(OFERTY, PARTNERZY, { pakiet: PAKIET_UCZESTNIKA }).find(
      (kandydat) => kandydat.oferta.id === ofertaId,
    );
    if (pozycja === undefined) {
      return blad('nie_znaleziono', `W Twoim katalogu nie ma oferty o id ${ofertaId}.`);
    }

    const zamowienie = zloz(pozycja.oferta, pozycja.partner, konto.subjectRef, TERAZ.toISOString());

    if (zamowieniaUczestnika().some((istniejace) => istniejace.id === zamowienie.id)) {
      return blad('konflikt', 'To zamówienie zostało już dziś złożone.');
    }

    dodajZamowienie(zamowienie);

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'zamowienie_marketplace',
      zasob: `oferta/${pozycja.oferta.id}`,
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        zamowienie: {
          id: zamowienie.id,
          ofertaId: zamowienie.ofertaId,
          partnerId: zamowienie.partnerId,
          kwotaNettoGr: zamowienie.kwotaNettoGr,
          stawkaVat: zamowienie.stawkaVat,
          prowizjaGr: zamowienie.prowizjaGr,
          prowizjaPct: zamowienie.prowizjaPct,
          status: zamowienie.status,
        },
        ladunekPartnera: ladunekDlaPartnera(zamowienie, pozycja.oferta),
        ujawnienieProwizji: ujawnienieProwizji(pozycja.partner),
      },
      { status: 201, wrazliwe: true },
    );
  });
}
