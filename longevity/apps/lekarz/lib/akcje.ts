'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { assertCan } from '@longevity/access';
import {
  odnotujNiestawiennictwo,
  odnotujOdbycie,
  przygotujPropozycje,
  zapiszNotatke,
  zatwierdz,
  odrzuc,
} from '@longevity/clinical';

import { biezacaSesja, COOKIE_LEKARZ } from './aktor.ts';
import { terminPoId, TERAZ, uczestnikPoId } from './dane.ts';
import {
  AUDIT,
  pobierzKonsultacje1,
  pobierzZlecenie,
  zapiszKonsultacje,
  zapiszNotatkeWStanie,
  zapiszZlecenie,
} from './stan.ts';

export async function wybierzLekarza(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_LEKARZ, String(formData.get('lekarzId') ?? ''), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });
  redirect('/grafik');
}

/**
 * Wspólna bramka wszystkich akcji lekarza.
 *
 * Autoryzacja jest tu, a nie przy przycisku: przycisk da się ominąć żądaniem,
 * a konsultacja należy do jednego lekarza, nie do „lekarzy w tej organizacji".
 */
async function zKonsultacja(formData: FormData) {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const konsultacja = pobierzKonsultacje1(String(formData.get('konsultacjaId') ?? ''));
  if (konsultacja === undefined) redirect('/grafik');

  assertCan(sesja.actor, 'prowadzenie_konsultacji', {
    kind: 'konsultacja',
    organizationId: konsultacja.organizationId,
    clinicianId: konsultacja.clinicianId,
    participantId: konsultacja.participantId,
  });

  const termin = terminPoId(konsultacja.terminId)!;
  return { sesja, konsultacja, termin };
}

export async function odnotujWizyte(formData: FormData): Promise<void> {
  const { konsultacja, termin } = await zKonsultacja(formData);
  const odbyta = String(formData.get('wynik')) === 'niestawiennictwo';

  zapiszKonsultacje(
    odbyta
      ? odnotujNiestawiennictwo(konsultacja, termin, TERAZ)
      : odnotujOdbycie(konsultacja, termin, TERAZ),
  );

  revalidatePath(`/konsultacje/${konsultacja.id}`);
  revalidatePath('/grafik');
}

export async function zapiszWnioski(formData: FormData): Promise<void> {
  const { sesja, konsultacja } = await zKonsultacja(formData);

  const notatka = zapiszNotatke(
    konsultacja,
    String(formData.get('tresc') ?? ''),
    String(formData.get('zalecenia') ?? '')
      .split('\n')
      .map((zalecenie) => zalecenie.trim()),
    sesja.lekarz.id,
    TERAZ,
  );

  zapiszNotatkeWStanie(notatka);
  revalidatePath(`/konsultacje/${konsultacja.id}`);
}

/** Propozycja zlecenia z reguł — do rozpatrzenia przez lekarza, nie do wydruku. */
export async function przygotujZlecenie(formData: FormData): Promise<void> {
  const { konsultacja } = await zKonsultacja(formData);
  const uczestnik = uczestnikPoId(konsultacja.participantId);
  if (uczestnik === undefined) redirect('/grafik');

  zapiszZlecenie(
    przygotujPropozycje(
      uczestnik.intake,
      uczestnik.ocena,
      konsultacja.id,
      konsultacja.participantId,
      TERAZ,
    ),
  );

  revalidatePath(`/konsultacje/${konsultacja.id}`);
}

export async function rozpatrzZlecenie(formData: FormData): Promise<void> {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const konsultacja = pobierzKonsultacje1(String(formData.get('konsultacjaId') ?? ''));
  if (konsultacja === undefined) redirect('/grafik');

  // Podpis pod zleceniem to osobne uprawnienie od prowadzenia konsultacji —
  // i osobne sprawdzenie, mimo że dziś obie reguły wskazują tego samego lekarza.
  assertCan(sesja.actor, 'zatwierdzenie_zlecenia_badan', {
    kind: 'konsultacja',
    organizationId: konsultacja.organizationId,
    clinicianId: konsultacja.clinicianId,
    participantId: konsultacja.participantId,
  });

  const zlecenie = pobierzZlecenie(konsultacja.id);
  if (zlecenie === undefined) redirect(`/konsultacje/${konsultacja.id}`);

  if (String(formData.get('decyzja')) === 'odrzuc') {
    zapiszZlecenie(
      odrzuc(zlecenie, sesja.lekarz.id, String(formData.get('uzasadnienie') ?? ''), TERAZ),
    );
  } else {
    const usun = zlecenie.pozycje
      .map((pozycja) => pozycja.badanie)
      .filter((badanie) => formData.get(`poz_${badanie}`) !== 'on');

    zapiszZlecenie(zatwierdz(zlecenie, { lekarzId: sesja.lekarz.id, teraz: TERAZ, usun }));
  }

  AUDIT.dopisz({
    actorRef: sesja.lekarz.id,
    subjectRef: konsultacja.subjectRef,
    akcja: 'zapis_danych_zdrowotnych',
    zasob: `zlecenie/${zlecenie.id}`,
    kontekst: { decyzja: String(formData.get('decyzja')) },
    at: TERAZ,
  });

  revalidatePath(`/konsultacje/${konsultacja.id}`);
}
