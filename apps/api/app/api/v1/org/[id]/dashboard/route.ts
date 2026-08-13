import { assertCan } from '@longevity/access';
import {
  auditDashboardAccess,
  buildDashboard,
  type DashboardFilters,
  type Metric,
} from '@longevity/analytics';

import { zKontem } from '../../../../../../lib/auth.ts';
import { KOHORTA, TERAZ } from '../../../../../../lib/dane.ts';
import { blad, ok } from '../../../../../../lib/odpowiedzi.ts';
import { AUDIT } from '../../../../../../lib/stan.ts';

const METRYKI: readonly string[] = [
  'uczestnictwo',
  'rozklad_health_score',
  'wyzwania',
  'frekwencja_warsztatow',
];

/**
 * Parametry, które identyfikowałyby osobę.
 *
 * Specyfikacja mówi wprost: „Endpoint dashboardu **nie przyjmuje** parametru
 * identyfikującego osobę. To ograniczenie kontraktu, nie tylko implementacji".
 * Dlatego odrzucamy je jawnym błędem zamiast po cichu ignorować — ciche
 * pominięcie zostawiałoby złudzenie, że kiedyś zadziała.
 */
const ZAKAZANE_PARAMETRY: readonly string[] = [
  'participantId',
  'subjectRef',
  'userId',
  'email',
  'pesel',
  'imie',
  'nazwisko',
];

export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return zKontem(request, async (konto) => {
    const { id } = await params;
    const zapytanie = new URL(request.url).searchParams;

    const zakazany = ZAKAZANE_PARAMETRY.find((nazwa) => zapytanie.has(nazwa));
    if (zakazany !== undefined) {
      return blad(
        'bledne_zadanie',
        `Dashboard nie przyjmuje parametru "${zakazany}". Zestawienia są wyłącznie zbiorcze.`,
        { zakazaneParametry: ZAKAZANE_PARAMETRY },
      );
    }

    const metric = zapytanie.get('metric') ?? 'uczestnictwo';
    if (!METRYKI.includes(metric)) {
      return blad('bledne_zadanie', `Nieznana metryka "${metric}".`, { dostepne: METRYKI });
    }

    assertCan(konto.actor, 'odczyt_dashboardu', { kind: 'organizacja', organizationId: id });

    const filters: DashboardFilters = {
      ...(zapytanie.get('unitId') !== null ? { unitId: zapytanie.get('unitId')! } : {}),
      ...(zapytanie.get('ageBand') !== null
        ? { ageBand: zapytanie.get('ageBand') as DashboardFilters['ageBand'] }
        : {}),
      ...(zapytanie.get('sex') !== null
        ? { sex: zapytanie.get('sex') as DashboardFilters['sex'] }
        : {}),
    };

    const query = { organizationId: id, metric: metric as Metric, filters };
    const wynik = buildDashboard(KOHORTA, query);
    const wpis = auditDashboardAccess(konto.actor.userId, query, wynik, TERAZ.toISOString());

    AUDIT.dopisz({
      actorRef: konto.actor.userId,
      akcja: 'odczyt_dashboardu',
      zasob: `organizacja/${id}`,
      kontekst: { metric: wpis.metric, ...wpis.filters, outcome: wpis.outcome },
      at: TERAZ.toISOString(),
    });

    return ok(wynik, { wrazliwe: true });
  });
}
