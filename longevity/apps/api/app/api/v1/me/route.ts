import { zKontem } from '../../../../lib/auth.ts';
import { ok } from '../../../../lib/odpowiedzi.ts';

/**
 * Kim jest właściciel tokenu.
 *
 * Odpowiedź nie zawiera tokenu ani niczego, czym dałoby się podszyć — tylko
 * identyfikator, pseudonim i role. Pseudonim jest tu celowo: klient mobilny
 * używa go w rankingach, a tożsamości do tego nie potrzebuje.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) =>
    ok({
      userId: konto.userId,
      subjectRef: konto.subjectRef,
      opis: konto.opis,
      role: konto.actor.grants.map((grant) => ({
        rola: grant.role,
        organizationId: grant.organizationId ?? null,
      })),
    }),
  );
}
