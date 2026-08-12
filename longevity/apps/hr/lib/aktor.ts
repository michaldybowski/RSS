/**
 * Kto jest zalogowany — PROTOTYP.
 *
 * Prawdziwe uwierzytelnianie dochodzi wraz z decyzją o hostingu. Tutaj rola
 * pochodzi z ciasteczka ustawianego na stronie startowej, żeby dało się
 * pokazać rozdział między organizacjami bez budowania logowania.
 *
 * Autoryzacja jest natomiast prawdziwa: każda strona pyta @longevity/access
 * o zgodę przed sięgnięciem po dane.
 */

import { cookies } from 'next/headers';

import type { Actor } from '@longevity/access';

export const COOKIE_AKTOR = 'longevity_hr_aktor';

export interface Sesja {
  actor: Actor;
  organizationId: string;
}

export async function biezacaSesja(): Promise<Sesja | undefined> {
  const store = await cookies();
  const organizationId = store.get(COOKIE_AKTOR)?.value;
  if (organizationId === undefined || organizationId === '') return undefined;

  return {
    organizationId,
    actor: {
      userId: `hr-${organizationId}`,
      grants: [{ role: 'hr', organizationId }],
    },
  };
}
