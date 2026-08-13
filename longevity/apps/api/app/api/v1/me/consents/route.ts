import { CONSENT_DEFINITIONS, statusOf } from '@longevity/consent';

import { zKontem } from '../../../../../lib/auth.ts';
import { ok } from '../../../../../lib/odpowiedzi.ts';
import { rejestrZgod } from '../../../../../lib/stan.ts';

/**
 * Stan zgód uczestnika.
 *
 * Każda pozycja niesie skutek wycofania. Aplikacja mobilna ma pokazać go
 * przy przełączniku, a nie odsyłać do regulaminu — zgoda wycofana bez wiedzy
 * o konsekwencji jest wycofana w ciemno.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, () => {
    const ledger = rejestrZgod();

    return ok(
      {
        zgody: CONSENT_DEFINITIONS.map((definicja) => {
          const status = statusOf(ledger, definicja.code);

          return {
            kod: definicja.code,
            tytul: definicja.title,
            wersja: definicja.version,
            podstawaPrawna: definicja.legalBasis,
            // `granted` to fakt udzielenia; aktywna jest dopiero zgoda
            // udzielona i niewymagająca odnowienia po zmianie treści.
            aktywna: status.granted && !status.requiresRenewal,
            wymagaOdnowienia: status.requiresRenewal,
            udzielonaDnia: status.grantedAt ?? null,
            skutekWycofania: definicja.withdrawalEffect,
          };
        }),
      },
      { wrazliwe: true },
    );
  });
}
