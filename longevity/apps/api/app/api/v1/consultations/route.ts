import { assertCan } from '@longevity/access';
import { widokTerminarza, zarezerwuj } from '@longevity/clinical';
import { isActive } from '@longevity/consent';
import type { RiskCategory } from '@longevity/core';

import { zKontem } from '../../../../lib/auth.ts';
import {
  OCENA,
  ORGANIZACJA,
  TERAZ,
  TERAZ_LOKALNY,
  TERMINY,
  terminPoId,
} from '../../../../lib/dane.ts';
import { BledneZadanieError, blad, ok } from '../../../../lib/odpowiedzi.ts';
import { AUDIT, dodajKonsultacje, konsultacjeUczestnika, rejestrZgod } from '../../../../lib/stan.ts';

/**
 * Kategoria ryzyka na potrzeby terminarza.
 *
 * Pulę pilną otwiera kategoria CZERWONA, a kategoria pochodzi z danych
 * zdrowotnych. Po wycofaniu zgody nie mamy podstawy, żeby ją otworzyć — ale
 * terminy planowe zostają dostępne. Odcięcie kogoś od wizyty u lekarza za
 * skorzystanie z prawa do wycofania zgody byłoby karą za to prawo.
 */
function kategoriaDoTerminarza(): { kategoria: RiskCategory; zeZgody: boolean } {
  const zeZgody = isActive(rejestrZgod(), 'dane_zdrowotne');
  return { kategoria: zeZgody ? OCENA.riskCategory : 'ZIELONA', zeZgody };
}

const UWAGA_O_KARCIE =
  'Rezerwacja terminu nie jest zgodą na udostępnienie Karty Pacjenta. ' +
  'To osobna decyzja — udzielisz jej w ustawieniach zgód, jeśli zechcesz.';

export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) => {
    const { kategoria, zeZgody } = kategoriaDoTerminarza();
    const moje = konsultacjeUczestnika().filter(
      (konsultacja) => konsultacja.participantId === konto.userId,
    );

    return ok(
      {
        terminy: widokTerminarza(TERMINY, konsultacjeUczestnika(), kategoria, TERAZ_LOKALNY).map(
          ({ termin, dostepny, powod }) => ({
            id: termin.id,
            start: termin.start,
            minut: termin.minut,
            rodzaj: termin.rodzaj,
            dostepny,
            powod: powod ?? null,
          }),
        ),
        moje: moje.map((konsultacja) => ({
          id: konsultacja.id,
          terminId: konsultacja.terminId,
          status: konsultacja.status,
          zarezerwowana: konsultacja.zarezerwowana,
        })),
        // Klient mobilny ma prawo wiedzieć, że lista pilnych jest zamknięta
        // z braku zgody, a nie z braku wolnych terminów.
        pulaPilnaOcenionaZeZgody: zeZgody,
        uwaga: UWAGA_O_KARCIE,
      },
      { wrazliwe: true },
    );
  });
}

/**
 * Rezerwacja terminu.
 *
 * Termin jest w ciele żądania, a nie w ścieżce — rezerwacja tworzy nowy zasób
 * w kolekcji konsultacji, a nie modyfikuje termin. Sprawdzenie uprawnienia
 * mówi jedno: rezerwuje się **wyłącznie dla siebie**.
 */
export function POST(request: Request): Promise<Response> {
  return zKontem(request, async (konto) => {
    const cialo: unknown = await request.json().catch(() => undefined);
    const terminId = (cialo as { terminId?: unknown } | undefined)?.terminId;
    if (typeof terminId !== 'string' || terminId === '') {
      throw new BledneZadanieError('Pole "terminId" jest wymagane.');
    }

    const termin = terminPoId(terminId);
    if (termin === undefined) return blad('nie_znaleziono', `Nie ma terminu o id ${terminId}.`);

    assertCan(konto.actor, 'rezerwacja_konsultacji', {
      kind: 'konsultacja',
      organizationId: ORGANIZACJA,
      clinicianId: termin.clinicianId,
      participantId: konto.userId,
    });

    const powod = (cialo as { powod?: unknown }).powod;
    const konsultacja = zarezerwuj(konsultacjeUczestnika(), {
      termin,
      participantId: konto.userId,
      subjectRef: konto.subjectRef,
      kategoria: kategoriaDoTerminarza().kategoria,
      teraz: TERAZ_LOKALNY,
      ...(typeof powod === 'string' ? { powod } : {}),
    });

    dodajKonsultacje(konsultacja);

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'rezerwacja_konsultacji',
      zasob: `termin/${termin.id}`,
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        konsultacja: {
          id: konsultacja.id,
          terminId: konsultacja.terminId,
          start: termin.start,
          status: konsultacja.status,
        },
        uwaga: UWAGA_O_KARCIE,
      },
      { status: 201, wrazliwe: true },
    );
  });
}
