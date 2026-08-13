import { assertCan } from '@longevity/access';

import { zKontem } from '../../../../../../lib/auth.ts';
import { TERAZ } from '../../../../../../lib/dane.ts';
import { ok } from '../../../../../../lib/odpowiedzi.ts';
import { AUDIT } from '../../../../../../lib/stan.ts';

/**
 * Ręczne uruchomienie synchronizacji z Notion.
 *
 * Prototyp nie wykonuje tu importu — sam przebieg mieszka w panelu admina
 * razem z zapowiedzią różnic, bo import cennika bez obejrzenia zmian jest
 * decyzją, której nie wolno podejmować przez zwykłe wywołanie API.
 * Ten punkt końcowy pilnuje wyłącznie uprawnienia i zwraca zaplanowanie zadania.
 */
export function POST(request: Request): Promise<Response> {
  return zKontem(request, (konto) => {
    assertCan(konto.actor, 'zarzadzanie_synchronizacja', { kind: 'system' });

    AUDIT.dopisz({
      actorRef: konto.actor.userId,
      akcja: 'synchronizacja_tresci',
      zasob: 'notion/synchronizacja',
      kontekst: { zrodlo: 'api' },
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        zaplanowano: true,
        uwaga:
          'Źródła krytyczne (cennik, progi ZFŚS) wymagają potwierdzenia zapowiedzi ' +
          'w panelu administratora i nie zostaną zaimportowane tym wywołaniem.',
      },
      { status: 202 },
    );
  });
}
