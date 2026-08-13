import { assertOperation } from '@longevity/consent';

import { zKontem } from '../../../../lib/auth.ts';
import { OCENA, TERAZ } from '../../../../lib/dane.ts';
import { ok } from '../../../../lib/odpowiedzi.ts';
import { AUDIT, rejestrZgod } from '../../../../lib/stan.ts';

/**
 * Health Score wraz ze składowymi.
 *
 * Trzy rzeczy dzieją się tu zawsze i w tej kolejności: bramka zgody, wpis
 * w audit logu, dopiero potem dane. Odwrócenie kolejności dałoby log, który
 * zapisuje odczyt, który się nie odbył, albo — gorzej — dane wydane przed
 * sprawdzeniem zgody.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) => {
    assertOperation(rejestrZgod(), 'intake_submit');

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'odczyt_danych_zdrowotnych',
      zasob: 'health-score',
      at: TERAZ.toISOString(),
    });

    return ok(
      {
        wynik: OCENA.healthScore.overall,
        wersjaScoringu: OCENA.healthScore.scoringVersion,
        kategoriaRyzyka: OCENA.riskCategory,
        skladowe: OCENA.healthScore.components.map((component) => ({
          nazwa: component.component,
          wynik: component.score,
          obnizenia: component.contributions,
        })),
        flagi: OCENA.flags.map((flaga) => ({
          kod: flaga.code,
          poziom: flaga.level,
          komunikat: flaga.message,
        })),
        wersjaRegul: OCENA.rulesetVersion,
        tryb: OCENA.mode,
      },
      { wrazliwe: true },
    );
  });
}
