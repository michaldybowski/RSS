import { cookies } from 'next/headers';

import type { Actor } from '@longevity/access';

import { trenerPoId } from './dane.ts';

export const COOKIE_TRENER = 'longevity_trener';

export interface Sesja {
  actor: Actor;
  trenerId: string;
  imie: string;
  organizationId: string;
}

/**
 * Uwierzytelnianie prototypowe — rola z ciasteczka. Autoryzacja jest
 * prawdziwa: `@longevity/access` sprawdza przy każdej operacji, czy to ten
 * trener i ten warsztat.
 */
export async function biezacaSesja(): Promise<Sesja | undefined> {
  const store = await cookies();
  const trenerId = store.get(COOKIE_TRENER)?.value;
  if (trenerId === undefined) return undefined;

  const trener = trenerPoId(trenerId);
  if (trener === undefined) return undefined;

  return {
    trenerId: trener.id,
    imie: trener.imie,
    organizationId: trener.organizationId,
    actor: {
      userId: trener.id,
      grants: [{ role: 'trener', organizationId: trener.organizationId }],
    },
  };
}
