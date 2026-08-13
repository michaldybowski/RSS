import { blad } from '../../../lib/odpowiedzi.ts';

/**
 * Ścieżka, której nie ma.
 *
 * Bez tego pliku Next odpowiada stroną HTML z własnym szablonem 404. Klient
 * mobilny wywołuje `response.json()` na każdej odpowiedzi i dostałby wtedy
 * błąd składni zamiast kodu błędu — literówka w adresie wyglądałaby jak awaria
 * serwera. Kontrakt błędu musi obowiązywać także tam, gdzie nic nie ma.
 *
 * Odpowiedź nie zdradza, czy ścieżka istnieje dla innej roli — 404 jest jedno
 * dla wszystkich.
 */
function nieznana(request: Request): Response {
  const { pathname } = new URL(request.url);

  return blad('nie_znaleziono', `Nie ma punktu końcowego ${request.method} ${pathname}.`, {
    wersja: 'v1',
  });
}

export const GET = nieznana;
export const POST = nieznana;
export const PUT = nieznana;
export const PATCH = nieznana;
export const DELETE = nieznana;
