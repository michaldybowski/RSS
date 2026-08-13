import { assertCan } from '@longevity/access';
import { OKNO_ODWOLANIA_H, odwolaj } from '@longevity/clinical';

import { zKontem } from '../../../../../../lib/auth.ts';
import { ORGANIZACJA, TERAZ, TERAZ_LOKALNY, terminPoId } from '../../../../../../lib/dane.ts';
import { blad, ok } from '../../../../../../lib/odpowiedzi.ts';
import {
  AUDIT,
  konsultacjeUczestnika,
  zastapKonsultacje,
} from '../../../../../../lib/stan.ts';

/**
 * Odwołanie konsultacji.
 *
 * Późne odwołanie jest **odnotowane, ale bez opłaty** — reguła pakietu
 * @longevity/clinical, powtórzona tu w treści odpowiedzi, bo klient mobilny
 * musi mieć co pokazać zamiast domyślać się sankcji. Opłata za późne odwołanie
 * wizyty zdrowotnej zniechęca do odwoływania, a nie do chorowania.
 */
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return zKontem(request, async (konto) => {
    const { id } = await params;

    const konsultacja = konsultacjeUczestnika().find((pozycja) => pozycja.id === id);
    if (konsultacja === undefined) return blad('nie_znaleziono', `Nie ma konsultacji o id ${id}.`);

    // Ta sama reguła co przy rezerwacji: swoją wizytę odwołuje się samemu.
    // Uprawnienie sprawdzamy na właścicielu konsultacji, nie na wywołującym —
    // inaczej każdy odwoływałby cudzą wizytę „dla siebie".
    assertCan(konto.actor, 'rezerwacja_konsultacji', {
      kind: 'konsultacja',
      organizationId: ORGANIZACJA,
      clinicianId: konsultacja.clinicianId,
      participantId: konsultacja.participantId,
    });

    const termin = terminPoId(konsultacja.terminId);
    if (termin === undefined) return blad('nie_znaleziono', 'Termin konsultacji zniknął.');

    const odwolana = odwolaj(konsultacja, termin, TERAZ_LOKALNY);
    zastapKonsultacje(odwolana);

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'odwolanie_konsultacji',
      zasob: `konsultacja/${odwolana.id}`,
      kontekst: { pozno: odwolana.poznoOdwolana === true ? 'tak' : 'nie' },
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        konsultacja: { id: odwolana.id, status: odwolana.status, odwolana: odwolana.odwolana },
        poznoOdwolana: odwolana.poznoOdwolana === true,
        oknoOdwolaniaGodzin: OKNO_ODWOLANIA_H,
        oplataGr: 0,
        komunikat:
          odwolana.poznoOdwolana === true
            ? `Odwołanie wpłynęło później niż ${OKNO_ODWOLANIA_H} h przed terminem. ` +
              'Odnotowaliśmy to na potrzeby planowania grafiku. Nie naliczamy żadnej opłaty.'
            : 'Termin został zwolniony i wraca do puli.',
      },
      { wrazliwe: true },
    );
  });
}
