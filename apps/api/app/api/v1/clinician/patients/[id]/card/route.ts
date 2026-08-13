import { assertCan } from '@longevity/access';
import { checkOperation } from '@longevity/consent';

import { zKontem } from '../../../../../../../lib/auth.ts';
import { KONTA, OCENA, TERAZ } from '../../../../../../../lib/dane.ts';
import { blad, ok } from '../../../../../../../lib/odpowiedzi.ts';
import { AUDIT, rejestrZgod } from '../../../../../../../lib/stan.ts';

/**
 * Karta Pacjenta dla lekarza.
 *
 * Najostrzejsza bramka w całym API i jedyne miejsce, w którym dane zdrowotne
 * jednej osoby trafiają do drugiej. Warunki są trzy i wszystkie muszą zajść:
 *
 *  1. rola lekarza w organizacji uczestnika (@longevity/access),
 *  2. **aktywna, odrębna zgoda uczestnika** — sama rola nie wystarcza,
 *  3. wpis w audit logu, widoczny potem dla uczestnika w jego panelu.
 *
 * Kolejność jest istotna: zgoda sprawdzana jest przed autoryzacją roli, żeby
 * lekarz bez zgody dostał komunikat o zgodzie, a nie o uprawnieniu — to dwie
 * różne informacje i tylko jedna z nich jest dla niego użyteczna.
 */
export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return zKontem(request, async (konto) => {
    const { id } = await params;

    const uczestnik = KONTA.find((pozycja) => pozycja.userId === id);
    if (uczestnik === undefined) return blad('nie_znaleziono', 'Nie ma takiego uczestnika.');

    const bramka = checkOperation(rejestrZgod(), 'clinician_view');
    if (!bramka.allowed) {
      // Odmowa jest odnotowana tak samo jak udany odczyt. Log, który zapisuje
      // wyłącznie udane próby, nie odpowiada na pytanie „kto próbował".
      AUDIT.dopisz({
        actorRef: konto.userId,
        subjectRef: uczestnik.subjectRef,
        akcja: 'udostepnienie_lekarzowi',
        zasob: `karta/${uczestnik.userId}`,
        kontekst: { wynik: 'odmowa', powod: 'brak_zgody' },
        at: TERAZ.toISOString(),
      });

      return blad(
        'brak_zgody',
        'Uczestnik nie udzielił zgody na udostępnienie Karty Pacjenta lekarzowi ' +
          'albo ją wycofał.',
        { brakujaceZgody: bramka.missing.map((status) => status.code) },
      );
    }

    assertCan(
      konto.actor,
      'odczyt_karty_pacjenta',
      { kind: 'uczestnik', organizationId: 'org-alfa', participantId: uczestnik.userId },
      { clinicianConsent: true },
    );

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: uczestnik.subjectRef,
      akcja: 'udostepnienie_lekarzowi',
      zasob: `karta/${uczestnik.userId}`,
      kontekst: { wynik: 'udostepniono' },
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        subjectRef: uczestnik.subjectRef,
        healthScore: OCENA.healthScore.overall,
        kategoriaRyzyka: OCENA.riskCategory,
        flagi: OCENA.flags.map((flaga) => ({
          kod: flaga.code,
          poziom: flaga.level,
          komunikat: flaga.message,
        })),
        wskazniki: OCENA.derived,
        wersjaRegul: OCENA.rulesetVersion,
        zastrzezenie:
          'Materiał ma charakter informacyjny i nie stanowi diagnozy. ' +
          'Progi reguł są w wersji roboczej do czasu akceptacji medycznej.',
      },
      { wrazliwe: true },
    );
  });
}
