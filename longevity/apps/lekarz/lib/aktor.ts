import { cookies } from 'next/headers';

import type { Actor } from '@longevity/access';

import { lekarzPoId, type Lekarz } from './dane.ts';

export const COOKIE_LEKARZ = 'longevity_lekarz';

export interface Sesja {
  lekarz: Lekarz;
  actor: Actor;
}

/** Uwierzytelnianie prototypowe. Autoryzacja prawdziwa — @longevity/access. */
export async function biezacaSesja(): Promise<Sesja | undefined> {
  const store = await cookies();
  const id = store.get(COOKIE_LEKARZ)?.value;
  if (id === undefined) return undefined;

  const lekarz = lekarzPoId(id);
  return lekarz === undefined ? undefined : { lekarz, actor: lekarz.actor };
}
