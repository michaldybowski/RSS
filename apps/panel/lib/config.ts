import type { ConsentCode } from '@longevity/consent';

/**
 * Data odniesienia prototypu. Wstrzykiwana zamiast `new Date()`, żeby demo
 * dawało ten sam wynik niezależnie od dnia uruchomienia — inaczej flaga
 * o nieaktualnych badaniach zapalałaby się losowo w zależności od tego,
 * kiedy ktoś włączy panel.
 */
export const NOW = new Date('2026-07-26T00:00:00Z');

export const ONBOARDING_CONSENTS: readonly ConsentCode[] = [
  'regulamin',
  'dane_zdrowotne',
  'przetwarzanie_ai',
];
