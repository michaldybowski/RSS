import { OPIS_AKCJI } from '@longevity/gdpr';

import { zKontem } from '../../../../../lib/auth.ts';
import { ok } from '../../../../../lib/odpowiedzi.ts';
import { AUDIT } from '../../../../../lib/stan.ts';

/**
 * Rejestr dostępu do własnych danych.
 *
 * Bez tego punktu końcowego audit log byłby obietnicą bez pokrycia: zapisujemy
 * każde otwarcie Karty Pacjenta, ale osoba, której to dotyczy, nie miałaby jak
 * tego zobaczyć. Specyfikacja mówi wprost, że udostępnienie lekarzowi ma być
 * widoczne dla uczestnika.
 *
 * Filtr po pseudonimie jest po stronie serwera i nie da się go rozszerzyć
 * parametrem — nie ma tu zapytania, którym ktoś obejrzy cudzy rejestr.
 */
export function GET(request: Request): Promise<Response> {
  return zKontem(request, (konto) =>
    ok(
      {
        wpisy: AUDIT.odczytaj({ subjectRef: konto.subjectRef }).map((wpis) => ({
          id: wpis.id,
          kiedy: wpis.at,
          akcja: wpis.akcja,
          // Kod dla klienta i zdanie dla człowieka jadą razem. Sam kod zmusiłby
          // każdą aplikację do własnego słownika, a sam opis odebrałby jej
          // możliwość rozgałęzienia się na typie zdarzenia.
          opis: OPIS_AKCJI[wpis.akcja],
          zasob: wpis.zasob,
          // Kto — jako identyfikator aktora, nie jako imię i nazwisko.
          // Do rozpoznania „to był mój lekarz" wystarczy, a nie buduje
          // przy okazji katalogu personelu dostępnego z aplikacji.
          aktor: wpis.actorRef,
          kontekst: wpis.kontekst,
        })),
      },
      { wrazliwe: true },
    ),
  );
}
