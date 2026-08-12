/**
 * Kwoty i podatek (specyfikacja 13).
 *
 * Wszystko w groszach, jako liczby całkowite. Rozliczenia liczone na liczbach
 * zmiennoprzecinkowych rozjeżdżają się o grosze przy sumowaniu setek pozycji,
 * a różnica między notą a wyciągiem bankowym jest problemem księgowości,
 * nie zaokrągleniem.
 */

/** Kwota w groszach. Zawsze liczba całkowita. */
export type Grosze = number;

/** Stawki dopuszczone w cenniku (specyfikacja 13, decyzja 4). */
export type VatRate = '23' | '8' | '5' | '0' | 'zw';

export const VAT_RATES: readonly VatRate[] = ['23', '8', '5', '0', 'zw'];

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertGrosze(value: number, label = 'kwota'): Grosze {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} musi być liczbą całkowitą groszy, otrzymano ${value}.`);
  }
  if (value < 0) throw new MoneyError(`${label} nie może być ujemna, otrzymano ${value}.`);
  return value;
}

/**
 * Stawka jako liczba całkowita punktów procentowych.
 *
 * Zwolnienie i stawka zerowa dają ten sam podatek, ale nie ten sam opis
 * na dokumencie — dlatego są odrębnymi wartościami, a nie jedną.
 */
export function vatPercent(rate: VatRate): number {
  switch (rate) {
    case '23':
      return 23;
    case '8':
      return 8;
    case '5':
      return 5;
    case '0':
    case 'zw':
      return 0;
  }
}

/**
 * Podatek od pojedynczej pozycji, zaokrąglany do pełnego grosza.
 *
 * Mnożymy przez licznik i dzielimy przez sto, zamiast mnożyć przez ułamek
 * dziesiętny: `nettoGr * 23` jest dokładne, a `nettoGr * 0.23` już nie —
 * 0,23 nie ma skończonego rozwinięcia dwójkowego. Przy stawce 5% i kwocie
 * kończącej się na połówce grosza różnica decyduje o kierunku zaokrąglenia.
 *
 * Podatek liczymy od pozycji, nie od sumy dokumentu. Oba warianty są
 * dopuszczalne, ale dają różne wyniki — wybór musi być jeden i jawny.
 */
export function vatAmount(nettoGr: Grosze, rate: VatRate): Grosze {
  assertGrosze(nettoGr, 'kwota netto');
  return Math.round((nettoGr * vatPercent(rate)) / 100);
}

export function grossAmount(nettoGr: Grosze, rate: VatRate): Grosze {
  return nettoGr + vatAmount(nettoGr, rate);
}

/** Udział procentowy kwoty, zaokrąglany do pełnego grosza. */
export function percentOf(nettoGr: Grosze, percent: number): Grosze {
  assertGrosze(nettoGr, 'kwota netto');
  if (percent < 0 || percent > 100) {
    throw new MoneyError(`Udział musi mieścić się w 0-100%, otrzymano ${percent}.`);
  }
  return Math.round((nettoGr * percent) / 100);
}

export function formatPln(grosze: Grosze): string {
  const znak = grosze < 0 ? '-' : '';
  const abs = Math.abs(grosze);
  return `${znak}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} zł`;
}

export function sum(values: readonly Grosze[]): Grosze {
  return values.reduce((total, value) => total + value, 0);
}
