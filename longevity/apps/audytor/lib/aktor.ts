import { cookies } from 'next/headers';

import type { Actor } from '@longevity/access';

import { audytorPoId } from './dane.ts';

export const COOKIE_AUDYTOR = 'longevity_audytor';

export interface Sesja {
  actor: Actor;
  audytorId: string;
  imie: string;
}

/** Uwierzytelnianie prototypowe; autoryzacja prawdziwa — przez @longevity/access. */
export async function biezacaSesja(): Promise<Sesja | undefined> {
  const store = await cookies();
  const id = store.get(COOKIE_AUDYTOR)?.value;
  if (id === undefined) return undefined;

  const audytor = audytorPoId(id);
  if (audytor === undefined) return undefined;

  return {
    audytorId: audytor.id,
    imie: audytor.imie,
    actor: {
      userId: audytor.id,
      grants: [{ role: 'audytor', organizationId: audytor.organizationId }],
    },
  };
}
