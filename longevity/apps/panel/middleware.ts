import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_NAME } from './lib/cookie.ts';

/**
 * Ustanowienie sesji przy pierwszym żądaniu.
 *
 * Ciasteczko ustawione wewnątrz akcji serwerowej nie jest widoczne dla
 * renderowania, które następuje w tym samym przebiegu — strona tworzyłaby
 * wtedy drugą, pustą sesję i gubiła stan zapisany przez akcję. Middleware
 * ustawia identyfikator zanim cokolwiek się wyrenderuje, i dokłada go także
 * do nagłówków żądania, żeby bieżące renderowanie już go widziało.
 */
export function middleware(request: NextRequest): NextResponse {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  if (existing !== undefined) return NextResponse.next();

  const id = globalThis.crypto.randomUUID();
  request.cookies.set(COOKIE_NAME, id);

  const response = NextResponse.next({ request });
  response.cookies.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
