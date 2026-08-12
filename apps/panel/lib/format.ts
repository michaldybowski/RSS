/**
 * Formatowanie liczb w interfejsie.
 *
 * „10500 kroków" czyta się o sekundę dłużej niż „10 500 kroków", a na ekranie
 * z historią kilkunastu dni ta sekunda mnoży się przez każdy wiersz.
 * Spacja nierozdzielająca, żeby liczba nie łamała się na końcu linii.
 */
export function liczba(wartosc: number): string {
  return String(wartosc).replace(/\B(?=(\d{3})+(?!\d))/gu, ' ');
}
