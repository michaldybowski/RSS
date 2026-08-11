/**
 * Lista pól, które nigdy nie mogą opuścić platformy w kierunku modelu językowego
 * (decyzja 3, specyfikacja 12.5).
 *
 * Egzekwowana dwutorowo:
 *  - konstrukcyjnie — `buildModelPayload` buduje ładunek z białej listy,
 *    więc nowe pole w modelu danych nie wycieka samo z siebie;
 *  - kontrolnie — `assertNoForbiddenFields` skanuje gotowy ładunek przed
 *    wysyłką i przerywa, jeśli cokolwiek się prześlizgnęło.
 *
 * Sama biała lista nie wystarcza: ktoś kiedyś doda pole do payloadu w dobrej
 * wierze. Skaner jest po to, żeby to zatrzymać.
 */

/** Nazwy kluczy zakazanych bezwarunkowo, porównywane bez względu na wielkość liter. */
export const FORBIDDEN_KEYS: readonly string[] = [
  'imie',
  'imię',
  'firstname',
  'nazwisko',
  'lastname',
  'surname',
  'fullname',
  'email',
  'mail',
  'telefon',
  'phone',
  'pesel',
  'dataurodzenia',
  'dateofbirth',
  'dob',
  'birthdate',
  'adres',
  'address',
  'pracodawca',
  'employer',
  'organizacja',
  'organization',
  'organizationid',
  'dzial',
  'dział',
  'department',
  'lokalizacja',
  'location',
  'userid',
  'useraccountid',
  'intakeid',
  'ip',
  'iphash',
  'nip',
];

/**
 * Wzorce wartości, których obecność zdradza wyciek nawet przy niewinnej nazwie
 * klucza (np. `note: "kontakt: jan.kowalski@firma.pl"`).
 */
export const FORBIDDEN_VALUE_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]+/u, // adres e-mail
  /\b\d{11}\b/u, // PESEL
  /\b\d{4}-\d{2}-\d{2}\b/u, // pełna data — w ładunku ma być wiek, nie data
  /\b(?:\+48\s?)?(?:\d{3}[\s-]?){3}\b/u, // numer telefonu
];

export class ForbiddenFieldError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(
      `Ładunek dla modelu językowego zawiera zabronioną treść w "${path}": ${reason}. ` +
        'Wysyłka wstrzymana (decyzja 3, specyfikacja 12.5).',
    );
    this.name = 'ForbiddenFieldError';
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/gu, '');
}

/**
 * Rekurencyjny skan ładunku. Rzuca przy pierwszym trafieniu — cichy log
 * byłby gorszy niż przerwana generacja planu.
 */
export function assertNoForbiddenFields(payload: unknown, path = '$'): void {
  if (payload === null || payload === undefined) return;

  if (typeof payload === 'string') {
    for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(payload)) {
        throw new ForbiddenFieldError(path, `wartość pasuje do wzorca ${pattern.source}`);
      }
    }
    return;
  }

  if (typeof payload !== 'object') return;

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.includes(normalizeKey(key))) {
      throw new ForbiddenFieldError(`${path}.${key}`, 'nazwa pola jest na liście zakazanej');
    }
    assertNoForbiddenFields(value, `${path}.${key}`);
  }
}
