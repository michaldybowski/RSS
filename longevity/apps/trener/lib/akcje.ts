'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { odnotujObecnosc, type WpisObecnosci } from '@longevity/workshops';

import { biezacaSesja, COOKIE_TRENER } from './aktor.ts';
import { TERAZ, warsztatPoId } from './dane.ts';
import { pobierzObecnosci, pobierzZapisy, zapiszObecnosci } from './stan.ts';

export async function wybierzTrenera(formData: FormData): Promise<void> {
  const trenerId = String(formData.get('trenerId') ?? '');
  const store = await cookies();
  store.set(COOKIE_TRENER, trenerId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/warsztaty');
}

/**
 * Zapis listy obecności.
 *
 * Autoryzacja i kontrola czasu są w pakiecie `@longevity/workshops` —
 * akcja tylko przekłada formularz na wpisy. Gdyby sprawdzenie „czy to mój
 * warsztat" siedziało tutaj, każda kolejna ścieżka zapisu musiałaby je
 * powtórzyć i pierwsza, która zapomni, otworzy dziurę.
 */
export async function zapiszListeObecnosci(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const warsztatId = String(formData.get('warsztatId') ?? '');
  const warsztat = warsztatPoId(warsztatId);
  if (warsztat === undefined) redirect('/warsztaty');

  const wpisy: WpisObecnosci[] = [];
  for (const [klucz, wartosc] of formData.entries()) {
    if (!klucz.startsWith('ob_')) continue;
    if (wartosc !== 'obecny' && wartosc !== 'nieobecny') continue;
    wpisy.push({ participantId: klucz.slice(3), obecny: wartosc === 'obecny' });
  }

  const wynik = odnotujObecnosc(
    sesja.actor,
    warsztat,
    pobierzZapisy().zapisy,
    pobierzObecnosci(),
    wpisy,
    TERAZ,
  );

  zapiszObecnosci(
    wynik.obecnosci,
    wynik.poprawione.map((participantId) => ({
      warsztatId,
      participantId,
      trenerId: sesja.trenerId,
      at: TERAZ,
    })),
  );

  revalidatePath(`/warsztaty/${warsztatId}`);
}
