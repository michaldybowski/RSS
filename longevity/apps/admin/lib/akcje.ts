'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { AccessDeniedError } from '@longevity/access';
import { BrakPotwierdzeniaZapowiedziError, type SourceCode } from '@longevity/notion-sync';

import { biezacaSesja, COOKIE_KONTO } from './aktor.ts';
import { OSTATNIA_SYNCHRONIZACJA } from './dane.ts';
import {
  odnotujRealizacjePozaPanelem,
  przygotujPakietDoOdbioru,
  uruchomSynchronizacje,
  wykonajWniosekUsuniecia,
  wykonajZadaniaRetencyjne,
} from './operacje.ts';
import { potwierdz, pobierzPotwierdzone, trybZOpisu, zapiszBlad } from './stan.ts';

export async function wybierzKonto(formData: FormData): Promise<void> {
  const id = String(formData.get('kontoId') ?? '');
  const store = await cookies();
  store.set(COOKIE_KONTO, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/synchronizacja');
}

/**
 * Potwierdzenie zapowiedzi. Ustawiane dopiero po jej wyświetleniu — checkbox
 * na stronie bez zapowiedzi byłby potwierdzaniem czegoś, czego się nie widziało.
 */
export async function potwierdzZapowiedz(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  for (const source of String(formData.get('zrodla') ?? '').split(',').filter(Boolean)) {
    potwierdz(source as SourceCode);
  }

  revalidatePath('/synchronizacja');
}

export async function synchronizuj(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const zrodla = String(formData.get('zrodla') ?? '')
    .split(',')
    .filter(Boolean) as SourceCode[];
  const mode = trybZOpisu(String(formData.get('tryb') ?? 'pelna'), OSTATNIA_SYNCHRONIZACJA);

  try {
    await uruchomSynchronizacje(sesja.actor, mode, zrodla, pobierzPotwierdzone());
  } catch (blad) {
    // Odmowa i brak potwierdzenia to nie awarie — to działające zabezpieczenia.
    // Administrator ma zobaczyć powód, a nie stronę błędu Next.js.
    if (blad instanceof BrakPotwierdzeniaZapowiedziError || blad instanceof AccessDeniedError) {
      zapiszBlad(blad.message);
      revalidatePath('/synchronizacja');
      return;
    }
    throw blad;
  }

  revalidatePath('/synchronizacja');
}

export async function przygotujPakiet(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  przygotujPakietDoOdbioru(sesja.actor, String(formData.get('wniosekId') ?? ''));
  revalidatePath('/rodo');
}

export async function usunDane(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  wykonajWniosekUsuniecia(sesja.actor, String(formData.get('wniosekId') ?? ''));
  revalidatePath('/rodo');
  revalidatePath('/retencja');
}

export async function odnotujRealizacje(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  odnotujRealizacjePozaPanelem(sesja.actor, String(formData.get('wniosekId') ?? ''));
  revalidatePath('/rodo');
}

export async function wykonajRetencjeDla(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  wykonajZadaniaRetencyjne(sesja.actor, String(formData.get('subjectRef') ?? ''));
  revalidatePath('/retencja');
}
