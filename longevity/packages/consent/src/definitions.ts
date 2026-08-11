/**
 * Katalog zgód, wersja 1.
 *
 * Treści są robocze i wymagają redakcji prawnej przed produkcją — zaznaczone
 * w bramce z sekcji 12.6. Struktura jest docelowa: każda zgoda ma odrębną
 * podstawę prawną, odrębny cykl życia i jawnie opisany skutek wycofania.
 *
 * Zasada: jedna zgoda = jeden cel. Zgoda pakietowa („zgadzam się na wszystko")
 * jest nieważna, bo nie jest konkretna ani dobrowolna.
 */

import type { ConsentCode, ConsentDefinition } from './types.ts';

export const CONSENT_DEFINITIONS: readonly ConsentDefinition[] = [
  {
    code: 'regulamin',
    version: '1.0.0',
    title: 'Regulamin i polityka prywatności',
    text:
      'Akceptuję regulamin programu Longevity oraz przyjmuję do wiadomości zasady przetwarzania ' +
      'danych opisane w polityce prywatności. Rozumiem, że materiały programu nie stanowią ' +
      'diagnozy medycznej ani zalecenia leczenia, a plan wymaga konsultacji lekarskiej przed wdrożeniem.',
    legalBasis: 'art6_1b_umowa',
    collectedAtOnboarding: true,
    withdrawalEffect: 'Zakończenie uczestnictwa w programie i usunięcie konta.',
    effectiveFrom: '2026-07-26',
  },
  {
    code: 'dane_zdrowotne',
    version: '1.0.0',
    title: 'Przetwarzanie danych o zdrowiu',
    text:
      'Wyrażam wyraźną zgodę na przetwarzanie moich danych dotyczących zdrowia — odpowiedzi ' +
      'kwestionariusza, wyników badań laboratoryjnych oraz wskaźników wyliczonych na ich podstawie — ' +
      'w celu przygotowania indywidualnego planu i oceny postępów. Wiem, że zgodę mogę wycofać ' +
      'w każdej chwili, a wycofanie nie wpływa na zgodność z prawem przetwarzania sprzed wycofania.',
    legalBasis: 'art9_2a_zgoda_wyrazna',
    collectedAtOnboarding: true,
    withdrawalEffect:
      'Zatrzymanie oceny zdrowia i generowania planów. Dane zdrowotne zostają usunięte ' +
      'zgodnie z polityką retencji. Konto pozostaje aktywne.',
    effectiveFrom: '2026-07-26',
  },
  {
    code: 'przetwarzanie_ai',
    version: '1.0.0',
    title: 'Przygotowanie planu z użyciem systemu AI',
    text:
      'Wyrażam zgodę na to, by opisowa część mojego planu została przygotowana z użyciem systemu ' +
      'sztucznej inteligencji dostarczanego przez podmiot spoza Europejskiego Obszaru Gospodarczego. ' +
      'Przekazywany zakres jest ograniczony: nie obejmuje mojego imienia, nazwiska, danych ' +
      'kontaktowych, daty urodzenia ani surowych wyników badań. Ocena ryzyka zdrowotnego jest ' +
      'wykonywana regułami po stronie platformy i system AI nie może jej zmienić.',
    legalBasis: 'art6_1a_zgoda',
    collectedAtOnboarding: true,
    withdrawalEffect:
      'Plan nie będzie generowany automatycznie. Pozostaje ścieżka ręczna — plan przygotowany ' +
      'przez specjalistę na podstawie tej samej oceny ryzyka.',
    effectiveFrom: '2026-07-26',
  },
  {
    code: 'udostepnienie_lekarzowi',
    version: '1.0.0',
    title: 'Udostępnienie Karty Pacjenta lekarzowi',
    text:
      'Wyrażam wyraźną zgodę na udostępnienie mojej Karty Pacjenta — podsumowania wywiadu, ' +
      'wyników badań i wygenerowanego planu — lekarzowi prowadzącemu konsultację w ramach programu. ' +
      'Każde otwarcie karty jest odnotowywane i widoczne dla mnie w panelu.',
    legalBasis: 'art9_2a_zgoda_wyrazna',
    collectedAtOnboarding: false,
    withdrawalEffect: 'Lekarz traci dostęp do Karty Pacjenta. Reszta programu działa bez zmian.',
    effectiveFrom: '2026-07-26',
  },
  {
    code: 'wearables',
    version: '1.0.0',
    title: 'Import danych z urządzeń noszonych',
    text:
      'Wyrażam wyraźną zgodę na import danych z mojego urządzenia noszonego lub aplikacji zdrowotnej — ' +
      'kroków, tętna, snu i aktywności — w celu automatycznej korekty planu.',
    legalBasis: 'art9_2a_zgoda_wyrazna',
    collectedAtOnboarding: false,
    withdrawalEffect:
      'Import danych zostaje zatrzymany, a połączenie z urządzeniem usunięte. ' +
      'Plan i pozostałe funkcje działają bez zmian.',
    effectiveFrom: '2026-07-26',
  },
  {
    code: 'komunikacja_marketingowa',
    version: '1.0.0',
    title: 'Informacje o programie i wydarzeniach',
    text:
      'Wyrażam zgodę na otrzymywanie informacji o nowych materiałach, wyzwaniach i wydarzeniach ' +
      'programu Longevity.',
    legalBasis: 'art6_1a_zgoda',
    collectedAtOnboarding: false,
    withdrawalEffect: 'Zaprzestanie wysyłki. Nie wpływa na żadną funkcję programu.',
    effectiveFrom: '2026-07-26',
  },
];

const BY_CODE = new Map(CONSENT_DEFINITIONS.map((definition) => [definition.code, definition]));

export class UnknownConsentError extends Error {
  constructor(code: string) {
    super(`Nieznana zgoda: "${code}".`);
    this.name = 'UnknownConsentError';
  }
}

export function definitionOf(code: ConsentCode): ConsentDefinition {
  const definition = BY_CODE.get(code);
  if (definition === undefined) throw new UnknownConsentError(code);
  return definition;
}

export function onboardingConsents(): readonly ConsentDefinition[] {
  return CONSENT_DEFINITIONS.filter((definition) => definition.collectedAtOnboarding);
}
