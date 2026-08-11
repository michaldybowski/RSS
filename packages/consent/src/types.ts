/**
 * Model zgód (specyfikacja 12.1–12.3).
 *
 * Zgoda nie jest polem w formularzu — ma własny cykl życia: treść, wersję,
 * datę udzielenia, dowód i możliwość wycofania. Dlatego krok 0 kwestionariusza
 * obsługuje ten pakiet, a nie definicja pytań.
 */

export type LegalBasis =
  | 'art6_1b_umowa'
  | 'art6_1a_zgoda'
  | 'art9_2a_zgoda_wyrazna';

export type ConsentCode =
  | 'regulamin'
  | 'dane_zdrowotne'
  | 'przetwarzanie_ai'
  | 'udostepnienie_lekarzowi'
  | 'wearables'
  | 'komunikacja_marketingowa';

export interface ConsentDefinition {
  code: ConsentCode;
  /** Zmiana treści podbija wersję i wymusza ponowne zebranie. */
  version: string;
  title: string;
  text: string;
  legalBasis: LegalBasis;
  /** Czy zgoda jest zbierana w kroku 0, przed pierwszym pytaniem kwestionariusza. */
  collectedAtOnboarding: boolean;
  /** Co przestaje działać po wycofaniu. Pokazywane uczestnikowi przed potwierdzeniem. */
  withdrawalEffect: string;
  effectiveFrom: string;
}

/**
 * Dowód udzielenia. Adres i przeglądarka trzymane jako skróty — do wykazania
 * okoliczności wystarczą, do identyfikacji nie.
 */
export interface ConsentEvidence {
  ipHash: string;
  userAgentHash: string;
}

export type ConsentEvent =
  | {
      kind: 'granted';
      code: ConsentCode;
      version: string;
      at: string;
      evidence: ConsentEvidence;
    }
  | {
      kind: 'withdrawn';
      code: ConsentCode;
      at: string;
      evidence: ConsentEvidence;
    };

/** Rejestr jest listą zdarzeń tylko do dopisywania. Historia jest pełna. */
export type ConsentLedger = readonly ConsentEvent[];

export interface ConsentStatus {
  code: ConsentCode;
  granted: boolean;
  /** Wersja, na którą zgoda została udzielona. */
  grantedVersion?: string;
  /** Zgoda udzielona, ale na starszą treść — wymaga ponownego zebrania. */
  requiresRenewal: boolean;
  grantedAt?: string;
  withdrawnAt?: string;
}

/** Operacje, które wymagają zgody. Lista jest zamknięta — nowa operacja wymaga decyzji. */
export type GatedOperation =
  | 'intake_submit'
  | 'plan_generate'
  | 'clinician_view'
  | 'wearable_link'
  | 'marketing_send';
