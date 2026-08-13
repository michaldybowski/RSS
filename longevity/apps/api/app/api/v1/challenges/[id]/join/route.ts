import { dolacz } from '@longevity/challenges';

import { zKontem } from '../../../../../../lib/auth.ts';
import { DZISIAJ, OCENA, PAKIET_UCZESTNIKA, WYZWANIA } from '../../../../../../lib/dane.ts';
import { blad, ok } from '../../../../../../lib/odpowiedzi.ts';
import { dodajZapis, zapisyWyzwan } from '../../../../../../lib/stan.ts';

/**
 * Zapis do wyzwania.
 *
 * Kwalifikacja jest sprawdzana tutaj, po stronie serwera. Klient mobilny może
 * mieć nieaktualną listę albo własnego użytkownika z narzędziami do żądań —
 * ukrycie przycisku nie jest zabezpieczeniem.
 */
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return zKontem(request, async (konto) => {
    const { id } = await params;
    const wyzwanie = WYZWANIA.find((pozycja) => pozycja.id === id);
    if (wyzwanie === undefined) return blad('nie_znaleziono', `Nie ma wyzwania o id ${id}.`);

    if (zapisyWyzwan().some((zapis) => zapis.wyzwanieId === id)) {
      return blad('bledne_zadanie', 'Jesteś już zapisany do tego wyzwania.');
    }

    const zapis = dolacz(
      wyzwanie,
      { ocena: OCENA, pakiet: PAKIET_UCZESTNIKA },
      konto.subjectRef,
      DZISIAJ,
    );

    dodajZapis(zapis);
    return ok({ zapis }, { status: 201, wrazliwe: true });
  });
}
