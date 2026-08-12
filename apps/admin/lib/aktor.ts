/**
 * Kto jest zalogowany — PROTOTYP.
 *
 * Rola pochodzi z ciasteczka ustawianego na stronie startowej. Prawdziwe
 * uwierzytelnianie administratora dochodzi razem z decyzją o hostingu
 * i musi obejmować drugi składnik — konto administracyjne z samym hasłem
 * jest w tym systemie najkrótszą drogą do wszystkiego, co da się zepsuć.
 *
 * Autoryzacja jest natomiast prawdziwa: każda operacja pyta @longevity/access.
 */

import { cookies } from 'next/headers';

import type { Actor } from '@longevity/access';

import { kontoPoId, type Konto } from './dane.ts';

export const COOKIE_KONTO = 'longevity_admin';

export interface Sesja {
  konto: Konto;
  actor: Actor;
}

export async function biezacaSesja(): Promise<Sesja | undefined> {
  const store = await cookies();
  const id = store.get(COOKIE_KONTO)?.value;
  if (id === undefined) return undefined;

  const konto = kontoPoId(id);
  if (konto === undefined) return undefined;

  return { konto, actor: konto.actor };
}
