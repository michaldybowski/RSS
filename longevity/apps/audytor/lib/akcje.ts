'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import {
  wydajCertyfikat,
  zamknijAudyt,
  zapiszUstalenia,
  type OcenaKryterium,
  type WpisUstalenia,
} from '@longevity/audit';

import { biezacaSesja, COOKIE_AUDYTOR } from './aktor.ts';
import { SCHEMAT, TERAZ } from './dane.ts';
import {
  dodajCertyfikat,
  kolejnyNumer,
  pobierzAudyt,
  pobierzUstalenia,
  zapiszAudyt,
  zapiszUstaleniaWStanie,
} from './stan.ts';

const OCENY: readonly OcenaKryterium[] = ['spelnione', 'czesciowo', 'niespelnione', 'nie_dotyczy'];

export async function wybierzAudytora(formData: FormData): Promise<void> {
  const id = String(formData.get('audytorId') ?? '');
  const store = await cookies();
  store.set(COOKIE_AUDYTOR, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/audyty');
}

export async function zapiszArkusz(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const audytId = String(formData.get('audytId') ?? '');
  const audyt = pobierzAudyt(audytId);
  if (audyt === undefined) redirect('/audyty');

  const wpisy: WpisUstalenia[] = [];

  for (const kryterium of SCHEMAT.kryteria) {
    const ocena = formData.get(`oc_${kryterium.id}`);
    if (typeof ocena !== 'string' || !OCENY.includes(ocena as OcenaKryterium)) continue;

    const uwaga = String(formData.get(`uw_${kryterium.id}`) ?? '').trim();
    // Prototyp: zaznaczenie zastępuje wgranie pliku. W produkcji trafia tu
    // klucz z prywatnego magazynu, nadany po faktycznym przesłaniu dowodu.
    const dowod = formData.get(`dw_${kryterium.id}`) === 'on';

    wpisy.push({
      kryteriumId: kryterium.id,
      ocena: ocena as OcenaKryterium,
      ...(uwaga !== '' ? { uwaga } : {}),
      ...(dowod ? { dowodKey: `dowody/${audytId}/${kryterium.id}` } : {}),
    });
  }

  zapiszUstaleniaWStanie(
    zapiszUstalenia(sesja.actor, audyt, pobierzUstalenia(), wpisy, TERAZ),
  );

  revalidatePath(`/audyty/${audytId}`);
}

export async function zamknij(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const audyt = pobierzAudyt(String(formData.get('audytId') ?? ''));
  if (audyt === undefined) redirect('/audyty');

  const wynik = zamknijAudyt(sesja.actor, SCHEMAT, audyt, pobierzUstalenia(), TERAZ);
  zapiszAudyt(wynik.audyt);
  revalidatePath(`/audyty/${audyt.id}`);
}

export async function wydaj(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const audyt = pobierzAudyt(String(formData.get('audytId') ?? ''));
  if (audyt === undefined) redirect('/audyty');

  dodajCertyfikat(
    wydajCertyfikat(SCHEMAT, audyt, pobierzUstalenia(), kolejnyNumer(), TERAZ),
  );

  revalidatePath(`/audyty/${audyt.id}`);
  revalidatePath('/rejestr');
}
