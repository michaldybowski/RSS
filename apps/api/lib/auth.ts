/**
 * Uwierzytelnianie tokenem nagłówkowym.
 *
 * Prototyp: token jest stały i pochodzi z tablicy w `dane.ts`. W produkcji
 * wchodzi OIDC — ale kontrakt się nie zmieni: nagłówek `Authorization: Bearer`,
 * a odpowiedź na brak i na zły token jest **taka sama**. Rozróżnienie ich
 * pozwalałoby sprawdzać tokeny po jednym i wykrywać, które istnieją.
 *
 * Autoryzacja jest osobna i prawdziwa: pyta @longevity/access przy każdej
 * operacji, niezależnie od tego, kto podał token.
 */

import { kontoPoTokenie, type Konto } from './dane.ts';
import { blad, obsluz, zBleduDomenowego } from './odpowiedzi.ts';

const PREFIKS = 'Bearer ';

export class BrakUwierzytelnieniaError extends Error {
  constructor() {
    super(
      'Wymagany nagłówek Authorization: Bearer <token>. ' +
        'Token jest nieprawidłowy albo wygasł.',
    );
    this.name = 'BrakUwierzytelnieniaError';
  }
}

export function konto(request: Request): Konto {
  const naglowek = request.headers.get('authorization');
  if (naglowek === null || !naglowek.startsWith(PREFIKS)) throw new BrakUwierzytelnieniaError();

  const znalezione = kontoPoTokenie(naglowek.slice(PREFIKS.length).trim());
  if (znalezione === undefined) throw new BrakUwierzytelnieniaError();

  return znalezione;
}

/**
 * Opakowanie punktu końcowego: uwierzytelnienie, mapowanie błędów domenowych
 * i siatka bezpieczeństwa na wyjątki nieprzewidziane — w jednym miejscu.
 */
export function zKontem(
  request: Request,
  handler: (konto: Konto) => Promise<Response> | Response,
): Promise<Response> {
  return obsluz(async () => {
    let biezace: Konto;

    try {
      biezace = konto(request);
    } catch (powod) {
      if (powod instanceof BrakUwierzytelnieniaError) {
        return blad('brak_uwierzytelnienia', powod.message);
      }
      throw powod;
    }

    try {
      return await handler(biezace);
    } catch (powod) {
      const odpowiedz = zBleduDomenowego(powod);
      if (odpowiedz !== undefined) return odpowiedz;
      throw powod;
    }
  });
}
