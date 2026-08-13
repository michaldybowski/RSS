/**
 * Kontrakt odpowiedzi API.
 *
 * Trzy rzeczy, które muszą być takie same we wszystkich punktach końcowych,
 * bo klient mobilny nie ma jak zgadywać:
 *
 * 1. **Kształt błędu.** Zawsze `{ blad: { kod, komunikat } }`. Kod jest stały
 *    i nadaje się do rozgałęzienia w kliencie; komunikat jest po polsku
 *    i nadaje się do pokazania człowiekowi.
 *
 * 2. **Brak wycieku wewnętrznych szczegółów.** Komunikat nigdy nie zawiera
 *    stosu wywołań ani treści wyjątku, którego nie napisaliśmy sami.
 *    Wyjątek nieprzewidziany to zawsze `blad_wewnetrzny` i wpis w logu serwera.
 *
 * 3. **`Cache-Control: no-store` na wszystkim, co dotyka danych zdrowotnych.**
 *    Odpowiedź z Health Score w pamięci podręcznej proxy albo przeglądarki
 *    jest wyciekiem danych klasy K1 bez żadnego włamania.
 */

export type KodBledu =
  | 'brak_uwierzytelnienia'
  | 'brak_uprawnien'
  | 'brak_zgody'
  | 'nie_znaleziono'
  | 'bledne_zadanie'
  | 'konflikt'
  | 'odrzucone_dane'
  | 'blad_wewnetrzny';

const STATUSY: Readonly<Record<KodBledu, number>> = {
  brak_uwierzytelnienia: 401,
  brak_uprawnien: 403,
  brak_zgody: 403,
  nie_znaleziono: 404,
  bledne_zadanie: 400,
  // Konflikt jest osobny od błędnego żądania celowo. Zajęty termin oznacza
  // dla klienta mobilnego „odśwież listę i wybierz inny", a nie „popraw
  // żądanie" — z jednym kodem 400 nie dałoby się tych dwóch rozróżnić.
  konflikt: 409,
  odrzucone_dane: 422,
  blad_wewnetrzny: 500,
};

export interface CialoBledu {
  blad: {
    kod: KodBledu;
    komunikat: string;
    /** Dodatkowy kontekst — wyłącznie dane, które klient ma prawo zobaczyć. */
    szczegoly?: Readonly<Record<string, unknown>>;
  };
}

export const NAGLOWKI_WRAZLIWE: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

const NAGLOWKI_ZWYKLE: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export interface OpcjeOdpowiedzi {
  status?: number;
  /** Czy odpowiedź niesie dane zdrowotne — wtedy nagłówki są ostrzejsze. */
  wrazliwe?: boolean;
}

export function ok(dane: unknown, opcje: OpcjeOdpowiedzi = {}): Response {
  return new Response(JSON.stringify(dane), {
    status: opcje.status ?? 200,
    headers: opcje.wrazliwe === true ? NAGLOWKI_WRAZLIWE : NAGLOWKI_ZWYKLE,
  });
}

export function blad(
  kod: KodBledu,
  komunikat: string,
  szczegoly?: Readonly<Record<string, unknown>>,
): Response {
  const cialo: CialoBledu = {
    blad: { kod, komunikat, ...(szczegoly !== undefined ? { szczegoly } : {}) },
  };

  return new Response(JSON.stringify(cialo), {
    status: STATUSY[kod],
    headers: NAGLOWKI_ZWYKLE,
  });
}

/**
 * Opakowanie handlera. Wyjątek, którego nie przewidzieliśmy, wychodzi jako 500
 * bez treści — a nie jako komunikat biblioteki z nazwą kolumny w bazie.
 */
export function obsluz(handler: () => Promise<Response> | Response): Promise<Response> {
  return Promise.resolve()
    .then(handler)
    .catch((powod: unknown) => {
      console.error('[api] nieobsłużony wyjątek', powod);
      return blad(
        'blad_wewnetrzny',
        'Wystąpił błąd po stronie serwera. Zdarzenie zostało odnotowane.',
      );
    });
}

/** Odczyt liczby z zapytania z jawnym błędem zamiast cichego NaN. */
export function liczbaZZapytania(wartosc: string | null, pole: string): number {
  const liczba = Number(wartosc);
  if (wartosc === null || wartosc.trim() === '' || !Number.isFinite(liczba)) {
    throw new BledneZadanieError(`Pole "${pole}" musi być liczbą.`);
  }
  return liczba;
}

export class BledneZadanieError extends Error {
  constructor(komunikat: string) {
    super(komunikat);
    this.name = 'BledneZadanieError';
  }
}

/**
 * Jedno miejsce, w którym błąd domenowy zamienia się w kod HTTP.
 *
 * Rozsypanie tego po punktach końcowych kończy się tym, że ta sama odmowa
 * jest raz 403, a raz 400 — i klient mobilny musi znać oba warianty.
 * Wyjątek spoza tej listy nie jest tłumaczony: leci dalej i kończy jako 500,
 * bo jego treści nie napisaliśmy z myślą o pokazaniu jej użytkownikowi.
 */
export function zBleduDomenowego(powod: unknown): Response | undefined {
  if (!(powod instanceof Error)) return undefined;

  switch (powod.name) {
    case 'AccessDeniedError':
      return blad('brak_uprawnien', powod.message);

    case 'ConsentRequiredError':
      return blad('brak_zgody', powod.message);

    case 'WyzwanieNiedozwoloneError':
    case 'TerminPilnyNiedostepnyError':
      // Odmowa kwalifikacji — do wyzwania albo do puli pilnej — jest decyzją
      // o uprawnieniu do operacji, a nie błędem danych: dlatego 403, nie 422.
      return blad('brak_uprawnien', powod.message);

    case 'PomiarPozaOknemError':
    case 'PomiarPozaZakresemError':
    case 'PomiarPrzedStartemError':
      return blad('odrzucone_dane', powod.message);

    case 'SprawdzianNiezaliczonyError':
      // Żądanie było poprawne i uprawnione; nie przeszła treść odpowiedzi.
      return blad('odrzucone_dane', powod.message);

    case 'TerminZajetyError':
    case 'ZlyStatusKonsultacjiError':
    case 'ZlyStatusZamowieniaError':
    case 'NieaktywnyPartnerError':
      // Stan zasobu po stronie serwera rozminął się z tym, co widział klient.
      return blad('konflikt', powod.message);

    case 'BledneZadanieError':
    case 'TerminMinalError':
    case 'WymaganySprawdzianError':
      return blad('bledne_zadanie', powod.message);

    case 'UnknownConsentError':
      return blad('nie_znaleziono', powod.message);

    default:
      return undefined;
  }
}
