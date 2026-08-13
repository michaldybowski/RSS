import {
  katalog,
  ocenQuiz,
  quizMaterialu,
  zaliczDeklaracja,
  zaliczSprawdzianem,
} from '@longevity/academy';

import { zKontem } from '../../../../../../lib/auth.ts';
import { MATERIALY, PAKIET_UCZESTNIKA, QUIZY, TERAZ } from '../../../../../../lib/dane.ts';
import { BledneZadanieError, blad, ok } from '../../../../../../lib/odpowiedzi.ts';
import { zaliczeniaUczestnika, zapiszZaliczenia } from '../../../../../../lib/stan.ts';

/**
 * Zaliczenie materiału.
 *
 * Dwie ścieżki i żadnej trzeciej. Materiał bez sprawdzianu zalicza deklaracja
 * uczestnika — i jest to zapisane wprost, bo „obejrzane" to nie to samo co
 * „zrozumiane", a zaświadczenie ma mówić, która z tych rzeczy zaszła.
 * Materiał ze sprawdzianem zalicza wyłącznie wynik quizu: próba zaliczenia go
 * deklaracją kończy się błędem z pakietu, a nie cichym zaliczeniem.
 *
 * Materiału szukamy w katalogu ograniczonym pakietem, więc treść wycofana
 * i treść spoza pakietu dają 404 — tak samo jak przy odczycie biblioteki.
 */
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return zKontem(request, async () => {
    const { id } = await params;

    const material = katalog(MATERIALY, { pakiet: PAKIET_UCZESTNIKA }).find(
      (pozycja) => pozycja.id === id,
    );
    if (material === undefined) {
      return blad('nie_znaleziono', `W Twojej bibliotece nie ma materiału o id ${id}.`);
    }

    const cialo: unknown = await request.json().catch(() => undefined);
    const odpowiedzi = (cialo as { odpowiedzi?: unknown } | undefined)?.odpowiedzi;
    const kiedy = TERAZ.toISOString();
    const zaliczenia = zaliczeniaUczestnika();

    if (odpowiedzi === undefined) {
      // Rzuci `WymaganySprawdzianError` (400), jeśli materiał ma sprawdzian.
      // Sprawdzenie zostaje w pakiecie — powielone tutaj rozjechałoby się
      // z regułą przy pierwszej zmianie.
      zapiszZaliczenia(zaliczDeklaracja(zaliczenia, material, kiedy));
      return ok({ sposob: 'deklaracja', materialId: material.id, kiedy }, { wrazliwe: true });
    }

    if (typeof odpowiedzi !== 'object' || odpowiedzi === null || Array.isArray(odpowiedzi)) {
      throw new BledneZadanieError(
        'Pole "odpowiedzi" musi być obiektem: identyfikator pytania → indeks odpowiedzi.',
      );
    }

    const quiz = quizMaterialu(QUIZY, material.id);
    if (quiz === undefined) {
      throw new BledneZadanieError('Ten materiał nie ma sprawdzianu — zalicza go deklaracja.');
    }

    const wynik = ocenQuiz(quiz, odpowiedzi as Readonly<Record<string, number>>);
    zapiszZaliczenia(zaliczSprawdzianem(zaliczenia, material, wynik, kiedy));

    return ok(
      {
        sposob: 'quiz',
        materialId: material.id,
        kiedy,
        wynik: {
          procent: wynik.procent,
          poprawnych: wynik.poprawnych,
          pytan: wynik.pytan,
          // Wyjaśnienia jadą także przy wyniku zaliczonym — sprawdzian bez nich
          // niczego nie uczy, a to jest Akademia, nie egzamin.
          pytania: wynik.pytania,
        },
      },
      { wrazliwe: true },
    );
  });
}
