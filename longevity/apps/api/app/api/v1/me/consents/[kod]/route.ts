import {
  definitionOf,
  grant,
  operationsAffectedByWithdrawal,
  planGenerationMode,
  withdraw,
  type ConsentCode,
} from '@longevity/consent';

import { zKontem } from '../../../../../../lib/auth.ts';
import { TERAZ } from '../../../../../../lib/dane.ts';
import { BledneZadanieError, ok } from '../../../../../../lib/odpowiedzi.ts';
import { AUDIT, rejestrZgod, zapiszRejestrZgod } from '../../../../../../lib/stan.ts';

/**
 * Udzielenie albo wycofanie zgody.
 *
 * Odpowiedź mówi wprost, co się zmieniło w działaniu programu. Wycofanie zgody
 * na AI nie odcina uczestnika — przełącza generowanie planu na ścieżkę ręczną,
 * i właśnie to klient ma pokazać zamiast ogólnego „zapisano".
 */
export function POST(
  request: Request,
  { params }: { params: Promise<{ kod: string }> },
): Promise<Response> {
  return zKontem(request, async (konto) => {
    const { kod } = await params;
    const definicja = definitionOf(kod as ConsentCode);

    const cialo = (await request.json().catch(() => null)) as { udzielona?: unknown } | null;
    if (cialo === null || typeof cialo.udzielona !== 'boolean') {
      throw new BledneZadanieError('Ciało żądania musi zawierać pole "udzielona" typu boolean.');
    }

    const teraz = TERAZ.toISOString();
    const dowod = { ipHash: 'prototyp', userAgentHash: 'prototyp' };

    zapiszRejestrZgod(
      cialo.udzielona
        ? grant(rejestrZgod(), definicja.code, teraz, dowod)
        : withdraw(rejestrZgod(), definicja.code, teraz, dowod),
    );

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'zmiana_zgody',
      zasob: `zgoda/${definicja.code}`,
      kontekst: { udzielona: String(cialo.udzielona) },
      at: teraz,
    });

    return ok(
      {
        kod: definicja.code,
        udzielona: cialo.udzielona,
        skutek: cialo.udzielona ? null : definicja.withdrawalEffect,
        wstrzymaneOperacje: cialo.udzielona ? [] : operationsAffectedByWithdrawal(definicja.code),
        trybGenerowaniaPlanu: planGenerationMode(rejestrZgod()),
      },
      { wrazliwe: true },
    );
  });
}
