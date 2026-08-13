import { zapiszPomiar, type Pomiar, type ZrodloPomiaru } from '@longevity/challenges';

import { zKontem } from '../../../../../lib/auth.ts';
import { DZISIAJ, TERAZ, WYZWANIA } from '../../../../../lib/dane.ts';
import { blad, BledneZadanieError, ok } from '../../../../../lib/odpowiedzi.ts';
import { AUDIT, pomiaryWyzwan, zapisyWyzwan, zapiszPomiary } from '../../../../../lib/stan.ts';

interface Probka {
  wyzwanieId?: unknown;
  dzien?: unknown;
  wartosc?: unknown;
  zrodlo?: unknown;
}

/**
 * Wsad pomiarów z aplikacji mobilnej (HealthKit / Health Connect).
 *
 * Partia jest przetwarzana **próbka po próbce z osobnym wynikiem**. Odrzucenie
 * całej paczki z powodu jednego dnia poza oknem oznaczałoby, że telefon po
 * tygodniu bez zasięgu nie wgra niczego. Odpowiedź mówi, co weszło i co nie —
 * i dlaczego, żeby klient nie musiał zgadywać ani ponawiać w pętli.
 */
export function POST(request: Request): Promise<Response> {
  return zKontem(request, async (konto) => {
    const cialo = (await request.json().catch(() => null)) as { probki?: unknown } | null;
    if (cialo === null || !Array.isArray(cialo.probki)) {
      throw new BledneZadanieError('Ciało żądania musi zawierać tablicę "probki".');
    }
    if (cialo.probki.length > 500) {
      return blad('bledne_zadanie', 'Partia może zawierać najwyżej 500 próbek.');
    }

    let stan = pomiaryWyzwan();
    const przyjete: Pomiar[] = [];
    const odrzucone: { indeks: number; powod: string }[] = [];

    for (const [indeks, surowa] of (cialo.probki as Probka[]).entries()) {
      const wyzwanie = WYZWANIA.find((pozycja) => pozycja.id === surowa.wyzwanieId);
      const zapis = zapisyWyzwan().find((pozycja) => pozycja.wyzwanieId === surowa.wyzwanieId);

      if (wyzwanie === undefined || zapis === undefined) {
        odrzucone.push({ indeks, powod: 'Nie jesteś zapisany do tego wyzwania.' });
        continue;
      }
      if (typeof surowa.wartosc !== 'number' || typeof surowa.dzien !== 'string') {
        odrzucone.push({ indeks, powod: 'Próbka wymaga pól "dzien" (tekst) i "wartosc" (liczba).' });
        continue;
      }

      const pomiar: Pomiar = {
        wyzwanieId: wyzwanie.id,
        dzien: surowa.dzien,
        wartosc: surowa.wartosc,
        zrodlo: (surowa.zrodlo === 'reczne' ? 'reczne' : 'wearable') as ZrodloPomiaru,
      };

      try {
        stan = zapiszPomiar(stan, pomiar, { wyzwanie, od: zapis.od, dzisiaj: DZISIAJ });
        przyjete.push(pomiar);
      } catch (powod) {
        odrzucone.push({
          indeks,
          powod: powod instanceof Error ? powod.message : 'Próbka odrzucona.',
        });
      }
    }

    zapiszPomiary(stan);

    if (przyjete.length > 0) {
      AUDIT.dopisz({
        actorRef: konto.userId,
        subjectRef: konto.subjectRef,
        akcja: 'zapis_danych_zdrowotnych',
        zasob: 'wearables/samples',
        kontekst: { przyjete: String(przyjete.length), odrzucone: String(odrzucone.length) },
        at: TERAZ.toISOString(),
      });
    }

    return ok(
      { przyjetych: przyjete.length, odrzuconych: odrzucone.length, odrzucone },
      { status: odrzucone.length === 0 ? 201 : 207, wrazliwe: true },
    );
  });
}
