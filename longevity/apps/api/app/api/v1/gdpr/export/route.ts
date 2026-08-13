import { doFormatuPrzenoszalnego, zbudujEksport, type ZbiorPodmiotu } from '@longevity/gdpr';

import { zKontem } from '../../../../../lib/auth.ts';
import { OCENA, TERAZ } from '../../../../../lib/dane.ts';
import { AUDIT, rejestrZgod } from '../../../../../lib/stan.ts';

/**
 * Eksport własnych danych (art. 15 i 20 RODO).
 *
 * Uczestnik pobiera **swoje** dane, więc dostaje je w całości — inaczej niż
 * administrator, który w panelu widzi wyłącznie metadane zapieczętowanego
 * pakietu. Ta różnica jest sednem: ograniczenie chroni osobę przed personelem,
 * a nie osobę przed nią samą.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) => {
    const zbior: ZbiorPodmiotu = {
      subjectRef: konto.subjectRef,
      uczestnictwo: { od: '2026-09-01' },
      rekordy: [
        {
          id: 'r-zgody',
          rodzaj: 'zgoda',
          utworzono: '2026-09-01',
          dane: { wpisy: rejestrZgod().length },
        },
        {
          id: 'r-health-score',
          rodzaj: 'health_score',
          utworzono: '2026-09-02',
          dane: { wynik: OCENA.healthScore.overall, kategoria: OCENA.riskCategory },
        },
      ],
    };

    AUDIT.dopisz({
      actorRef: konto.userId,
      subjectRef: konto.subjectRef,
      akcja: 'eksport_danych',
      zasob: 'gdpr/export',
      at: TERAZ.toISOString(),
    });

    const pakiet = zbudujEksport(zbior, TERAZ.toISOString());

    return new Response(doFormatuPrzenoszalnego(pakiet), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="longevity-${konto.subjectRef}.json"`,
      },
    });
  });
}
