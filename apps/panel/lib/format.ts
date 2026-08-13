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

/**
 * Odmiana liczebnika. „2 modułów" wygląda jak błąd programu, a nie jak zdanie —
 * a to jest tekst, który uczestnik czyta na każdym ekranie ścieżki.
 */
export function odmiana(ile: number, formy: readonly [string, string, string]): string {
  const reszta10 = ile % 10;
  const reszta100 = ile % 100;

  if (ile === 1) return `1 ${formy[0]}`;
  if (reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14)) {
    return `${ile} ${formy[1]}`;
  }
  return `${ile} ${formy[2]}`;
}

export const MODUL: readonly [string, string, string] = ['moduł', 'moduły', 'modułów'];
